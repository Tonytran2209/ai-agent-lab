# Agent Lab → Codex trên Mac

## Luồng mới

Admin gửi feedback, chọn **Tự soạn và chạy nếu UI rủi ro thấp** (mặc định) hoặc **Tự soạn request, tôi duyệt trước khi chạy**. Feedback được lưu trước khi AI chạy; lỗi AI không làm mất feedback. Member chỉ gửi feedback; admin chuẩn bị và cấp quyền thực thi.

Tự duyệt là quyền admin lựa chọn cho lần chuẩn bị, không phải quyết định tự do của model. Server yêu cầu: design/low, không câu hỏi, không file mới, tối đa 5 file component JSX/TSX hoặc CSS trực tiếp dưới src, tránh tên file liên quan auth/login/session/payment/billing/permission/storage/provider, đủ cách tái hiện và kết quả mong muốn. Các request khác chờ admin. Bộ lọc này giảm phạm vi, không chứng minh một thay đổi an toàn về ngữ nghĩa.

**Duyệt & chạy** lưu nội dung đang sửa và duyệt trong một transaction; không cần lưu rồi duyệt lần nữa. Request đã duyệt chờ Mac nhận (poll 15 giây khi rảnh, từng request một). Khi Mac ngủ/tắt hoặc runner chưa bật, request giữ trong hàng đợi.

Mac runner chạy **Codex CLI non-interactive**, không tự mở hoặc gửi tin nhắn vào chat GUI. Mỗi request có worktree/branch riêng, claim nguyên tử trên server, heartbeat mỗi phút. Runner chạy npm ci, Codex, kiểm tra diff và npm run check rồi tạo commit cục bộ. Nó gửi báo cáo về Lab và giữ worktree để bạn xem. Không push/merge/deploy. Kết quả vẫn là runner/agent-reported, không thay thế CI và nghiệm thu của người dùng.

## Cài một lần

1. Merge/deploy phiên bản mới của Lab lên Railway trước. MCP server phải báo version **1.1.0**. Runner từ chối server cũ để tránh nhận việc với contract completion không tương thích.
2. Clone/pull phiên bản mới của repo này. Installer sẽ copy runtime và một checkout riêng vào `~/Library/Application Support/AI Agent Lab` để tránh macOS chặn tiến trình nền đọc Documents/Desktop/Downloads. Cần Node 24+, Git, Codex CLI có `exec --ignore-user-config`, và tài khoản Codex đã đăng nhập (`codex login status`). Đường dẫn Codex có thể được truyền bằng `--codex /absolute/path`.
3. Chạy `npm ci` trong thư mục Agent Lab.
4. Khai báo token trong Terminal zsh (không dán vào chat hoặc file Git):

```sh
read -s "lab_mcp_token?Dán MCP_TOKEN Railway rồi Enter: "
printf '\n'
export AI_AGENT_LAB_MCP_TOKEN="$lab_mcp_token"
unset lab_mcp_token
```

Nếu token đã có trong môi trường, bỏ qua bước này.

5. Cài runner, thay domain bằng domain thực tế:

```sh
npm run runner:install -- \
  --repo /Users/tonytoly/Documents/Codex/2026-08-13/github-plugin-github-openai-curated-remote-3/RebuildWriterStudioTool \
  --url https://DOMAIN-CUA-BAN/mcp
```

Thêm `--dry-run` để chỉ sinh config/LaunchAgent trong `mac/state`, chưa lưu token/cài/chạy. Installer thật kiểm tra MCP version và đọc queue, lưu token vào macOS Keychain (`ai-agent-lab-mcp`), cài `~/Library/LaunchAgents/com.ai-agent-lab.runner.plist`, rồi chạy. macOS có thể hỏi quyền Keychain. Token không nằm trong plist/config repo. Nếu môi trường chặn Keychain, thêm `--credential-file` để lưu token tại `mac/state/mcp-token`, thư mục quyền 700 và tệp quyền 600 (chỉ user sở hữu đọc được, đã gitignore); wrapper đọc tệp khi khởi động. Đây là lưu trữ trên đĩa, không mã hóa bằng Keychain. Agent tự chạy sau đăng nhập, không cần khai báo lại token sau reboot. Runtime được cài riêng trong Library; checkout Writer Studio gốc và thư mục source Agent Lab không bị sửa bởi worker.

Nếu installer báo `Bootstrap failed: 5` khi chạy trong sandbox, các tệp đã cài nhưng LaunchAgent chưa bật. Chạy lệnh `launchctl bootstrap` được installer in ra trong Terminal của macOS (không cần sudo). Xác minh bằng `launchctl print "gui/$(id -u)/com.ai-agent-lab.runner"` và xem log.

## Xem và dừng

```sh
# Xem log của runtime đã cài:
tail -f "$HOME/Library/Application Support/AI Agent Lab/mac/state/runner.log"
cat "$HOME/Library/Application Support/AI Agent Lab/mac/state/runner-error.log"

# Dừng nhận việc và dừng tác vụ hiện tại:
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.ai-agent-lab.runner.plist

# Chạy lại:
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.ai-agent-lab.runner.plist
```

Muốn gỡ: bootout trước, xóa plist trên, rồi tùy chọn xóa Keychain item `ai-agent-lab-mcp` trong Keychain Access. Worktree/branch không tự xóa để tránh mất kết quả.

Nếu runner bị kill/mất điện, lock `~/Library/Application Support/AI Agent Lab/mac/state/runner.lock` có thể còn. Đọc PID trong `runner.lock/pid` và xác minh process/agent con cũ đã dừng trước khi xóa lock. Không tự retry các request đã claim. Claim hết hạn vẫn cần admin xác minh agent cũ đã dừng và mở lại/duyệt lại trong Lab. Nếu tác vụ bị chặn, runner dừng process trước rồi yêu cầu re-triage; bạn xem journal `mac/state/REQ-*.json` và hoạt động trong Lab.

## Kiểm tra kết quả

Trong **Kết quả**, commit cục bộ được ghi rõ **chưa push** và branch `lab/REQ-...`. Journal trong `~/Library/Application Support/AI Agent Lab/mac/state` trên Mac có đường dẫn worktree. Mở worktree trong Codex, xem diff/kiểm tra hành vi, sau đó tự push/tạo PR nếu cần. Khi chưa có node_modules, runner dùng npm ci trong worktree; cần mạng tới npm. Chạy `git config user.name`/`user.email` trên máy để Git có thể commit.

Codex chạy workspace-write, vẫn chịu sandbox; hành động cần quyền bổ sung có thể thất bại và đưa request về cần xử lý. Không dùng bypass sandbox. Runner dùng `--ignore-user-config` (giữ auth Codex, bỏ cấu hình model/MCP tùy chỉnh) để worker không tự gọi lại Lab hay thừa hưởng MCP khác; token Lab không được chuyển cho child. Các quyền file không được cưỡng chế theo từng allowedPath: đây là kiểm tra diff sau thực thi, vẫn cần review.

Tài liệu Codex: https://learn.chatgpt.com/docs/non-interactive-mode
