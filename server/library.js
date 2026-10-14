import { fail } from "./schemas.js";

async function github(path, token) {
  const response = await fetch("https://api.github.com/repos/Tonytran2209/RebuildWriterStudioTool/" + path, {
    signal: AbortSignal.timeout(20000), redirect: "error",
    headers: { Accept: "application/vnd.github+json", "User-Agent": "ai-agent-lab",
      ...(token ? { Authorization: "Bearer " + token } : {}) },
  });
  if (!response.ok) fail("Không đọc được GitHub library (HTTP " + response.status + "). Kiểm tra rate limit/quyền repo.", 502);
  return response.json();
}
export async function syncLibrary(service, token) {
  const commit = await github("commits/main", token);
  const tree = await github("git/trees/" + commit.sha + "?recursive=1", token);
  if (tree.truncated) fail("GitHub tree bị cắt; không thể xác minh source map.", 502);
  const expected = service.currentLibrary().documents.map(d => d.path);
  const documents = [];
  // Keep bounded concurrency to respect GitHub rate limits.
  for (let offset = 0; offset < expected.length; offset += 3) {
    const batch = await Promise.all(expected.slice(offset, offset + 3).map(async file => {
      const value = await github("contents/" + file + "?ref=" + commit.sha, token);
      if (value.type !== "file" || value.encoding !== "base64" || value.size > 120000) fail("Library document không hợp lệ: " + file, 502);
      return { path: file, content: Buffer.from(value.content, "base64").toString("utf8") };
    }));
    documents.push(...batch);
  }
  const project = documents.find(d => d.path === ".agent-hub/project.md")?.content ?? "";
  if (!project.includes("projectId: writer-studio") || !project.includes("Tonytran2209/RebuildWriterStudioTool")) fail("Project contract không khớp.", 502);
  return service.addLibrary({ projectId: "writer-studio", name: "Writer Studio", repository: "Tonytran2209/RebuildWriterStudioTool", branch: "main",
    sourceCommit: commit.sha, syncedAt: new Date().toISOString(), documents, sourcePaths: tree.tree.filter(v => v.type === "blob").map(v => v.path) });
}

