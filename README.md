# AI Agent Lab

Workspace nhận feedback cho Writer Studio, dùng AI chuẩn hóa thành change request và cung cấp request đã duyệt cho **Codex chat lấy qua MCP**.

Giao diện bám Design MD của Writer Studio: canvas `#141414`, sidebar `#121212`, card `#1c1c1c`, control `#242424`, border `#2a2a2a`, font system, nhịp spacing 4px và settings sáng trung tính.

## Luồng sử dụng

1. Thành viên đăng nhập và gửi feedback: vấn đề, màn hình, cách tái hiện, kết quả mong muốn.
2. Admin nhấn **Phân tích** để AI đọc feedback + library ghim theo commit; hoặc chuẩn bị request thủ công.
3. Làm rõ câu hỏi còn thiếu, kiểm tra layer, các file cụ thể, risk và tiêu chí nghiệm thu.
4. Admin **Lưu request**, rồi **Duyệt request**.
5. Mở checkout Writer Studio trong Codex chat, kết nối MCP và yêu cầu lấy request.
6. Codex xác minh remote/HEAD, claim, sửa trong phạm vi, gửi progress và kết quả kiểm tra.
7. Admin mở diff/PR, kiểm tra hành vi và nghiệm thu. Lab không tự merge/deploy.

App này không tự gọi Codex SDK hoặc tạo turn trong chat. Codex là MCP client chủ động lấy request.

## Deploy Railway

1. Tạo service từ GitHub repo `Tonytran2209/ai-agent-lab`, branch **main**, root directory là gốc repo.
2. Railway dùng **Dockerfile** đã có. Node **24** được yêu cầu vì backend sử dụng SQLite tích hợp.
3. Tạo **Volume**, gắn vào service tại **/data**. Giữ **1 replica**; không bật horizontal scaling hoặc serverless cho workspace này.
4. Tạo public domain, rồi cấu hình variables trước khi deployment chạy:

| Variable | Giá trị |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_URL` | URL HTTPS của service, ví dụ `https://your-lab.up.railway.app` |
| `DATA_DIR` | `/data` |
| `RAILWAY_RUN_UID` | `0` để ghi Railway Volume được mount bằng root |
| `ADMIN_PASSWORD` | Secret ngẫu nhiên riêng, ít nhất 24 ký tự |
| `USER_PASSWORD` | Secret riêng cho thành viên, ít nhất 24 ký tự; để trống để tắt member login |
| `SESSION_SECRET` | Secret riêng ký cookie, ít nhất 24 ký tự |
| `MCP_TOKEN` | Secret riêng cho Codex MCP client, ít nhất 24 ký tự |
| `OPENAI_API_KEY` | Key server-side để bật phân tích AI |
| `OPENAI_MODEL` | Mặc định `gpt-4.1-mini`; có thể đổi sang model hỗ trợ Responses Structured Outputs |
| `GITHUB_TOKEN` | Tùy chọn, quyền đọc Writer Studio repo để tăng rate limit |

Mỗi secret phải khác nhau. `PORT` do Railway cung cấp. Không đưa key/token vào frontend, Git hoặc prompt.

