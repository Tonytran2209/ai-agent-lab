export const workflowLabels = {
  feedback: "Feedback mới — chờ chuẩn bị request",
  "needs-triage": "Cần bổ sung thông tin",
  draft: "Bản nháp — chưa vào hàng đợi Codex",
  "awaiting-approval": "Request đã tạo — chờ admin duyệt",
  approved: "Đã vào hàng đợi — chờ Mac nhận",
  claimed: "Mac đã nhận request",
  running: "Codex đang thực thi",
  review: "Có kết quả — chờ nghiệm thu",
  completed: "Đã nghiệm thu",
  failed: "Kiểm tra thất bại — cần xử lý",
  rejected: "Request đã bị từ chối",
};
export function preparationRunning(request) {
  return request.preparation?.status === "running" && Date.now() - Date.parse(request.preparation.startedAt) < 90000;
}
export function requestSignal(request) {
  return request.status + (request.verification ? ":browser:" + request.verification.phase : "") + (request.release ? ":release:" + request.release.phase : "") + (request.preparation ? ":" + request.preparation.status : "");
}
export function workflowMessage(request, runner, aiConfigured = true) {
  if (request.status === "verifying") return request.verification?.note || "Đang chờ GitHub kiểm tra trình duyệt trước nghiệm thu. Chưa merge/deploy.";
  if (request.status === "review" && request.verification?.phase === "passed") return "Đã có kiểm tra trình duyệt bổ sung trên đúng kết quả. Xem bằng chứng và nghiệm thu tiêu chí trước khi phát hành.";
  if (request.release) return request.release.note;
  if (!aiConfigured && ["queued", "running"].includes(request.preparation?.status)) return "Feedback đã lưu. Admin cần cấu hình AI để hệ thống tự chuẩn bị request.";
  if (request.preparation?.status === "queued") return request.preparation.retryAt ? "AI sẽ tự thử lại sau ít giây. Bạn không cần gửi lại feedback." : "Feedback đã nhận. AI sẽ tự lập kế hoạch, phân loại rủi ro và chuyển sang bước tiếp theo.";
  if (request.policyVersion === "risk-v2" && request.status === "awaiting-approval") return request.draft?.risk === "high" ? "Rủi ro cao: admin cần đọc kế hoạch và phê duyệt rõ ràng trước khi chạy." : "Admin kiểm tra kế hoạch và các giả định bên dưới, rồi nhấn Đã kiểm tra · chạy. Không cần soạn lại feedback.";
  if (preparationRunning(request)) return "AI đang đọc feedback và chuẩn bị phạm vi, tiêu chí nghiệm thu. Chưa gửi công việc sang Codex.";
  if (request.preparation?.status === "running") return "Lần chuẩn bị trước có thể bị gián đoạn. Feedback vẫn được giữ; hãy nhấn Chuẩn bị để thử lại.";
  if (request.preparation?.status === "failed") return (request.preparation.error ? request.preparation.error + " " : "") + "Chuẩn bị request chưa thành công. Feedback vẫn được giữ; thử lại hoặc soạn thủ công. Chưa gửi công việc sang Codex.";
  if (request.status === "feedback") return "Feedback đã lưu. Admin cần nhấn Chuẩn bị để AI tạo request; chưa có tác vụ nào được gửi sang Mac.";
  if (request.status === "awaiting-approval") return "Nhãn low risk chỉ là mức rủi ro, chưa phải quyền thực thi. Kiểm tra phạm vi bên dưới và nhấn Duyệt & chạy để đưa request vào hàng đợi.";
  if (request.status === "approved") return runner?.connected
    ? runner.phase === "running" ? "Mac đang xử lý request khác. Request này sẽ được nhận khi runner rảnh." : "Mac đã kết nối. Runner kiểm tra mỗi 15 giây khi rảnh; Codex chưa bắt đầu request này."
    : "Chưa nhận được heartbeat gần đây từ Mac. Request vẫn trong hàng đợi; kiểm tra Mac đang thức, có mạng và runner đã bật.";
  if (request.status === "needs-triage") return "Chưa vào hàng đợi Codex: còn " + (request.draft?.questions?.length || 0) + " câu hỏi cần giải quyết. Xem các câu hỏi bên dưới hoặc Hoạt động nếu runner đã dừng. Nhãn low risk không bỏ qua bước làm rõ và duyệt.";
  if (["claimed", "running"].includes(request.status)) return "Mac đã claim request. Xem Hoạt động để theo dõi tiến trình; kết quả sẽ được gửi về Lab sau khi kiểm tra.";
  if (request.status === "review") return "Codex đã gửi kết quả. Mở mục Kết quả thực hiện để xem checks và commit; admin vẫn cần nghiệm thu.";
  if (request.status === "failed" && request.executionFailure) return "Mac đã dừng do lỗi thực thi. Kế hoạch và quyền đã duyệt vẫn được giữ; admin có thể Thử chạy lại sau khi xử lý môi trường. Không cần bổ sung feedback.";
  if (request.status === "failed") return "Có kiểm tra không đạt. Xem tab Kết quả trước khi chuẩn bị lại request.";
  return "Xem Hoạt động và Kết quả để kiểm tra lịch sử xử lý.";
}
export function inRequestQueue(request) {
  return Boolean(request.draft) && request.status !== "rejected";
}
export function requestChanges(previous, current) {
  if (!previous) return [];
  return current.filter(r => !previous.has(r.id) || previous.get(r.id) !== requestSignal(r));
}
