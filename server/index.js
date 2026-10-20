import {createDelivery} from './delivery.js';
import {planReport} from './local-planning.js';
import { ciSetupOptions, ciSetupUpdate } from "./ci-setup.js";
import { validateCiUpdate, ciRetryHead } from "./ci-validation.js";
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
  const delivery=createDelivery(service,config);
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
    try { db.prepare("SELECT 1").get(); res.json({ ok: true, policyVersion: "risk-v2", runnerProtocol: "execution-failure-v1", releaseProtocol: "release-v1", browserProtocol: "github-browser-v1", aiPolicyVersion: "economy-v1", projectProtocol:"multi-project-v1", ciSetupProtocol:"ci-setup-v1",planningProtocol:"local-planning-v1",memoryProtocol:"verified-memory-v1",deliveryProtocol:"single-approval-v1",recheckProtocol:"artifact-recheck-v1" }); } catch { res.status(503).json({ ok: false }); }
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
  app.get("/api/config", (req, res) => res.json({ aiConfigured: config.LAB_PLANNING_MODE!=="server"||Boolean(config.OPENAI_API_KEY), planningMode:config.LAB_PLANNING_MODE==="server"?"server":"codex-local", model: config.LAB_PLANNING_MODE==="server"?(config.OPENAI_MODEL||"gpt-4.1-mini"):"Codex trên Mac",
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
  app.post("/api/requests/:id/submit", editable, (req, res) => res.json(service.submit(req.params.id, req.body, req.user.name, { confirmHighRisk: req.body.confirmHighRisk === true, authorizeRelease: req.body.authorizeRelease === true })));
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
    const options = z.object({ confirmHighRisk: z.boolean().default(false), authorizeRelease:z.boolean().default(false), expectedRevision: z.string().optional() }).parse(req.body ?? {});
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
  app.post('/api/requests/:id/checks/retry',auth.admin,(req,res)=>{const b=z.object({expectedResultRevision:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body);res.json(service.rechecks.queue(req.params.id,req.user.name,b.expectedResultRevision));});
  app.post('/api/requests/:id/checks/release',auth.admin,(req,res)=>res.json(service.rechecks.release(req.params.id,req.user.name,req.body?.workerStopped===true)));
  app.post("/api/requests/:id/rebase", auth.admin, (req, res) => res.json(service.rebase(req.params.id, req.user.name)));
  app.get("/api/projects", (req,res)=>res.json({projects:service.projects()}));
  app.post("/api/projects", auth.admin, limiter(6,10*60000), async(req,res)=>{
    const input=z.object({repository:repositorySchema,branch:branchSchema.optional(),runnerEnabled:z.boolean().default(false),setupCi:z.boolean().default(false),autoMergeCi:z.boolean().default(false)}).strict().parse(req.body);
    if(input.setupCi&&!input.runnerEnabled)fail("Cần bật Mac để tự thiết lập CI.",400);
    if(service.projects().some(p=>p.repository.toLowerCase()===input.repository.toLowerCase()))fail("Repository đã kết nối. Hãy đồng bộ project hiện có.",400);
    const lib=await readRepositoryLibrary(input.repository,input.branch,config.GITHUB_TOKEN);
    if(service.projects().some(p=>p.id===lib.projectId||p.repository.toLowerCase()===lib.repository.toLowerCase()))fail("Project/repository đã kết nối. Hãy đồng bộ project hiện có.",400);
    service.addLibrary(lib);service.updateProject(lib.projectId,{runnerEnabled:input.runnerEnabled});if(input.setupCi)service.ciSetup.enqueue(lib.projectId,{autoMerge:input.autoMergeCi},req.user.name);res.status(201).json(service.project(lib.projectId));
  });
  app.patch("/api/projects/:id", auth.admin, (req,res)=>res.json(service.updateProject(req.params.id,req.body)));
  app.post("/api/projects/:id/ci/setup",auth.admin,limiter(6,600000),async(req,res)=>{
    const options=ciSetupOptions.parse(req.body||{});service.project(req.params.id);
    const previous=service.ciSetup.get(req.params.id);
    if(!previous||['ready','failed'].includes(previous.phase)){if(previous?.lease)fail('Worker cũ còn giữ claim.');await syncLibrary(service,config.GITHUB_TOKEN,req.params.id);}
    res.status(202).json(service.ciSetup.enqueue(req.params.id,options,req.user.name));
  });
  app.post("/api/projects/:id/ci/complete",auth.admin,(req,res)=>res.json(service.ciSetup.continue(req.params.id,req.user.name)));
  app.post("/api/projects/:id/ci/retry",auth.admin,async(req,res)=>{const {confirmStopped}=z.object({confirmStopped:z.boolean().default(false)}).parse(req.body||{}),job=service.ciSetup.get(req.params.id);const head=await ciRetryHead(service.project(req.params.id),job,config.GITHUB_TOKEN);res.json(service.ciSetup.retry(req.params.id,confirmStopped,head));});
  app.get("/api/library", (req, res) => res.json(service.currentLibrary(req.query.projectId)));
  const syncing = new Set();
  app.post("/api/library/sync", auth.admin, limiter(3, 10 * 60000), async (req, res) => {
    const id=req.body?.projectId||'writer-studio'; service.project(id);
    if(syncing.has(id))fail("Library của project đang đồng bộ."); syncing.add(id);
    try { res.json(await syncLibrary(service, config.GITHUB_TOKEN,id)); } finally { syncing.delete(id); }
  });
  // Publishing authority is issued by admin acceptance, never by an MCP approval/merge tool.
  app.get('/runner/ci-setups',auth.mcp,limiter(60),(req,res)=>res.json({jobs:service.ciSetup.queue()}));
  const ciClaim=z.object({jobId:z.string().uuid(),setupToken:z.string().regex(/^[a-f0-9]{64}$/)});
  app.post('/runner/ci-setups/:id/claim',auth.mcp,(req,res)=>res.json(service.ciSetup.claim(req.params.id,z.object({jobId:z.string().uuid()}).parse(req.body).jobId)));
  app.post('/runner/ci-setups/:id/heartbeat',auth.mcp,(req,res)=>{const b=ciClaim.parse(req.body);const result=service.ciSetup.heartbeat(req.params.id,b.jobId,b.setupToken);service.reportRunner({phase:"idle",requestId:null});res.json(result);});
  app.post('/runner/ci-setups/:id/report',auth.mcp,async(req,res)=>{
    const b=ciClaim.extend({update:ciSetupUpdate}).parse(req.body),project=service.project(req.params.id),job=service.ciSetup.verify(req.params.id,b.jobId,b.setupToken);
    const evidence=b.update.phase!=='failed'?await validateCiUpdate(project,job,b.update,config.GITHUB_TOKEN):null;
    if(b.update.phase==='ready'){const lib=await syncLibrary(service,config.GITHUB_TOKEN,project.id);if(lib.sourceCommit!==(b.update.commit||job.commit))fail('Branch đổi trong khi đồng bộ; chưa đánh dấu CI ready.');}
    res.json(service.ciSetup.report(project.id,b.jobId,b.setupToken,b.update,evidence));
  });
  app.get('/api/projects/:id/memory',auth.admin,(req,res)=>res.json({entries:service.memory.list(req.params.id),suggestions:service.memory.suggestions(req.params.id),planning:{usedToday:service.localPlanning.budget(req.params.id),dailyLimit:20,maxAttemptsPerFeedback:3}}));
  app.patch('/api/projects/:id/memory/:memoryId',auth.admin,(req,res)=>res.json(service.memory.setEnabled(req.params.id,req.params.memoryId,z.object({enabled:z.boolean()}).strict().parse(req.body).enabled)));
  app.post('/api/requests/:id/planning/cancel',auth.admin,(req,res)=>res.json(service.localPlanning.cancel(req.params.id)));
  app.post('/api/requests/:id/planning/release',auth.admin,(req,res)=>res.json(service.localPlanning.release(req.params.id,z.object({plannerStopped:z.literal(true)}).parse(req.body).plannerStopped)));
  app.get('/runner/rechecks',auth.mcp,(req,res)=>res.json({requests:service.rechecks.list()}));
  app.post('/runner/rechecks/:id/claim',auth.mcp,(req,res)=>res.json(service.rechecks.claim(req.params.id,'Mac recheck worker')));
  app.post('/runner/rechecks/:id/heartbeat',auth.mcp,(req,res)=>res.json(service.rechecks.heartbeat(req.params.id,z.object({recheckToken:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body).recheckToken)));
  app.post('/runner/rechecks/:id/report',auth.mcp,(req,res)=>{const b=z.object({recheckToken:z.string().regex(/^[a-f0-9]{64}$/),resultRevision:z.string().regex(/^[a-f0-9]{64}$/),checks:z.array(z.object({command:z.string().max(200),passed:z.boolean(),output:z.string().max(4000)}).strict()).length(2),note:z.string().min(10).max(2000)}).strict().parse(req.body);res.json(service.rechecks.report(req.params.id,b.recheckToken,b));});
  app.post('/runner/rechecks/:id/fail',auth.mcp,(req,res)=>{const b=z.object({recheckToken:z.string().regex(/^[a-f0-9]{64}$/),note:z.string().min(5).max(2000)}).strict().parse(req.body);res.json(service.rechecks.fail(req.params.id,b.recheckToken,b.note));});
  app.get('/runner/planning',auth.mcp,limiter(60),(req,res)=>res.json({jobs:service.localPlanning.queue()}));
  const planningClaim=z.object({jobId:z.string().uuid(),planningToken:z.string().regex(/^[a-f0-9]{64}$/)});
  app.post('/runner/planning/:id/claim',auth.mcp,(req,res)=>{const b=z.object({jobId:z.string().uuid(),observedBaseCommit:z.string().regex(/^[a-f0-9]{40}$/)}).strict().parse(req.body);const result=service.localPlanning.claim(req.params.id,b.jobId,b.observedBaseCommit);service.reportRunner({phase:"running",requestId:req.params.id});res.json(result);});
  app.post('/runner/planning/:id/heartbeat',auth.mcp,(req,res)=>{const b=planningClaim.parse(req.body);const result=service.localPlanning.heartbeat(req.params.id,b.jobId,b.planningToken);service.reportRunner({phase:'running',requestId:req.params.id});res.json(result);});
  app.post('/runner/planning/:id/report',auth.mcp,(req,res)=>{const b=planningClaim.extend({report:planReport}).strict().parse(req.body);res.json(service.localPlanning.complete(req.params.id,b.jobId,b.planningToken,b.report));});
  app.post('/runner/planning/:id/fail',auth.mcp,(req,res)=>{const b=planningClaim.strict().parse(req.body);res.json(service.localPlanning.failed(req.params.id,b.jobId,b.planningToken));});
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
  return { app, db, service, pipeline, delivery };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app, db, pipeline, delivery } = createApp(process.env);
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, "0.0.0.0", () => { pipeline.start(); delivery.start(); console.log("AI Agent Lab listening on port " + port); });
  const stop = async () => { await pipeline.stop(); await delivery.stop(); server.close(() => db.close()); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
}

