import { execFileSync } from "node:child_process";
import { mkdir, writeFile, chmod, readFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./runner.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const dryRun = args.includes("--dry-run");
const repoPath = option("--repo");
const url = option("--url");
if (!args.includes("--repo") || !args.includes("--url") || !path.isAbsolute(repoPath)) throw new Error("Usage: npm run runner:install -- --repo /absolute/WriterStudio --url https://your-lab/mcp [--dry-run]");
const endpoint = new URL(url);
if (endpoint.protocol !== "https:" || endpoint.pathname !== "/mcp" || endpoint.username || endpoint.password || endpoint.search) throw new Error("URL phải là HTTPS /mcp.");
if (process.platform !== "darwin") throw new Error("Installer chỉ dùng trên macOS.");
const codexPath = args.includes("--codex") ? option("--codex") : execFileSync("/bin/zsh", ["-lc", "command -v codex"], { encoding: "utf8" }).trim();
if (!path.isAbsolute(codexPath)) throw new Error("Không tìm thấy Codex CLI. Truyền --codex /absolute/path/to/codex.");
const token = process.env.AI_AGENT_LAB_MCP_TOKEN;
if (!dryRun && (!token || token.length < 24)) throw new Error("Cần AI_AGENT_LAB_MCP_TOKEN trong môi trường Terminal.");
const stateDir = path.join(root, "mac", "state");
await mkdir(stateDir, { recursive: true, mode: 0o700 });
const config = { repoPath, mcpUrl: url, codexPath, stateDir, pollIntervalMs: 15000 };
const configPath = path.join(root, "mac", "config.local.json");
await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const wrapperPath = path.join(stateDir, "start.sh");
await writeFile(wrapperPath, `#!/bin/zsh\nset -eu\nexport AI_AGENT_LAB_MCP_TOKEN="$(/usr/bin/security find-generic-password -a ${quote(userInfo().username)} -s ai-agent-lab-mcp -w)"\nexport PATH=${quote(path.dirname(process.execPath) + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin")}\ncd ${quote(root)}\nexec ${quote(process.execPath)} ${quote(path.join(root, "mac/runner.js"))} ${quote(configPath)}\n`, { mode: 0o700 });
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
  try {
    execFileSync("/usr/bin/security", ["add-generic-password", "-U", "-a", userInfo().username, "-s", "ai-agent-lab-mcp", "-w", token], { stdio: ["ignore", "ignore", "pipe"] });
  } catch { throw new Error("Không lưu được token vào Keychain. Kiểm tra quyền macOS."); }
  const agentDir = path.join(homedir(), "Library", "LaunchAgents");
  await mkdir(agentDir, { recursive: true });
  const target = path.join(agentDir, "com.ai-agent-lab.runner.plist");
  await writeFile(target, plist, { mode: 0o600 }); await chmod(target, 0o600);
  const domain = "gui/" + process.getuid();
  try { execFileSync("/bin/launchctl", ["bootout", domain, target], { stdio: "ignore" }); } catch {}
  execFileSync("/bin/launchctl", ["bootstrap", domain, target], { stdio: "inherit" });
  console.log("Mac runner đã cài và chạy. Log: " + path.join(stateDir, "runner.log"));
}