`RAILWAY_RUN_UID=0` là hướng dẫn của Railway cho image chạy non-root khi dùng Volume. Tham khảo [Railway Volumes](https://docs.railway.com/volumes) và [Dockerfiles](https://docs.railway.com/builds/dockerfiles).

Healthcheck: `GET /health`. Production fail-fast nếu thiếu secret hoặc `APP_URL` không phải HTTPS.

Dữ liệu nằm trong `/data/lab.sqlite` và SQLite WAL. **Không có Volume, dữ liệu có thể mất khi redeploy.** Bật backup Volume; khi backup bằng công cụ riêng, dùng SQLite online backup hoặc dừng service trước khi copy cả database/WAL.

Ứng dụng được chuẩn bị cho Railway; deployment thực tế và cấu hình secrets do chủ workspace thực hiện.

## Kết nối Codex MCP

Trong `~/.codex/config.toml` hoặc cấu hình MCP tương ứng của Codex:

```toml
[mcp_servers.ai_agent_lab]
url = "https://your-lab.up.railway.app/mcp"
bearer_token_env_var = "AI_AGENT_LAB_MCP_TOKEN"

[mcp_servers.ai_agent_lab.tools.get_request]
output_token_limit = 20000
```

Gán biến môi trường `AI_AGENT_LAB_MCP_TOKEN` trên máy chạy Codex bằng giá trị `MCP_TOKEN` ở Railway. Biến cần tồn tại trong môi trường của process Codex; mở lại Codex sau khi thay đổi. Không gán token vào config được commit.

Cấu hình Streamable HTTP và `bearer_token_env_var` theo [OpenAI Docs](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). Endpoint dùng bearer token tĩnh cho private team workspace, không triển khai OAuth discovery.

Lệnh trong Codex chat:

> Lấy request REQ-xxxxxxxx từ AI Agent Lab qua MCP. Đọc pinned library, xác minh đúng repo và HEAD, claim_request trước khi sửa. Thực thi đúng allowedPaths, chạy npm run check và kiểm tra hành vi theo tiêu chí nghiệm thu, rồi báo kết quả về Lab. Không merge/deploy.

Có thể dùng hướng dẫn trong `skills/execute-lab-request/SKILL.md`.

## MCP tools

| Tool | Mục đích |
| --- | --- |
| `list_ready_requests` | Chỉ liệt kê request đã duyệt |
| `get_request` | Request, pinned library, prompt và ranh giới thực thi |
| `claim_request` | Atomic claim; nhận `observedBaseCommit`, trả claim token riêng |
| `report_progress` | Gửi progress và gia hạn claim |
| `request_scope_change` | Agent dừng, mở lại triage và vô hiệu hóa approval |
| `complete_request` | Báo diff, commit/artifact và checks; kết quả chờ nghiệm thu |

MCP dùng official `@modelcontextprotocol/sdk`, **stateless Streamable HTTP POST** tại `/mcp`. Không có session map cần đồng bộ giữa replicas. SQLite giữ business state.

Claim có thời hạn **15 phút**; agent heartbeat ít nhất **mỗi 5 phút**. Claim hết hạn **không tự trả scope vào queue** để tránh agent cũ vẫn chạy. Admin chỉ mở lại claim sau khi xác minh agent cũ đã dừng, và request phải được duyệt lại.

## Library và policy

- Seed gồm 11 tài liệu canonical từ Writer Studio tại commit `07e9334093e9295e05548775c3cf5a4928c6104e`; metadata/hash nằm trong `library/writer-studio.json` và database.
- **MD Library → Đồng bộ từ GitHub** lấy commit main mới và tài liệu tại đúng commit đó; không sửa Writer Studio repo.
- Đồng bộ không đổi version của request cũ. Nút **Cập nhật base** xóa draft/approval và yêu cầu chuẩn bị lại.
- GitHub token chỉ dùng server-side. Repo được allow-list cố định; không nhận URL fetch tùy ý.
- Scope là danh sách **file cụ thể**, tối đa 20 file. Chặn glob, traversal, `.env`, `.git` và các file ngoài layer ownership.
- Database luôn high risk và cần migration notes. Cross-layer tối thiểu medium risk.
- **Tất cả request đều cần admin approval**. Đây là cơ chế thận trọng hơn auto-safe branch/PR trong policy Writer Studio.
- Approval hash gắn với draft + base commit + library version. MCP không có tool approve.
- Database contract hoặc file scope đang active chặn request trùng.
- Các rule ownership thực thi trong `server/service.js`; nếu contract canonical đổi ownership, cập nhật validator trước khi duyệt các scope mới.

**Giới hạn thực thi:** Lab không điều khiển sandbox/file access của Codex. Agent phải tuân thủ packet; kiểm tra diff/verification ở completion là báo cáo của agent, không phải proof hoặc CI độc lập. `observedBaseCommit` cũng do client báo. Người duyệt kiểm tra PR/CI trước khi nghiệm thu.

## Authentication và dữ liệu

MVP này là **một private team workspace dùng mật khẩu theo role**, không phải hệ thống tài khoản cá nhân/multi-tenant. Tên hiển thị là nhãn audit do người đăng nhập nhập; không phải danh tính đã xác minh. Thành viên cùng workspace đọc được tất cả feedback/request/library.

Member được gửi feedback/bổ sung; admin chuẩn bị, phân tích, duyệt, mở lại claim và nghiệm thu. Cookie HttpOnly/SameSite=Strict/Secure ở production, CSRF token cho API writes, origin allow-list, rate limits và security headers.

Session sống tối đa 8 giờ. Rotate `SESSION_SECRET` khi cần vô hiệu hóa tất cả session; rotate riêng mật khẩu hoặc MCP token khi thu hồi quyền. Các quota/rate limit in-memory dành cho một replica.

Khi nhấn Phân tích, feedback và MD context được gửi tới OpenAI Responses API với `store:false`. Không gửi provider key về browser. Chỉ gửi feedback đã loại bỏ credentials/dữ liệu nhạy cảm. Không có upload screenshot/attachments trong phiên bản này.

## Local development

Node 24+:

```sh
npm ci
cp .env.example .env
# Đặt NODE_ENV=development, APP_URL=http://localhost:3000,
# DATA_DIR=./data và tạo các secrets độc lập.
npm run build
npm start
```

Mở `http://localhost:3000`. Với hot reload: chạy backend `npm run dev` và frontend `npm run dev:ui` ở hai terminal. Frontend Vite proxy API tới port 3000. `npm run dev` không dùng watcher backend.

```sh
npm run check
```

Check gồm syntax checks, các integration tests và production frontend build. Tests cover approval/HEAD, claim conflict/expiry, scope changes, path policy, pinned library, provider failure, auth/CSRF/member permissions và vòng MCP qua official client.

CI chạy trên Ubuntu/Node 24, không cần secret hoặc gọi AI thật. AI tests dùng provider mock. Live OpenAI completion cần API key; UI browser QA và Docker/Railway runtime cần được xác minh trên môi trường deploy.

## Source map

- `src/App.jsx`, `src/styles.css`: React UI và design tokens.
- `server/index.js`: HTTP API, auth middleware, health/static server.
- `server/service.js`: state machine, immutable approvals, claim và policy.
- `server/mcp.js`: tools + Streamable HTTP transport.
- `server/ai.js`: AI structured request preparation.
- `server/library.js`: commit-pinned GitHub library sync.
- `server/db.js`: SQLite storage.
- `tests/lab.test.js`: workflow + MCP integration verification.

