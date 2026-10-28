# Từ chối, dừng và xoá feedback/request

Admin có mục **Từ chối / dừng task** trong chi tiết feedback. Nhập lý do để lưu vào Nhật ký. Thao tác chỉ áp dụng request được chọn, không tắt runner hoặc project.

- Feedback/task đang chờ dừng ngay; không gọi lại AI, không cấp thêm lượt khảo sát.
- Khảo sát, sửa code, kiểm tra artifact hoặc sửa CI đang có claim: chuyển sang `rejected`, thu hồi approval, giữ nguyên claim và đặt `stopControl.pending`. Heartbeat/báo cáo thành công tiếp theo bị từ chối. Runner hiện có sẽ abort tiến trình ở heartbeat tiếp theo (thường trong 60 giây nếu kết nối bình thường); tiến trình không có heartbeat cần admin dừng riêng. Không coi phản hồi HTTP hoặc lease hết hạn là bằng chứng tiến trình đã dừng.
- Hàng đợi và khoá file vẫn được giữ, kể cả qua restart. Sau khi claim hết hạn, admin phải kiểm tra worker thực sự đã dừng rồi bấm **Tôi đã xác minh worker dừng**. Chỉ lúc đó mới giải phóng claim và cho request sau tiến lên. Không xoá worktree, reset source hoặc đóng PR tự động. Lỗi/báo cáo cũ không được khởi động lại task đã dừng.
- Trong lúc worker đang thao tác GitHub/PR hoặc phát hành, chờ bước đó kết thúc rồi dừng. Task đã merge/deploy không thể thu hồi bằng nút dừng; vẫn giữ nguyên trạng thái phát hành và cơ chế đồng bộ MD.

**Xoá task** là xoá mềm: chỉ task đã dừng hoặc hoàn tất, không còn claim, mới chuyển vào **Thùng rác**. Bản ghi, ảnh đính kèm, nhật ký, kế hoạch, artifact và provenance vẫn còn. Chọn bộ lọc Thùng rác rồi **Khôi phục từ thùng rác** để hiện lại task; không phục hồi approval và không chạy lại. Muốn thực hiện tiếp một task mới đã dừng, tạo feedback mới.

API quản trị dùng session, CSRF và `expectedRevision` lấy từ `updatedAt` mới nhất; mutation stale trả 409:

- `POST /api/requests/:id/stop`: `{note, expectedRevision}`.
- `POST /api/requests/:id/stop/confirm`: `{workerStopped:true, expectedRevision}`. Chỉ sau khi mọi claim đã hết hạn và admin xác minh worker dừng.
- `DELETE /api/requests/:id`: `{expectedRevision}`; không xoá vật lý.
- `POST /api/requests/:id/restore`: `{expectedRevision}`.
- `GET /api/requests` ẩn task trong thùng rác; admin dùng `?includeArchived=true` để lấy cả task đã xoá mềm. Danh sách nội bộ vẫn giữ đầy đủ bản ghi để bảo toàn khoá FIFO, bộ nhớ, provenance và đồng bộ MD sau deploy.

Không thêm quyền dừng/xoá vào MCP. Endpoint `/reject` cũ và khôi phục claim cũ vẫn tương thích với các request cũ; request đã dùng cơ chế dừng mới không được rebase/retry ngầm.

Kiểm tra hồi quy: `tests/request-controls.test.js` bao gồm quyền truy cập/CSRF, revision stale, claim/live/expired/restart, callback trễ, FIFO/cạnh tranh file, các project độc lập, thùng rác/khôi phục và đồng bộ MD sau deploy.
