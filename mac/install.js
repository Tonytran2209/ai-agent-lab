import { execFileSync } from "node:child_process";
import { mkdir, writeFile, chmod, cp, access } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, repositoryMatches } from "./runner.js";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const dryRun = args.includes("--dry-run");
const fileCredentials = args.includes("--credential-file");
const root = dryRun ? sourceRoot : path.join(homedir(), "Library", "Application Support", "AI Agent Lab");
let repoPath = option("--repo");
const url = option("--url");
if (!args.includes("--repo") || !args.includes("--url") || !path.isAbsolute(repoPath)) throw new Error("Usage: npm run runner:install -- --repo /absolute/WriterStudio --url https://your-lab/mcp [--dry-run]");
const endpoint = new URL(url);
if (endpoint.protocol !== "https:" || endpoint.pathname !== "/mcp" || endpoint.username || endpoint.password || endpoint.search) throw new Error("URL phải là HTTPS /mcp.");
if (process.platform !== "darwin") throw new Error("Installer chỉ dùng trên macOS.");
const codexPath = args.includes("--codex") ? option("--codex") : execFileSync("/bin/zsh", ["-lc", "command -v codex"], { encoding: "utf8" }).trim();
if (!path.isAbsolute(codexPath)) throw new Error("Không tìm thấy Codex CLI. Truyền --codex /absolute/path/to/codex.");
const token = process.env.AI_AGENT_LAB_MCP_TOKEN;
if (!dryRun && (!token || token.length < 24)) throw new Error("Cần AI_AGENT_LAB_MCP_TOKEN trong môi trường Terminal.");
if (!dryRun) {
  const originalRepo = repoPath;
  const remote = execFileSync("git", ["-C", originalRepo, "config", "--get", "remote.origin.url"], { encoding: "utf8" }).trim();
  if (!repositoryMatches(remote)) throw new Error("Checkout không đúng Writer Studio.");
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  if (sourceRoot !== root) {
    for (const name of ["node_modules", "server"]) await cp(path.join(sourceRoot, name), path.join(root, name), { recursive: true });
    await cp(path.join(sourceRoot,"mac","ci-templates"),path.join(root,"mac","ci-templates"),{recursive:true});
    await cp(path.join(sourceRoot, "package.json"), path.join(root, "package.json"));
    await mkdir(path.join(root, "mac"), { recursive: true });
    for (const name of ["session.js", "codex-events.js", "direct-survey.js", "shared-worktree.js", "direct-plan-schema.json", "repair.js", "codex.js", "monitor.js", "images.js", "runner.js", "recheck.js", "release.js", "verify.js", "projects.js", "ci-setup.js", "ci-template.js", "planning.js", "plan-schema.json", "install.js", "result-schema.json"]) await cp(path.join(sourceRoot, "mac", name), path.join(root, "mac", name));
  }
  repoPath = path.join(root, "repository");
  let exists = true;
  try { await access(repoPath); } catch { exists = false; }
  if (!exists) {
    execFileSync("git", ["clone", "--no-hardlinks", originalRepo, repoPath], { stdio: "inherit" });
    execFileSync("git", ["-C", repoPath, "remote", "set-url", "origin", remote]);
  } else if (!repositoryMatches(execFileSync("git", ["-C", repoPath, "config", "--get", "remote.origin.url"], { encoding: "utf8" }).trim())) {
    throw new Error("Cached repository không đúng project.");
  }
  for (const key of ["user.name", "user.email"]) {
    try {
      const value = execFileSync("git", ["-C", originalRepo, "config", "--get", key], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (value) execFileSync("git", ["-C", repoPath, "config", key, value]);
    } catch {}
  }
}
const stateDir = path.join(root, "mac", "state");
await mkdir(stateDir, { recursive: true, mode: 0o700 });
const config = { codexModel:"gpt-6.1-sol", releaseEnabled: args.includes("--enable-release"), ghPath: "/opt/homebrew/bin/gh", releaseEnvironment: args.includes("--release-environment") ? option("--release-environment") : "", repoPath, mcpUrl: url, codexPath, stateDir, pollIntervalMs: 15000 };
const configPath = path.join(root, "mac", "config.local.json");
await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const wrapperPath = path.join(stateDir, "start.sh");
const tokenPath = path.join(stateDir, "mcp-token");
const credentialCommand = fileCredentials
  ? `IFS= read -r AI_AGENT_LAB_MCP_TOKEN < ${quote(tokenPath)}\nexport AI_AGENT_LAB_MCP_TOKEN`
  : `export AI_AGENT_LAB_MCP_TOKEN="$(/usr/bin/security find-generic-password -a ${quote(userInfo().username)} -s ai-agent-lab-mcp -w)"`;
await writeFile(wrapperPath, `#!/bin/zsh\nset -eu\n${credentialCommand}\nexport PATH=${quote(path.dirname(process.execPath) + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin")}\ncd ${quote(root)}\nexec ${quote(process.execPath)} ${quote(path.join(root, "mac/runner.js"))} ${quote(configPath)}\n`, { mode: 0o700 });
await chmod(wrapperPath, 0o700);
const xml = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.ai-agent-lab.runner</string>
<key>ProgramArguments</key><array><string>/bin/zsh</string><string>${xml(wrapperPath)}</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>30</integer>
<key>ExitTimeOut</key><integer>20</integer>
<key>StandardOutPath</key><string>${xml(path.join(stateDir, "runner.log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(stateDir, "runner-error.log"))}</string>
</dict></plist>\n`;
await writeFile(path.join(stateDir, "com.ai-agent-lab.runner.plist"), plist, { mode: 0o600 });
if (dryRun) {
  console.log("Đã chuẩn bị config và LaunchAgent trong " + stateDir + ". Chưa cài, chưa chạy, chưa lưu token.");
} else {
  // No token in the plist, repository config, or shell history. Keychain access may show an OS prompt.
  const connection = await connect(config, token);
  await connection.call("list_ready_requests");
  await connection.client.close();
  if (fileCredentials) {
    await chmod(stateDir, 0o700);
    await writeFile(tokenPath, token + "\n", { mode: 0o600 });
    await chmod(tokenPath, 0o600);
  } else try {
    execFileSync("/usr/bin/security", ["add-generic-password", "-U", "-a", userInfo().username, "-s", "ai-agent-lab-mcp", "-w", token], { stdio: ["ignore", "ignore", "pipe"] });
  } catch { throw new Error("Không lưu được token vào Keychain. Chạy lại trong Terminal hoặc chọn --credential-file để dùng tệp riêng quyền 600."); }
  const agentDir = path.join(homedir(), "Library", "LaunchAgents");
  await mkdir(agentDir, { recursive: true });
  const target = path.join(agentDir, "com.ai-agent-lab.runner.plist");
  await writeFile(target, plist, { mode: 0o600 }); await chmod(target, 0o600);
  const domain = "gui/" + process.getuid();
  try { execFileSync("/bin/launchctl", ["bootout", domain, target], { stdio: "ignore" }); } catch {}
  try {
    execFileSync("/bin/launchctl", ["bootstrap", domain, target], { stdio: "inherit" });
    console.log("Mac runner đã cài và chạy. Log: " + path.join(stateDir, "runner.log"));
  } catch {
    console.error("Đã cài các tệp nhưng macOS chặn đăng ký tiến trình nền. Chạy lệnh sau trong Terminal ngoài sandbox:");
    console.error(`/bin/launchctl bootstrap ${quote(domain)} ${quote(target)}`);
    process.exitCode = 1;
  }
}
