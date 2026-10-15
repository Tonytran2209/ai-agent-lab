import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { repositoryMatches, safePacket, checkScope, childEnvironment, executeRequest, command } from "../mac/runner.js";
import { openDatabase } from "../server/db.js";
import { createService, hash } from "../server/service.js";

const feedback = { feedback: "Nút lưu Draft đang khó đọc trên nền tối.", reproduction: "Mở Draft và xem nút lưu ở thanh công cụ.", expected: "Nút lưu dễ đọc trên nền tối và vẫn focus rõ." };
const draft = { title: "Cải thiện nút lưu Draft", problem: feedback.feedback, layer: "design", module: "draft", allowedPaths: ["src/components/workspace/Step4Draft.tsx"], acceptanceCriteria: ["Nút lưu có độ tương phản rõ."], questions: [], risk: "low", migrationNotes: "" };
test("auto approval requires admin-selected policy, bounded existing UI, context and matching revision", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lab-policy-"));
  const db = openDatabase(dir), service = createService(db);
  try {
    const create = (d = draft, f = feedback) => { const r = service.create(f, "Admin"); return service.edit(r.id, d, "Admin"); };
    const a = create(); assert.equal(a.status, "awaiting-approval");
    assert.equal(service.autoApprove(a.id, "Admin", hash(JSON.stringify(a))).status, "approved");
    assert.equal(service.get(a.id).approval.mode, "auto-low-risk");
    for (const [d, f] of [[{ ...draft, risk: "medium" }, feedback], [{ ...draft, questions: ["Cần sửa nút nào?"] }, feedback], [{ ...draft, allowedPaths: ["src/components/NewFile.tsx"] }, feedback], [{ ...draft, allowedPaths: ["src/components/Login.tsx"] }, feedback], [draft, { ...feedback, reproduction: "" }]]) {
      const r = create(d, f); assert.notEqual(service.autoApprove(r.id, "Admin", hash(JSON.stringify(r))).status, "approved");
    }
    const stale = create(); service.clarify(stale.id, "Bổ sung một thông tin mới.", "Admin");
    assert.throws(() => service.autoApprove(stale.id, "Admin", hash(JSON.stringify(stale))), /đã đổi/);
    const manual = service.create(feedback, "Admin");
    assert.throws(() => service.submit(manual.id, { ...draft, questions: ["Chưa rõ màn hình?"] }, "Admin"));
    assert.equal(service.get(manual.id).status, "feedback");
    assert.equal(service.submit(manual.id, draft, "Admin").status, "approved");
    const r = service.get(manual.id), c = service.claim(r.id, "mac", r.baseCommit);
    assert.equal(service.complete(r.id, c.claimToken, { summary: "Đã sửa nút và kiểm tra tương phản.", changedPaths: draft.allowedPaths, commit: "a".repeat(40), localArtifact: { branch: "lab/REQ-test" }, checks: [{ command: "npm run check", passed: true, output: "Passed" }] }).status, "review");
  } finally { db.close(); await rm(dir, { recursive: true, force: true }); }
});
test("runner rejects wrong repos, unapproved packets, path traversal and scope expansion", () => {
  assert.ok(repositoryMatches("git@github.com:Tonytran2209/RebuildWriterStudioTool.git"));
  assert.ok(!repositoryMatches("https://evil.test/Tonytran2209/RebuildWriterStudioTool.git"));
  assert.throws(() => safePacket({ executable: false, request: {} }));
  assert.throws(() => checkScope(["backend/index.ts"], draft.allowedPaths));
  assert.throws(() => checkScope([], draft.allowedPaths));
  const clean = childEnvironment({ AI_AGENT_LAB_MCP_TOKEN: "secret", MCP_TOKEN: "secret", OPENAI_API_KEY: "secret", PATH: "/bin" });
  assert.deepEqual(clean, { PATH: "/bin" });
});
test("Mac runner claims once, runs checks, commits locally, reports and preserves primary checkout", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lab-runner-"));
  const repo = path.join(dir, "repo"), stateDir = path.join(dir, "state");
  await mkdir(repo); await mkdir(stateDir);
  const git = async (...args) => { const r = await command("git", args, { cwd: repo }); assert.equal(r.code, 0, r.stderr); return r.stdout.trim(); };
  try {
    await git("init"); await git("config", "user.name", "Test"); await git("config", "user.email", "test@example.test");
    await writeFile(path.join(repo, "file.txt"), "before\n"); await git("add", "."); await git("commit", "-m", "seed");
    const baseCommit = await git("rev-parse", "HEAD");
    // An exact allow-listed remote identity, with a local transport rewrite for this offline test.
    await git("remote", "add", "origin", "https://github.com/Tonytran2209/RebuildWriterStudioTool.git");
    await git("config", `url.${repo}.insteadOf`, "https://github.com/Tonytran2209/RebuildWriterStudioTool.git");
    const request = { id: "REQ-ABCDEF12", repository: "Tonytran2209/RebuildWriterStudioTool", status: "approved", approval: {}, baseCommit, draft: { allowedPaths: ["file.txt"] } };
    const packet = { executable: true, request, library: {} }, calls = [];
    const call = async (name, args) => { calls.push({ name, args }); return name === "claim_request" ? { ...packet, claimToken: "test-private-token" } : {}; };
    const run = async (exe, args, opts) => {
      if (exe === "fake-codex") {
        assert.ok(!opts.input.includes("test-private-token"));
        await writeFile(path.join(opts.cwd, "file.txt"), "after\n");
        await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify({ blocked: false, summary: "Đã cập nhật file trong phạm vi được duyệt.", checks: [] }));
      }
      return { code: 0, stdout: "", stderr: "" };
    };
    const done = await executeRequest({ packet, call, config: { repoPath: repo, stateDir, codexPath: "fake-codex" }, run });
    assert.equal(calls.filter(c => c.name === "claim_request").length, 1);
    assert.equal(calls.at(-1).name, "complete_request");
    assert.ok(calls.at(-1).args.result.localArtifact);
    assert.equal(await readFile(path.join(repo, "file.txt"), "utf8"), "before\n");
    assert.notEqual(done.commit, baseCommit);
    const blockedRequest = { ...request, id: "REQ-ABCDEF13" };
    const blockedCalls = [];
    const blockedCall = async (name, args) => { blockedCalls.push(name); return name === "claim_request" ? { ...packet, request: blockedRequest, claimToken: "private" } : {}; };
    const badRun = async (exe, args, opts) => {
      const res = await run(exe, args, opts);
      if (exe === "fake-codex") await writeFile(path.join(opts.cwd, "outside.txt"), "out of scope");
      return res;
    };
    await assert.rejects(executeRequest({ packet: { ...packet, request: blockedRequest }, call: blockedCall, config: { repoPath: repo, stateDir, codexPath: "fake-codex" }, run: badRun }), /ngoài allowedPaths/);
    assert.equal(blockedCalls.at(-1), "request_scope_change");
    assert.ok(!blockedCalls.includes("complete_request"));
    assert.ok(!(await readFile(path.join(stateDir, request.id + ".json"), "utf8")).includes("test-private-token"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
