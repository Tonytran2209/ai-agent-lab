import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { EventEmitter } from "node:events";
import { createPerformance } from "../server/performance.js";

test("performance preserves project boundaries, stale signals and legacy missing timestamps", () => {
  const db = new DatabaseSync(":memory:");
  const now = new Date().toISOString();
  const requests = [
    {
      id: "one",
      projectId: "a",
      status: "completed",
      createdAt: now,
      updatedAt: now,
      release: { phase: "deployed", updatedAt: now },
      lease: { token: "private" },
    },
    {
      id: "two",
      projectId: "b",
      status: "failed",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "old",
      projectId: "a",
      status: "completed",
      createdAt: now,
      release: { phase: "deployed" },
    },
    {
      id: "archived",
      projectId: "b",
      status: "failed",
      createdAt: now,
      archivedAt: now,
    },
  ];
  const service = {
    list: () => requests,
    projects: () => [
      { id: "a", repository: "owner/a", enabled: true, runnerEnabled: true },
      { id: "b", repository: "owner/b", enabled: true, runnerEnabled: true },
    ],
    runnerStatus: () => ({
      connected: false,
      lastSeenAt: now,
      projects: [{ projectId: "a", repository: "owner/a", repoReady: true }],
    }),
  };
  try {
    const report = createPerformance(db, service);
    const response = new EventEmitter();
    response.statusCode = 503;
    let next = false;
    report.middleware({}, response, () => {
      next = true;
    });
    response.emit("finish");
    const snapshot = report.snapshot(7);
    assert.equal(next, true);
    assert.equal(snapshot.lab.http.calls, 1);
    assert.equal(snapshot.lab.http.errors, 1);
    assert.equal(snapshot.projects[0].connection, "stale");
    assert.equal(snapshot.projects[0].failed, 0);
    assert.equal(snapshot.projects[1].failed, 1);
    assert.equal(snapshot.summary.total, 3);
    assert.equal(snapshot.summary.deliverySamples, 1);
    assert.equal(snapshot.summary.p95DeliveryMs, 0);
    assert.equal(snapshot.projects[0].runtimeStatus, "unknown");
    assert.equal(JSON.stringify(snapshot).includes("private"), false);
    assert.equal(
      snapshot.trend.reduce((n, v) => n + v.created, 0),
      3,
    );
    assert.equal(snapshot.trend.length, 7);
  } finally {
    db.close();
  }
});

test("report API requires admin and rejects unbounded ranges", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { openDatabase } = await import("../server/db.js");
  const { createApp } = await import("../server/index.js");
  const dir = mkdtempSync(tmpdir() + "/lab-performance-");
  const db = openDatabase(dir);
  const config = {
    NODE_ENV: "test",
    ADMIN_PASSWORD: "admin-performance-test-123456",
    USER_PASSWORD: "member-performance-test-12345",
    SESSION_SECRET: "session-performance-test-12345",
    MCP_TOKEN: "mcp-performance-test-12345678",
    LAB_BOOTSTRAP_DEFAULT_PROJECTS: "false",
  };
  const { app } = createApp(config, { db });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    assert.equal((await fetch(base + "/api/performance")).status, 401);
    const login = async (password) => {
      const response = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", password }),
      });
      return { Cookie: response.headers.get("set-cookie").split(";")[0] };
    };
    const member = await login(config.USER_PASSWORD);
    assert.equal(
      (await fetch(base + "/api/performance", { headers: member })).status,
      403,
    );
    const admin = await login(config.ADMIN_PASSWORD);
    assert.equal(
      (await fetch(base + "/api/performance?days=999", { headers: admin }))
        .status,
      400,
    );
    const response = await fetch(base + "/api/performance?days=7", {
      headers: admin,
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.projects.length, 0);
    assert.equal(body.summary.total, 0);
    assert.equal(body.summary.p95DeliveryMs, null);
    assert.equal(body.lab.database, "ready");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
