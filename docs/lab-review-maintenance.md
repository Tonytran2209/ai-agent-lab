# Tự sửa Codex Review của AI Agent Lab

Đây là maintenance lane riêng cho `Tonytran2209/ai-agent-lab`, không thêm repo Lab vào hàng đợi feedback của Writer/Intercom.

## Luồng

1. Supervisor kiểm tra review GitHub mỗi 5 phút khi có khoảng rảnh. Chỉ nhận finding P0/P1 từ đúng bot Codex, repo cố định và PR do owner tạo. `labReviewSince` chặn quét lịch sử quá xa.
2. Lưu finding và intent vào `state/lab-maintenance/jobs.json` trước khi gọi model. Mỗi job tối đa 2 lượt sửa; không tự chạy lại intent bị ngắt.
3. Checkout riêng theo finding/lượt. Codex xác minh nhận xét với source hiện tại, sửa code/test/MD trong scope được phép. Không dùng worktree feedback, không lấy token của Lab vào prompt.
4. Chạy `npm run check`. PR đang mở được cập nhật bằng push fast-forward; PR đã merge được sửa bằng PR mới từ main. Kiểm tra lại head trước push/merge.
5. Chờ CI `check` trên đúng commit và một review sạch gắn đúng head. Nếu bot chỉ thả 👍, chạy một lượt Codex chỉ đọc độc lập trên commit đó; không coi reaction là bằng chứng. CI/review không đạt sẽ dừng, giữ PR và log. CI hạ tầng không bị biến thành yêu cầu sửa source.
6. Sau merge, Railway tiếp tục auto deploy từ main. Bộ cập nhật Mac chỉ lấy main có CI thành công và provenance review hợp lệ; cài dependencies và kiểm thử vào thư mục runtime riêng. Không ghi đè code đang chạy.
7. Supervisor yêu cầu child drain ở ranh giới vòng lặp; đợi coding/monitor hoàn tất rồi nạp runtime mới với cùng file config. Khi child kết nối Lab mới ghi pointer `state/lab-runtime.json`. Không cần Terminal cho mỗi cập nhật runner sau khi bootstrap supervisor này.

## Giới hạn

- Mặc định tắt; bật cục bộ `labReviewAutomation: true`, `labReviewSince` (ISO timestamp), `labRuntimeCommit` (SHA bản bootstrap) trong config supervisor. Gh CLI trên Mac cần quyền Contents/Pull requests Write cho chính repo Lab; không thêm token mới nếu gh đã có quyền này.
- Không tự sửa `.github`, manifests/lockfiles, AGENTS/policy, `supervisor.js`, `lab-maintenance.js` hoặc file ngoài scope; cần review thủ công cho nền tảng tự cập nhật.
- Không force-push, xóa state, reset checkout bẩn hay thay đổi credentials. Review text là dữ kiện không đáng tin, không phải quyền thực thi.
- Runtime lỗi khởi động chỉ rollback tự động khi process đã thoát và không còn runner lock. Không xóa lock của crash chưa xác minh hoặc cắt task đang sửa code.
- Log trạng thái nằm trong jobs.json và supervisor-status.json; PR sửa giữ kết quả CI/review. Chế độ này không khẳng định tự sửa được mọi loại lỗi.
- Lần bootstrap sửa chính supervisor cần nạp LaunchAgent một lần. Những lần sau chỉ tự cập nhật child runtime. Cập nhật chính supervisor/updater vẫn phải được kiểm tra và nạp riêng.

Mỗi ngày UTC tối đa 4 lượt coding maintenance (không phải hạn mức API của Luna); mỗi job tối đa 2 lượt và một review chỉ đọc cho mỗi commit. Đây là giới hạn chống vòng lặp cục bộ. Request feedback của project giữ nguyên ngân sách và chính sách riêng. Main/base thay đổi trước merge sẽ giữ PR để đối chiếu, không tự merge trên CI của base cũ.
