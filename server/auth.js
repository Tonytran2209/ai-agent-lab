import crypto from "node:crypto";
import { fail } from "./schemas.js";
const COOKIE = "lab_session";
function equal(a, b) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
export function createAuth(config) {
  for (const key of ["ADMIN_PASSWORD", "SESSION_SECRET", "MCP_TOKEN"]) {
    if (!config[key] || config[key].length < 24) throw new Error(key + " must have at least 24 characters.");
  }
  if (config.USER_PASSWORD && config.USER_PASSWORD.length < 24) throw new Error("USER_PASSWORD must have at least 24 characters.");
  const secrets = ["ADMIN_PASSWORD", "SESSION_SECRET", "MCP_TOKEN", "USER_PASSWORD"].map(k => config[k]).filter(Boolean);
  if (new Set(secrets).size !== secrets.length) throw new Error("Authentication secrets must be independent.");
  const secure = config.NODE_ENV === "production";
  const sign = value => crypto.createHmac("sha256", config.SESSION_SECRET).update(value).digest("base64url");
  function session(req) {
    const cookie = req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
    if (!cookie || cookie.length > 3000) return null;
    const [value, signature] = cookie.split(".");
    if (!value || !signature || !equal(sign(value), signature)) return null;
    try {
      const payload = JSON.parse(Buffer.from(value, "base64url").toString());
      return payload.expires > Date.now() && ["admin", "member"].includes(payload.role) ? payload : null;
    } catch { return null; }
  }
  return {
    session,
    login(name, password, res) {
      const role = equal(password, config.ADMIN_PASSWORD) ? "admin" : config.USER_PASSWORD && equal(password, config.USER_PASSWORD) ? "member" : null;
      if (!role) fail("Mật khẩu không đúng.", 401);
      const payload = { name, role, expires: Date.now() + 8 * 3600000, csrf: crypto.randomBytes(24).toString("hex") };
      const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
      res.cookie(COOKIE, value + "." + sign(value), { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 8 * 3600000 });
      return payload;
    },
    logout(res) { res.clearCookie(COOKIE, { httpOnly: true, secure, sameSite: "strict", path: "/" }); },
    require(req, res, next) {
      const user = session(req); if (!user) return res.status(401).json({ error: "Vui lòng đăng nhập." });
      if (!["GET", "HEAD"].includes(req.method) && !equal(String(req.get("X-CSRF-Token") ?? ""), user.csrf))
        return res.status(403).json({ error: "Phiên không hợp lệ. Tải lại trang và thử lại." });
      req.user = user; next();
    },
    admin(req, res, next) { if (req.user?.role !== "admin") return res.status(403).json({ error: "Chỉ admin được duyệt và quản trị request." }); next(); },
    mcp(req, res, next) {
      const token = req.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
      if (!token || !equal(token, config.MCP_TOKEN)) return res.status(401).json({ error: "MCP bearer token required." });
      next();
    },
  };
}

