# Agent Lab → Codex trên Mac

## Luồng mới

User/admin gửi feedback một lần. Backend tự chuẩn bị kế hoạch và áp dụng risk policy v2: low tự sang Mac; medium admin kiểm tra một lần; high cần phê duyệt rõ ràng. Không yêu cầu câu hỏi làm rõ cho low. Backend nâng risk nếu scope mới/rộng/nhạy cảm, không chỉ dựa vào nhãn model.

Inbox hiển thị trạng thái, kế hoạch ngắn, hành động chính và log gần nhất; thông báo là drawer trượt bên phải. Các quyết định đã nghiệm thu/từ chối được truy xuất làm ví dụ cho AI, không tự thay đổi policy.

Mac runner chạy Codex CLI nền, từng request trong worktree riêng, claim nguyên tử và heartbeat. Nó chạy npm ci, Codex, kiểm tra diff và npm run check rồi tạo commit cục bộ và báo kết quả. Không tự push/merge/deploy. Khi Mac ngủ hoặc không có mạng, công việc đã sẵn sàng vẫn giữ trong hàng đợi.

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

## Lỗi môi trường và chạy lại

Runner chạy `npm ci` tại gốc và `backend` (nếu có lockfile) trước khi gọi Codex, sau đó kiểm tra toàn bộ bằng `npm run check`. Không sửa package manifest để né lỗi.

Lỗi cài đặt, đăng nhập Codex, timeout hoặc lỗi thực thi được báo bằng `report_execution_failure`: giữ nguyên kế hoạch, mức rủi ro và fingerprint đã duyệt, giải phóng claim sau khi worker dừng. Admin chọn **Thử chạy lại**; không phải AI phân tích lại feedback. Chỉ lỗi cần mở rộng file/phạm vi mới dùng `request_scope_change`.

Lần chạy lại có thể khôi phục worktree chưa commit của lần dừng trước khi request ID, branch, base commit và exact allowedPaths còn khớp. Không tự khôi phục quyền đã bị thu hồi bởi runner cũ; admin vẫn cần duyệt lại kế hoạch đó. Kết quả kiểm tra không đạt hoặc thiếu kiểm tra hành vi phải được báo trung thực, không được tự đánh dấu nghiệm thu.

## Phát hành sau nghiệm thu

Bật publisher trên Mac bằng `releaseEnabled: true`, `ghPath` trỏ đến GitHub CLI đã đăng nhập với quyền push/PR/merge và `releaseEnvironment` khớp chính xác môi trường deployment do Railway báo trên GitHub. Installer hỗ trợ `--enable-release --release-environment "tên môi trường"`. Không đưa GitHub credential vào Railway hoặc prompt Codex.

Nút **Nghiệm thu & phát hành** tạo quyền phát hành gắn với kết quả đã kiểm tra. Request đã nghiệm thu trước khi có tính năng này cần chọn **Phát hành** một lần. High risk cần xác nhận riêng việc phát hành. Các artifact ngoài Mac vẫn có thể nghiệm thu nhưng không được publisher tự đẩy.

Mac xử lý từng bước có claim riêng: xác minh commit/parent/scope, push nhánh (không force), tạo hoặc tìm lại PR, chờ `writer-check` của GitHub Actions và các check khác, merge với expected head SHA, rồi theo dõi deployment do `railway-app[bot]` tạo cho đúng merge commit và môi trường. Không xem trang health chung là bằng chứng đã deploy đúng bản. CI không có hoặc thất bại, PR xung đột, head/scope thay đổi đều ngăn merge. Không chạy migration sản xuất.

Trạng thái PR, CI, merge commit và Railway hiện ngay trong inbox và thông báo. **Thử phát hành lại** tiếp tục từ PR hoặc merge commit đã có; không chạy lại Codex, không merge hai lần. Lỗi/timeout theo dõi deploy không có nghĩa main đã rollback. Mỗi lần chờ CI hoặc deploy tối đa 30 phút; mỗi poll xử lý một bước. Publisher giữ nguyên các nhánh và worktree để có thể kiểm tra/khôi phục.
