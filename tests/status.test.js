import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { createService, hash } from '../server/service.js';
import { requestChanges, workflowMessage, workflowLabels } from '../src/workflow.js';

test('notifications distinguish initial load, new member feedback and execution transitions', () => {
  const feedback = { id: 'REQ-ABCDEF12', status: 'feedback' };
  assert.deepEqual(requestChanges(null, [feedback]), []);
  assert.deepEqual(requestChanges(new Map(), [feedback]), [feedback]);
  assert.deepEqual(requestChanges(new Map([[feedback.id, 'feedback']]), [feedback]), []);
  const running = { ...feedback, status: 'running' };
  assert.deepEqual(requestChanges(new Map([[feedback.id, 'feedback']]), [running]), [running]);
  assert.match(workflowMessage({ status: 'awaiting-approval', draft: { risk: 'low' } }), /chưa phải quyền thực thi/);
  assert.match(workflowMessage({ status: 'feedback' }), /chưa có tác vụ/);
  assert.match(workflowMessage({ status: 'approved' }, { connected: false }), /Chưa nhận được heartbeat/);
  assert.match(workflowMessage({ status: 'approved' }, { connected: true, phase: 'running' }), /request khác/);
  assert.ok(workflowLabels['awaiting-approval'].includes('chờ admin duyệt'));
});
test('runner presence is durable, expires offline and does not change request approval', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lab-runner-status-'));
  const db = openDatabase(dir), service = createService(db);
  try {
    assert.equal(service.runnerStatus().connected, false);
    service.reportRunner({ phase: 'idle', requestId: null });
    assert.equal(service.runnerStatus().connected, true);
    assert.equal(createService(db).runnerStatus().phase, 'idle');
    db.prepare("UPDATE settings SET value=? WHERE key='mac_runner'").run(JSON.stringify({ phase: 'running', requestId: 'REQ-ABCDEF12', lastSeenAt: '2000-01-01T00:00:00Z' }));
    assert.equal(service.runnerStatus().connected, false);
    assert.deepEqual(service.ready(), []);
    const r = service.create({ feedback: "Một feedback mới từ user để kiểm tra tiến trình." }, "Member");
    service.beginPreparation(r.id, "Admin");
    assert.equal(service.get(r.id).preparation.status, "running");
    service.endPreparation(r.id, "Admin", false);
    assert.equal(service.get(r.id).status, "feedback");
    assert.equal(service.get(r.id).preparation.status, "failed");
    assert.equal(service.get(r.id).approval, null);
    assert.match(workflowMessage(service.get(r.id)), /chưa thành công/);
    const next = service.create({ feedback: "Nút lưu Draft cần dễ đọc hơn trên nền tối.", reproduction: "Mở Draft và xem nút lưu trên thanh công cụ.", expected: "Nút lưu có tương phản rõ ràng trên nền tối." }, "Member");
    service.beginPreparation(next.id, "Admin");
    const draft = { title: "Cải thiện tương phản nút lưu Draft", problem: "Nút lưu Draft khó đọc trên nền tối ở màn hình Draft.", layer: "design", module: "draft", allowedPaths: ["src/components/workspace/Step4Draft.tsx"], acceptanceCriteria: ["Nút lưu dễ đọc trên nền tối."], questions: [], risk: "low", migrationNotes: "" };
    const prepared = service.saveAnalysis(next.id, draft, { model: "mock" }, "Admin", hash(JSON.stringify(service.rawForAnalysis(next.id))));
    assert.equal(service.autoApprove(next.id, "Admin", hash(JSON.stringify(prepared))).status, "approved");
    service.endPreparation(next.id, "Admin", true);
    const ready = service.get(next.id);
    assert.equal(ready.preparation.status, "completed");
    assert.ok(service.claim(next.id, "Mac", ready.baseCommit).claimToken);
  } finally { db.close(); rmSync(dir, {recursive:true,force:true}); }
});
