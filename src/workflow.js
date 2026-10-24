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
  if(request.preparation?.engine==="codex-local")return request.preparation.status==="running"&&Boolean(request.planning?.lease)&&Date.parse(request.planning.lease.expiresAt)>Date.now();
  return request.preparation?.status === "running" && Date.now() - Date.parse(request.preparation.startedAt) < 90000;
}
export function requestSignal(request) {
  return request.status + (request.delivery ? ":delivery:"+request.delivery.phase : "") + (request.verification ? ":browser:" + request.verification.phase : "") + (request.release ? ":release:" + request.release.phase : "") + (request.preparation ? ":" + request.preparation.status : "");
}
export function workflowMessage(request, runner, aiConfigured = true) {
  if(request.ciRepair?.phase==='running'||request.ciRepair?.phase==='queued')return 'Codex đang tự sửa CI trên cùng PR; giữ phạm vi đã duyệt. Chưa merge.';
  if(request.projectQueue?.blocked)return 'Chờ '+request.projectQueue.blockedBy+' hoàn tất deploy và đồng bộ MD; sau đó cập nhật base mới trước khi xử lý.';
  if(request.preparation?.engine==='lab-agent'&&['queued','running'].includes(request.preparation.status))return 'Lab Agent đang phân loại feedback để chuyển Codex; chưa đọc source hoặc lập kế hoạch.';
  if(request.executionWorker?.kind==='cloud'&&['claimed','running'].includes(request.status))return 'Cloud worker đã nhận request và đang thực thi trong worktree riêng. Kết quả sẽ gửi về Lab để kiểm tra CI và bằng chứng.';
  if(request.verification?.phase==='failed')return request.verification.note;
  if(request.status==='failed'&&request.result&&request.contract?.required&&!request.contract.complete)return "Liên kết tiêu chí/bằng chứng hoặc đánh giá tài liệu chưa đủ. Xem Quy định MD → tiêu chí → bằng chứng; CI chung không thay thế phần còn thiếu.";
  if(request.contractProtocol&&request.preparation?.status==='queued'&&runner?.contractProtocol!==request.contractProtocol)return "Feedback đã lưu. Chờ Mac runner nạp bản hỗ trợ liên kết MD; chưa gọi khảo sát AI.";
  if(request.status==="rechecking")return "Mac sẽ kiểm tra lại artifact trên đúng commit, nhận diện CRLF. Không gọi AI hoặc sửa code; lỗi cũ vẫn nằm trong lịch sử.";
  if(request.preparation?.engine==='codex-local'&&['queued','running','failed'].includes(request.preparation.status)){
    if(request.preparation.status==='queued'&&request.planning?.budgetRemaining===0)return 'Project đã dùng hết 20 lượt khảo sát hôm nay (UTC). Feedback vẫn được giữ và sẽ tiếp tục khi ngân sách ngày mới mở; không gọi thêm AI.';
    if(request.preparation.status==='queued')return runner?.connected?'Đã lưu feedback. Codex sẽ đọc code và MD khi worker rảnh.':'Đã lưu feedback. Chờ worker kết nối để đọc code và MD.';
    if(request.preparation.status==='failed')return request.preparation.error||'Khảo sát trên Mac đã dừng; kiểm tra trước khi thử lại.';
    return preparationRunning(request)?'Codex đang đọc code và kinh nghiệm liên quan. Chưa có quyền sửa file; server sẽ kiểm tra rủi ro của kế hoạch.':'Claim khảo sát đã hết hạn. Admin cần xác nhận planner cũ đã dừng trước khi khôi phục.';
  }
  if (request.status === 'verifying' && request.criterionCiStatus) return request.criterionCiStatus;
  if (request.status === "verifying" && request.delivery?.approvalHash) return "Đang kiểm tra CI trên PR. Khi đạt, hệ thống tự merge và theo dõi deploy theo quyền đã duyệt.";
  if (request.status === "verifying") return request.verification?.note || "Đang chờ GitHub kiểm tra trình duyệt trước nghiệm thu. Chưa merge/deploy.";
  if (request.status === "review" && request.delivery?.approvalHash) return request.delivery.phase==="failed" ? "Tự phát hành đã dừng: "+request.delivery.note : "Đang xác minh CI độc lập để tự phát hành theo quyền đã duyệt.";
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

export function requiresAttention(r) {
  if(r.projectQueue?.blocked)return false;
  if(['queued','running'].includes(r.ciRepair?.phase)&&(!r.ciRepair.lease||Date.parse(r.ciRepair.lease.expiresAt)>Date.now()))return false;
  if(r.ciRepair?.lease&&Date.parse(r.ciRepair.lease.expiresAt)<=Date.now())return true;
  if(r.projectQueue?.staleBase&&r.draft)return true;
  if([r.lease,r.planning?.lease,r.verification?.lease,r.recheck?.lease,r.release?.lease].some(l=>l&&Date.parse(l.expiresAt)<=Date.now()))return true;
  if(r.preparation?.status==='queued'||preparationRunning(r))return false;
  if(r.status==='approved'&&r.executionReadiness?.ready===false)return true;
  if(r.status==='review')return !r.delivery?.approvalHash||r.delivery.phase==='failed';
  return ['awaiting-approval','failed','needs-triage'].includes(r.status)||r.release?.phase==='failed'||r.preparation?.status==='failed';
}

// Stage progress, never a fabricated elapsed-time percentage or proof of deployment.
export function taskProgress(r,runner){
 if(['queued','running'].includes(r.ciRepair?.phase))return {steps:['Tiếp nhận','Phân loại','Codex','Kiểm tra','Phát hành'],current:3,done:false,failed:false,waiting:r.ciRepair.phase==='queued',title:'Tự sửa CI · lượt '+(r.ciRepair.attempts||1)+'/2',message:'Codex kiểm tra lỗi trên cùng PR trong scope đã duyệt; chờ CI xác minh lại trước merge.'};
 if(r.projectQueue?.blocked)return {steps:['Tiếp nhận','Phân loại','Codex','Kiểm tra','Phát hành'],current:0,done:false,failed:false,waiting:true,title:'Chờ lượt · vị trí '+r.projectQueue.position,message:'Project đang xử lý '+r.projectQueue.blockedBy+'. Chỉ bắt đầu sau khi request trước hoàn tất deploy và đồng bộ MD; không ghi đè lên bản đang chạy.'};
 if(r.projectQueue?.staleBase&&r.draft&&!r.lease)return {steps:['Tiếp nhận','Phân loại','Codex','Kiểm tra','Phát hành'],current:2,done:false,failed:false,waiting:true,title:'Cần cập nhật base',message:'Main đã thay đổi. Chuẩn bị lại kế hoạch trên base mới trước khi thực thi; quyền cũ không được dùng cho nội dung mới.'};
 if(r.preparation?.engine==='codex-local'&&(r.preparation.status==='queued'||preparationRunning(r)))return {steps:['Tiếp nhận','Phân loại','Codex','Kiểm tra','Phát hành'],current:2,done:false,failed:false,waiting:r.preparation.status==='queued',title:r.preparation.status==='queued'?'Chờ Codex khảo sát':r.preparation.stage==='investigating'?'Codex đang điều tra':'Codex đang khảo sát',message:'Đang cập nhật phương án từ feedback, code và MD. Không cần duyệt kế hoạch cũ; low/medium đủ điều kiện sẽ tự tiếp tục.'};
 if(['awaiting-approval','needs-triage','approved','failed'].includes(r.status)&&r.executionReadiness?.ready===false)return {steps:['Tiếp nhận','Phân loại','Codex','Kiểm tra','Phát hành'],current:2,done:false,failed:false,waiting:true,title:r.executionReadiness.needsUser===false?'Điều tra chưa hoàn tất':'Cần thông tin từ bạn',message:r.executionReadiness.needsUser===false?'Codex chưa xác định được phương án an toàn trong giới hạn khảo sát. Xem Nhật ký để kiểm tra bước điều tra.':r.executionReadiness.blockers[0]};
 const steps=['Tiếp nhận','Phân loại','Codex','Kiểm tra','Phát hành'];
 let current=0,done=r.release?.phase==='deployed';
 if(r.preparation?.engine==='lab-agent'||r.classification)current=1;
 if(r.preparation?.engine==='codex-local'||r.draft||['approved','claimed','running'].includes(r.status))current=2;
 if(r.result||['verifying','review','completed','rechecking'].includes(r.status))current=3;
 if(r.release?.phase==='deploying'||r.release?.mergeCommit||done)current=4;
 const expired=[r.lease,r.planning?.lease,r.verification?.lease,r.recheck?.lease,r.release?.lease].some(l=>l&&Date.parse(l.expiresAt)<=Date.now());
 const failed=expired||r.status==='failed'||r.release?.phase==='failed'||r.delivery?.phase==='failed'||r.preparation?.status==='failed';
 const waiting=['awaiting-approval','needs-triage','rejected'].includes(r.status)||r.status==='review'&&!r.delivery?.approvalHash;
 let title=done?'Đã cập nhật ứng dụng':failed?'Cần xử lý':waiting?r.status==='rejected'?'Đã dừng':'Cần xác nhận':steps[current];
 let message=done?'Thay đổi đã được triển khai.':failed?'Có bước chưa hoàn tất. Xem Nhật ký để biết nguyên nhân và cách tiếp tục.':waiting?r.status==='rejected'?'Request đã được dừng.':'Xem phạm vi và xác nhận bên dưới để tiếp tục.':current===0?'Feedback đã được lưu.':current===1?'AI phân loại nội dung và mức độ rủi ro.':current===2?r.preparation?.engine==='codex-local'?(r.preparation.status==='queued'?'Đã chuyển feedback; chờ Codex nhận việc.':'Codex đọc code và MD, xác định phương án sửa.'):r.status==='approved'?'Đã có kế hoạch; chờ worker nhận việc.':'Codex đang thực hiện thay đổi và cập nhật tài liệu nếu cần.':current===3?'Đang kiểm tra kết quả trước khi phát hành.':'Đã merge; đang xác nhận Railway deploy.';
 if(r.attachments?.length&&r.preparation?.status==='queued'&&runner?.connected&&runner.attachmentProtocol!=='feedback-images-v1')message='Ảnh và feedback đã lưu. Mac runner cần nạp bản hỗ trợ ảnh trước khi nhận việc.';
 if(failed){
  const badCheck=r.result?.checks?.find(c=>!c.passed);
  const reason=expired?'Phiên xử lý đã hết hạn; cần kiểm tra worker trước khi tiếp tục.':r.release?.phase==='failed'?r.release.note:r.preparation?.status==='failed'?r.preparation.error:r.verification?.phase==='failed'?r.verification.note:r.executionFailure?.note||(!r.contract?.complete&&r.contract?.required?'Thiếu bằng chứng tiêu chí hoặc đánh giá tài liệu.':badCheck?'Kiểm tra chưa đạt: '+badCheck.command:null);
  if(reason)message=String(reason).replace(/\s+/g,' ').slice(0,200)+' Xem Nhật ký.';
 }
 if(current===3&&!failed&&!waiting&&r.criterionCiStatus)message=r.criterionCiStatus;
 if(current===2&&!runner?.connected&&r.executionWorker?.kind!=='cloud'&&!failed&&!waiting)message+=' Mac chưa kết nối; cloud dự phòng xử lý khi đủ điều kiện.';
 return {steps,current,done,failed,waiting,title,message};
}

// A local failure stays in history; only exact criterion proof for this commit can supersede its display.
export function checkPresentation(request,check){
 const verified=request.criterionCi?.commit===request.result?.commit&&request.criterionCi?.criteria?.some(p=>check.command===p.command||check.command===p.command+' --list');
 return {superseded:!check.passed&&Boolean(verified),label:check.passed?'Đạt':verified?'Lỗi cục bộ · đã có CI xác minh':'Chưa đạt trên Mac'};
}
