import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db.js";
import { createService } from "./service.js";
import { createAuth } from "./auth.js";
import { createPipeline } from "./pipeline.js";
import { readRepositoryLibrary, syncLibrary } from "./library.js";
import { mcpHandler } from "./mcp.js";
import { fail } from "./schemas.js";
import { repositorySchema, branchSchema } from "./projects.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function createApp(config, options = {}) {
  const auth = createAuth(config);
  const db = options.db ?? openDatabase(config.DATA_DIR || path.join(root, "data"));
  const service = createService(db, options);
  const pipeline = createPipeline(service, config, { analyze: options.analyze });
  const app = express();
  // Railway edge proxy adds one trusted hop; app is designed for one replica.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"], connectSrc: ["'self'"], frameAncestors: ["'none'"] } } }));
  app.use(express.json({ limit: "128kb" }));
  const appOrigin = config.APP_URL ? new URL(config.APP_URL).origin : null;
  if (config.NODE_ENV === "production" && (!appOrigin || !appOrigin.startsWith("https://"))) throw new Error("Production requires an https APP_URL.");
  app.use((req, res, next) => {
    if (req.headers.origin && req.headers.origin !== appOrigin &&
      !(config.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):(3000|5173)$/.test(req.headers.origin))) {
      return res.status(403).json({ error: "Origin không được phép." });
    }
    next();
  });
  app.get("/health", (req, res) => {
    try { db.prepare("SELECT 1").get(); res.json({ ok: true, policyVersion: "risk-v2", runnerProtocol: "execution-failure-v1", releaseProtocol: "release-v1", browserProtocol: "github-browser-v1", aiPolicyVersion: "economy-v1", projectProtocol:"multi-project-v1" }); } catch { res.status(503).json({ ok: false }); }
  });
  const limiter = (limit, windowMs = 60000) => rateLimit({ limit, windowMs, standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." } });
  app.post("/api/auth/login", limiter(10, 15 * 60000), (req, res) => {
    const { name, password } = z.object({ name: z.string().trim().min(2).max(80), password: z.string().min(1).max(500) }).parse(req.body);
    res.json({ user: auth.login(name, password, res) });
  });
  app.get("/api/auth/me", (req, res) => { const user = auth.session(req); if (!user) return res.status(401).json({ error: "Vui lòng đăng nhập." }); res.json({ user }); });
  app.use("/api", auth.require, limiter(180));
  app.post("/api/auth/logout", (req, res) => { auth.logout(res); res.json({ ok: true }); });
  app.get("/api/config", (req, res) => res.json({ aiConfigured: Boolean(config.OPENAI_API_KEY), model: config.OPENAI_MODEL || "gpt-4.1-mini",
    aiUsage: req.user.role === "admin" ? service.aiLedger.summary(config) : undefined, policyVersion: "risk-v2", runner: service.runnerStatus(), mcpUrl: (config.APP_URL || "http://localhost:3000").replace(/\/$/, "") + "/mcp", project: service.project("writer-studio") }));
  app.get("/api/ai/usage", auth.admin, (req, res) => res.json(service.aiLedger.summary(config)));
  app.get("/api/requests", (req, res) => res.json({ requests: service.list() }));
  app.post("/api/requests", limiter(20), (req, res) => {
    const created = service.create(req.body, req.user.name, {deduplicate:true});
    if (created.duplicate) return res.status(200).json(created);
    res.status(201).json(pipeline.enqueue(created.id, req.user.name));
  });
  app.get("/api/requests/:id", (req, res) => res.json({ request: service.get(req.params.id), events: service.events(req.params.id) }));
  const editable = (req, res, next) => {
    // Members can submit feedback; contract preparation and execution authority remain admin-only.
    if (req.user.role !== "admin") return res.status(403).json({ error: "Chỉ admin được chuẩn bị và duyệt coding request." });
    next();
  };
  app.put("/api/requests/:id/draft", editable, (req, res) => res.json(service.edit(req.params.id, req.body, req.user.name)));
  app.post("/api/requests/:id/submit", editable, (req, res) => res.json(service.submit(req.params.id, req.body, req.user.name, { confirmHighRisk: req.body.confirmHighRisk === true })));
  app.post("/api/requests/:id/clarify", (req, res) => {
    const r = service.get(req.params.id);
    if (req.user.role !== "admin" && r.author !== req.user.name) fail("Chỉ tác giả/admin được bổ sung feedback.", 403);
    const { note } = z.object({ note: z.string().trim().min(5).max(4000) }).parse(req.body);
    service.clarify(req.params.id, note, req.user.name);
    res.json(pipeline.enqueue(req.params.id, req.user.name));
  });
  app.post(["/api/requests/:id/analyze", "/api/requests/:id/prepare"], editable, limiter(6), (req, res) => {
    res.status(202).json(pipeline.enqueue(req.params.id, req.user.name));
  });
  app.post("/api/requests/:id/retry", limiter(6), (req, res) => {
    const r = service.get(req.params.id);
    if (req.user.role !== "admin" && r.author !== req.user.name) fail("Chỉ tác giả/admin được thử lại.", 403);
    if (req.user.role !== "admin" && r.draft) fail("Kế hoạch đã phân loại; admin cần kiểm tra trước khi xử lý lại.", 403);
    res.status(202).json(pipeline.enqueue(r.id, req.user.name));
  });
  app.post("/api/requests/:id/retry-execution", auth.admin, (req, res) => res.json(service.retryExecution(req.params.id, req.user.name)));
  app.post("/api/requests/:id/approve", auth.admin, (req, res) => {
    const options = z.object({ confirmHighRisk: z.boolean().default(false), expectedRevision: z.string().optional() }).parse(req.body ?? {});
    res.json(service.approve(req.params.id, req.user.name, options));
  });
  app.post("/api/requests/:id/reject", auth.admin, (req, res) => {
    const { note } = z.object({ note: z.string().min(5).max(1000) }).parse(req.body); res.json(service.reject(req.params.id, note, req.user.name));
  });
  app.post("/api/requests/:id/release", auth.admin, (req, res) => {
    const { note, agentStopped } = z.object({ note: z.string().min(10).max(1000), agentStopped: z.literal(true) }).parse(req.body);
    res.json(service.release(req.params.id, req.user.name, note));
  });
  app.post("/api/requests/:id/verification/manual",auth.admin,(req,res)=>res.json(service.supplementVerification(req.params.id,req.body,req.user.name)));
  app.post("/api/requests/:id/verification/retry",auth.admin,(req,res)=>res.json(service.queueVerification(req.params.id,req.user.name)));
  app.post("/api/requests/:id/accept", auth.admin, (req, res) => res.json(service.accept(req.params.id, req.user.name, { confirmHighRisk: req.body?.confirmHighRisk === true })));
  app.post("/api/requests/:id/publish", auth.admin, (req, res) => res.json(service.publish(req.params.id, req.user.name, { confirmHighRisk: req.body?.confirmHighRisk === true })));
  app.post("/api/requests/:id/rebase", auth.admin, (req, res) => res.json(service.rebase(req.params.id, req.user.name)));
  app.get("/api/projects", (req,res)=>res.json({projects:service.projects()}));
  app.post("/api/projects", auth.admin, limiter(6,10*60000), async(req,res)=>{
    const input=z.object({repository:repositorySchema,branch:branchSchema.optional(),runnerEnabled:z.boolean().default(false)}).strict().parse(req.body);
    if(service.projects().some(p=>p.repository.toLowerCase()===input.repository.toLowerCase()))fail("Repository đã kết nối. Hãy đồng bộ project hiện có.",400);
    const lib=await readRepositoryLibrary(input.repository,input.branch,config.GITHUB_TOKEN);
    if(service.projects().some(p=>p.id===lib.projectId||p.repository.toLowerCase()===lib.repository.toLowerCase()))fail("Project/repository đã kết nối. Hãy đồng bộ project hiện có.",400);
    service.addLibrary(lib);res.status(201).json(service.updateProject(lib.projectId,{runnerEnabled:input.runnerEnabled}));
  });
  app.patch("/api/projects/:id", auth.admin, (req,res)=>res.json(service.updateProject(req.params.id,req.body)));
  app.get("/api/library", (req, res) => res.json(service.currentLibrary(req.query.projectId)));
  const syncing = new Set();
  app.post("/api/library/sync", auth.admin, limiter(3, 10 * 60000), async (req, res) => {
    const id=req.body?.projectId||'writer-studio'; service.project(id);
    if(syncing.has(id))fail("Library của project đang đồng bộ."); syncing.add(id);
    try { res.json(await syncLibrary(service, config.GITHUB_TOKEN,id)); } finally { syncing.delete(id); }
  });
  // Publishing authority is issued by admin acceptance, never by an MCP approval/merge tool.
  app.get("/runner/projects",auth.mcp,limiter(60),(req,res)=>res.json({projects:service.projects()}));
  app.get("/runner/verifications",auth.mcp,limiter(60),(req,res)=>res.json({requests:service.verifications()}));
  app.post("/runner/verifications/:id/claim",auth.mcp,limiter(60),(req,res)=>res.json(service.claimVerification(req.params.id,"mac-browser-ci")));
  app.post("/runner/verifications/:id/report",auth.mcp,limiter(60),(req,res)=>{
    const {verificationToken,update}=z.object({verificationToken:z.string().regex(/^[a-f0-9]{64}$/),update:z.object({phase:z.enum(["ci","passed","failed"]),note:z.string().min(5).max(2000),prNumber:z.number().int().positive().optional(),prUrl:z.string().url().optional(),evidenceUrl:z.string().url().optional()})}).parse(req.body);
    res.json(service.reportVerification(req.params.id,verificationToken,update));
  });
  app.get("/runner/releases", auth.mcp, limiter(60), (req, res) => res.json({ requests: service.releases() }));
  app.post("/runner/releases/:id/claim", auth.mcp, limiter(60), (req, res) => res.json(service.claimRelease(req.params.id, "mac-publisher")));
  app.post("/runner/releases/:id/report", auth.mcp, limiter(60), async (req, res) => {
    const { releaseToken, update } = z.object({ releaseToken: z.string().regex(/^[a-f0-9]{64}$/), update: z.record(z.unknown()) }).parse(req.body);
    const result = service.updateRelease(req.params.id, releaseToken, update);
    res.json(result);
    if (result.release.phase === "deployed") {
      try { await syncLibrary(service, config.GITHUB_TOKEN,result.projectId); service.releaseLibrarySync(req.params.id, true); }
      catch { service.releaseLibrarySync(req.params.id, false); }
    }
  });
  app.get("/runner/status", auth.mcp, limiter(30), (req, res) => res.json(service.runnerStatus()));
  app.post("/runner/status", auth.mcp, limiter(30), (req, res) => {
    const input = z.object({ phase: z.enum(["idle", "running"]), requestId: z.string().regex(/^REQ-[A-F0-9]{8}$/).nullable().default(null), projects:z.array(z.object({projectId:z.string().max(64),repository:repositorySchema,repoReady:z.boolean(),note:z.string().max(300).optional()})).max(50).optional() }).parse(req.body);
    if (input.phase === "running" && !input.requestId) fail("Running status requires a request.", 400);
    res.json(service.reportRunner(input));
  });
  app.post("/mcp", auth.mcp, limiter(120), mcpHandler(service));
  app.all("/mcp", auth.mcp, (req, res) => res.status(405).set("Allow", "POST").json({ error: "Stateless MCP endpoint supports POST only." }));
  app.use("/api", (req, res) => res.status(404).json({ error: "API không tồn tại." }));
  app.use(express.static(path.join(root, "dist"), { index: false }));
  app.get("/{*path}", (req, res) => res.sendFile(path.join(root, "dist/index.html")));
  app.use((e, req, res, next) => {
    if (res.headersSent) return next(e);
    const status = e instanceof ZodError ? 400 : e.status || (e.name === "TimeoutError" ? 504 : 500);
    const error = e instanceof ZodError ? e.issues.map(i => i.path.join(".") + ": " + i.message).join("; ") :
      status >= 500 && e.status === undefined ? "Không xử lý được yêu cầu. Dữ liệu đã lưu vẫn được giữ." : e.message;
    res.status(status).json({ error });
  });
  return { app, db, service, pipeline };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app, db, pipeline } = createApp(process.env);
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, "0.0.0.0", () => { pipeline.start(); console.log("AI Agent Lab listening on port " + port); });
  const stop = async () => { await pipeline.stop(); server.close(() => db.close()); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
}

