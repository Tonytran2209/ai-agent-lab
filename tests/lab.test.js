import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { openDatabase } from "../server/db.js";
import { createService } from "../server/service.js";
import { createApp } from "../server/index.js";
import { analyzeFeedback } from "../server/ai.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "agent-lab-test-"));
  const db = openDatabase(dir), service = createService(db);
  return { db, service, cleanup() { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
const feedback = { feedback: "Draft đã lưu nhưng nội dung mới không xuất hiện trên màn hình.", screen: "Draft", reproduction: "Mở Draft, sửa nội dung, nhấn lưu.", expected: "Nội dung đã lưu hiển thị ngay." };
const draft = { title: "Hiển thị Draft sau khi lưu", problem: feedback.feedback, layer: "design", module: "draft",
  allowedPaths: ["src/components/workspace/Step4Draft.tsx"], acceptanceCriteria: ["Nội dung đã lưu hiển thị ngay.", "Lỗi lưu không làm mất nội dung."], questions: [], risk: "low", migrationNotes: "" };
function prepared(service) { const r = service.create(feedback, "Reviewer"); service.edit(r.id, draft, "Admin"); return service.approve(r.id, "Admin"); }
function result(overrides = {}) { return { summary: "Đã sửa cập nhật Draft và kiểm tra hành vi lưu.", changedPaths: draft.allowedPaths,
  commit: "a".repeat(40), artifactUrl: "https://github.com/Tonytran2209/RebuildWriterStudioTool/pull/123",
  checks: [{ command: "npm run check", passed: true, output: "Build and typecheck passed." }], ...overrides }; }

test("approval, HEAD check, atomic claim, result review and durable state", () => {
  const f = fixture();
  try {
    const r = f.service.create(feedback, "User");
    assert.throws(() => f.service.claim(r.id, "codex", r.baseCommit), /chưa được duyệt/);
    f.service.edit(r.id, draft, "Admin"); f.service.approve(r.id, "Admin");
    assert.throws(() => f.service.claim(r.id, "codex", "0".repeat(40)), /HEAD/);
    const claimed = f.service.claim(r.id, "codex", r.baseCommit);
    assert.throws(() => f.service.claim(r.id, "other", r.baseCommit), /đã được claim/);
    assert.equal(f.service.get(r.id).lease.tokenHash, undefined);
    assert.throws(() => f.service.progress(r.id, "bad", "running"), /token/);
    f.service.progress(r.id, claimed.claimToken, "Đã xác minh repo; đang sửa UI.");
    assert.equal(f.service.get(r.id).status, "running");
    assert.throws(() => f.service.complete(r.id, claimed.claimToken, result({ changedPaths: ["backend/index.ts"] })), /ngoài allowedPaths/);
    assert.throws(() => f.service.complete(r.id, claimed.claimToken, result({ artifactUrl: "https://evil.example/pull/1" })), /đúng repo/);
    assert.equal(f.service.complete(r.id, claimed.claimToken, result()).status, "review");
    assert.equal(f.service.accept(r.id, "Admin").status, "completed");
    const reloaded = createService(f.db);
    assert.equal(reloaded.get(r.id).status, "completed");
    assert.ok(reloaded.events(r.id).length >= 6);
  } finally { f.cleanup(); }
});
test("conflicting scopes lock until stopped; scope change invalidates approval", () => {
  const f = fixture();
  try {
    const a = prepared(f.service), b = prepared(f.service), claim = f.service.claim(a.id, "codex-a", a.baseCommit);
    assert.throws(() => f.service.claim(b.id, "codex-b", b.baseCommit), /Phạm vi/);
    f.service.scopeChange(a.id, claim.claimToken, "Cần sửa App.tsx; đã dừng agent để chờ mở rộng scope.");
    assert.equal(f.service.get(a.id).approval, null); assert.equal(f.service.get(a.id).status, "needs-triage");
    assert.throws(() => f.service.claim(a.id, "codex", a.baseCommit));
    const next = f.service.claim(b.id, "codex-b", b.baseCommit);
    const stored = JSON.parse(f.db.prepare("SELECT data FROM requests WHERE id=?").get(b.id).data);
    stored.lease.expiresAt = "2000-01-01T00:00:00.000Z";
    f.db.prepare("UPDATE requests SET data=? WHERE id=?").run(JSON.stringify(stored), b.id);
    assert.throws(() => f.service.progress(b.id, next.claimToken, "Heartbeat"), /hết hạn/);
    f.service.release(b.id, "Admin", "Đã xác nhận agent cũ dừng.");
    assert.equal(f.service.get(b.id).status, "awaiting-approval"); assert.equal(f.service.get(b.id).approval, null);
  } finally { f.cleanup(); }
});
test("policy rejects unsafe paths, layer leakage and missing database notes", () => {
  const f = fixture(); try {
    const r = f.service.create(feedback, "User");
    for (const p of ["../secret", ".env", "src/**", "src/components/../../file", "/tmp/file", "C:/file"])
      assert.throws(() => f.service.edit(r.id, { ...draft, allowedPaths: [p] }, "Admin"));
    assert.throws(() => f.service.edit(r.id, { ...draft, allowedPaths: ["backend/index.ts"] }, "Admin"), /layer/);
    assert.throws(() => f.service.edit(r.id, { ...draft, layer: "database", allowedPaths: ["supabase/migrations/008_change.sql"] }, "Admin"), /rollback/);
    f.service.edit(r.id, { ...draft, layer: "database", allowedPaths: ["supabase/migrations/008_change.sql"], migrationNotes: "Rollback additive migration; backfill none; RLS unchanged; API compatible." }, "Admin");
    assert.equal(f.service.get(r.id).draft.risk, "high");
    assert.throws(() => f.service.edit(r.id, { ...draft, layer: "cross-layer", allowedPaths: ["supabase/migrations/008_change.sql", "backend/index.ts"] }, "Admin"), /rollback/);
  } finally { f.cleanup(); }
});
test("library sync preserves old packets, questions prevent approval and failed checks stay failed", () => {
  const f = fixture(); try {
    const r = f.service.create(feedback, "User"), old = f.service.currentLibrary();
    f.service.addLibrary({ ...old, sourceCommit: "b".repeat(40), documents: old.documents.map((d, i) => i === 0 ? { ...d, content: d.content + "\nnew version" } : d) });
    assert.equal(f.service.packet(r.id).library.sourceCommit, r.baseCommit);
    f.service.edit(r.id, { ...draft, questions: ["Nút lưu nào bị lỗi?"] }, "Admin");
    assert.throws(() => f.service.approve(r.id, "Admin"));
    f.service.edit(r.id, draft, "Admin"); f.service.approve(r.id, "Admin");
    const c = f.service.claim(r.id, "codex", r.baseCommit);
    assert.equal(f.service.complete(r.id, c.claimToken, result({ checks: [{ command: "npm run check", passed: false, output: "typecheck failed" }] })).status, "failed");
  } finally { f.cleanup(); }
});
test("AI strict output prepares a draft; provider failure preserves feedback", async () => {
  const f = fixture(), original = globalThis.fetch;
  try {
    const r = f.service.create(feedback, "User");
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body); assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
      assert.ok(body.input.includes(r.baseCommit));
      return new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(draft) }] }], usage: { total_tokens: 100 } }));
    };
    await analyzeFeedback(f.service, r.id, "Admin", { OPENAI_API_KEY: "test-key" });
    assert.equal(f.service.get(r.id).status, "awaiting-approval");
    assert.equal(f.service.get(r.id).approval, null);
    globalThis.fetch = async () => new Response("do not leak raw provider response", { status: 401 });
    await assert.rejects(analyzeFeedback(f.service, r.id, "Admin", { OPENAI_API_KEY: "test-key" }), /HTTP 401/);
    assert.equal(f.service.get(r.id).feedback, feedback.feedback);
    await assert.rejects(analyzeFeedback(f.service, r.id, "Admin", {}), /OPENAI_API_KEY/);
  } finally { globalThis.fetch = original; f.cleanup(); }
});
test("HTTP authentication, CSRF, member permissions and actual MCP pull lifecycle", async () => {
  const f = fixture();
  const secret = () => crypto.randomBytes(32).toString("hex");
  const config = { ADMIN_PASSWORD: secret(), USER_PASSWORD: secret(), SESSION_SECRET: secret(), MCP_TOKEN: secret(), NODE_ENV: "test" };
  const { app, service } = createApp(config, { db: f.db });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  let client;
  try {
    assert.equal((await fetch(base + "/health")).status, 200);
    assert.equal((await fetch(base + "/api/requests")).status, 401);
    assert.equal((await fetch(base + "/mcp", { method: "POST" })).status, 401);
    assert.equal((await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ name: "Admin", password: config.ADMIN_PASSWORD }) })).status, 403);
    async function login(password) {
      const res = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Test", password }) });
      assert.equal(res.status, 200);
      const body = await res.json();
      return { Cookie: res.headers.get("set-cookie").split(";")[0], "X-CSRF-Token": body.user.csrf, "Content-Type": "application/json" };
    }
    const member = await login(config.USER_PASSWORD), admin = await login(config.ADMIN_PASSWORD);
    assert.equal((await fetch(base + "/api/requests", { method: "POST", headers: { Cookie: member.Cookie, "Content-Type": "application/json" }, body: JSON.stringify(feedback) })).status, 403);
    const created = await fetch(base + "/api/requests", { method: "POST", headers: member, body: JSON.stringify(feedback) });
    assert.equal(created.status, 201); const r = await created.json();
    assert.equal((await fetch(base + "/api/requests/" + r.id + "/draft", { method: "PUT", headers: member, body: JSON.stringify(draft) })).status, 403);
    assert.equal((await fetch(base + "/api/requests/" + r.id + "/draft", { method: "PUT", headers: admin, body: JSON.stringify(draft) })).status, 200);
    assert.equal((await fetch(base + "/api/requests/" + r.id + "/approve", { method: "POST", headers: member })).status, 403);
    assert.equal((await fetch(base + "/api/requests/" + r.id + "/approve", { method: "POST", headers: admin })).status, 200);
    assert.equal((await fetch(base + "/api/requests/" + r.id + "/submit", { method: "POST", headers: member, body: JSON.stringify(draft) })).status, 403);
    assert.equal((await fetch(base + "/api/requests/" + r.id + "/prepare", { method: "POST", headers: member, body: JSON.stringify({ autoApprove: true }) })).status, 403);
    const manualRequest = service.create(feedback, "Admin");
    const submitted = await fetch(base + "/api/requests/" + manualRequest.id + "/submit", { method: "POST", headers: admin, body: JSON.stringify(draft) });
    assert.equal(submitted.status, 200); assert.equal((await submitted.json()).status, "approved");
    service.reject(manualRequest.id, "Admin", "Test done.");
    client = new Client({ name: "test-codex-client", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { requestInit: { headers: { Authorization: "Bearer " + config.MCP_TOKEN } } }));
    const tools = await client.listTools(); assert.equal(tools.tools.length, 6);
    assert.ok(!tools.tools.some(t => t.name.includes("approve")));
    const ready = await client.callTool({ name: "list_ready_requests", arguments: {} });
    assert.equal(ready.structuredContent.requests[0].id, r.id);
    const packet = await client.callTool({ name: "get_request", arguments: { requestId: r.id } });
    assert.equal(packet.structuredContent.library.documents.length, 11);
    const claimed = await client.callTool({ name: "claim_request", arguments: { requestId: r.id, agentName: "codex-test", observedBaseCommit: r.baseCommit } });
    assert.ok(claimed.structuredContent.claimToken); const token = claimed.structuredContent.claimToken;
    const second = await client.callTool({ name: "claim_request", arguments: { requestId: r.id, agentName: "other", observedBaseCommit: r.baseCommit } });
    assert.equal(second.isError, true);
    await client.callTool({ name: "report_progress", arguments: { requestId: r.id, claimToken: token, note: "Đang chạy kiểm tra hành vi lưu." } });
    const completion = await client.callTool({ name: "complete_request", arguments: { requestId: r.id, claimToken: token, result: result() } });
    assert.equal(completion.structuredContent.status, "review");
    assert.equal(service.get(r.id).lease, null);
    const all = await fetch(base + "/api/requests", { headers: admin }); const text = await all.text();
    assert.ok(!text.includes(token)); assert.ok(!text.includes(config.MCP_TOKEN)); assert.ok(!text.includes("tokenHash"));
  } finally { if (client) await client.close(); await new Promise(resolve => server.close(resolve)); f.cleanup(); }
});

