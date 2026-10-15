import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db.js";
import { hash, createService } from "./service.js";
import { createAuth } from "./auth.js";
import { analyzeFeedback } from "./ai.js";
import { syncLibrary } from "./library.js";
import { mcpHandler } from "./mcp.js";
import { fail } from "./schemas.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function createApp(config, options = {}) {
  const auth = createAuth(config);
  const db = options.db ?? openDatabase(config.DATA_DIR || path.join(root, "data"));
  const service = createService(db, options);
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
    try { db.prepare("SELECT 1").get(); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
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
    mcpUrl: (config.APP_URL || "http://localhost:3000").replace(/\/$/, "") + "/mcp", project: { id: "writer-studio", name: "Writer Studio", repository: "Tonytran2209/RebuildWriterStudioTool" } }));
  app.get("/api/requests", (req, res) => res.json({ requests: service.list() }));
  app.post("/api/requests", limiter(20), (req, res) => res.status(201).json(service.create(req.body, req.user.name)));
  app.get("/api/requests/:id", (req, res) => res.json({ request: service.get(req.params.id), events: service.events(req.params.id) }));
  const editable = (req, res, next) => {
    // Members can submit feedback; contract preparation and execution authority remain admin-only.
    if (req.user.role !== "admin") return res.status(403).json({ error: "Chỉ admin được chuẩn bị và duyệt coding request." });
    next();
  };
  app.put("/api/requests/:id/draft", editable, (req, res) => res.json(service.edit(req.params.id, req.body, req.user.name)));
  app.post("/api/requests/:id/submit", editable, (req, res) => res.json(service.submit(req.params.id, req.body, req.user.name)));
  app.post("/api/requests/:id/clarify", (req, res) => {
    const r = service.get(req.params.id);
    if (req.user.role !== "admin" && r.author !== req.user.name) fail("Chỉ tác giả/admin được bổ sung feedback.", 403);
    const { note } = z.object({ note: z.string().trim().min(5).max(4000) }).parse(req.body);
    res.json(service.clarify(req.params.id, note, req.user.name));
  });
  const analyzing = new Set();
  app.post(["/api/requests/:id/analyze", "/api/requests/:id/prepare"], editable, limiter(6), async (req, res) => {
    const { autoApprove } = z.object({ autoApprove: z.boolean().default(false) }).parse(req.body ?? {});
    if (analyzing.has(req.params.id)) fail("AI đang phân tích request này.");
    if (analyzing.size >= 3) fail("AI đang xử lý đủ số request đồng thời. Thử lại sau.", 429);
    analyzing.add(req.params.id);
    try {
      const prepared = await analyzeFeedback(service, req.params.id, req.user.name, config);
      res.json(autoApprove ? service.autoApprove(req.params.id, req.user.name, hash(JSON.stringify(prepared))) : prepared);
    }
    finally { analyzing.delete(req.params.id); }
  });
  app.post("/api/requests/:id/approve", auth.admin, (req, res) => res.json(service.approve(req.params.id, req.user.name)));
  app.post("/api/requests/:id/reject", auth.admin, (req, res) => {
    const { note } = z.object({ note: z.string().min(5).max(1000) }).parse(req.body); res.json(service.reject(req.params.id, note, req.user.name));
  });
  app.post("/api/requests/:id/release", auth.admin, (req, res) => {
    const { note, agentStopped } = z.object({ note: z.string().min(10).max(1000), agentStopped: z.literal(true) }).parse(req.body);
    res.json(service.release(req.params.id, req.user.name, note));
  });
  app.post("/api/requests/:id/accept", auth.admin, (req, res) => res.json(service.accept(req.params.id, req.user.name)));
  app.post("/api/requests/:id/rebase", auth.admin, (req, res) => res.json(service.rebase(req.params.id, req.user.name)));
  app.get("/api/library", (req, res) => res.json(service.currentLibrary()));
  let syncing = false;
  app.post("/api/library/sync", auth.admin, limiter(3, 10 * 60000), async (req, res) => {
    if (syncing) fail("Library đang đồng bộ."); syncing = true;
    try { res.json(await syncLibrary(service, config.GITHUB_TOKEN)); } finally { syncing = false; }
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
  return { app, db, service };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app } = createApp(process.env);
  const port = Number(process.env.PORT || 3000);
  app.listen(port, "0.0.0.0", () => console.log("AI Agent Lab listening on port " + port));
}

