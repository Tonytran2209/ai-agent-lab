// Presentation only: execution authority remains enforced by the server.
export function projectSettingsState(p, runtime = {}) {
 const direct = runtime.workflow?.mode === 'direct-v1';
 const classifier = runtime.classifier;
 const automatic = p.automationMode === 'impact-auto';
 const releaseReady = Boolean(p.releaseEnabled && p.releaseEnvironment && p.ciReady && p.autoCompleteAfterApproval);
 const missing = [!p.enabled && 'project đang tạm dừng', !p.runnerEnabled && 'worker đang tắt', !p.ciReady && 'chưa có cấu hình CI', !p.releaseEnabled && 'chưa bật phát hành', !p.releaseEnvironment && 'chưa có môi trường Railway', !p.autoCompleteAfterApproval && 'chưa bật tự phát hành sau CI'].filter(Boolean);
 let classifierDescription = !classifier ? 'Đang đọc cấu hình AI trên server.' : !classifier.enabled ? 'AI phân loại toàn hệ thống đang tắt. Feedback chuyển thẳng cho Codex; công tắc này chỉ lưu lựa chọn của project.' : !classifier.configured ? 'Thiếu API key trên server. Feedback chuyển cho Codex; công tắc này chỉ lưu lựa chọn của project.' : p.agentEnabled === false ? 'Đang bỏ qua phân loại AI. Codex nhận nguyên feedback để khảo sát.' : classifier.strategy === 'plan' ? 'Server đang dùng chế độ lập kế hoạch cũ; xem AI & model để chuyển sang phân loại.' : `${classifier.model} phân loại sơ bộ một lần trước khi chuyển Codex. Codex xác minh lại từ code và MD.`;
 if (!p.enabled) classifierDescription += ' Project đang tạm dừng.';
 const classification = classifier?.enabled && classifier.configured && p.agentEnabled !== false ? (classifier.strategy === 'plan' ? 'AI lập kế hoạch' : 'AI phân loại') : 'Chuyển nguyên feedback';
 const releaseLabel = !p.releaseEnabled ? 'Chưa bật phát hành' : !p.releaseEnvironment ? 'Thiếu môi trường Railway' : !p.ciReady ? 'Cần cấu hình CI' : p.autoCompleteAfterApproval ? 'Tự phát hành sau CI' : 'Admin nghiệm thu trước phát hành';
 const pipeline = !p.enabled ? 'Project tạm dừng tiếp nhận feedback và nhận việc mới.' : !p.runnerEnabled ? 'Tiếp nhận feedback; worker chưa được phép nhận việc cho project này.' : `${classification} → Codex khảo sát, sửa code và MD → kiểm tra CI → ${releaseReady ? 'tự merge và theo dõi Railway' : p.releaseEnabled ? 'chờ admin nghiệm thu để phát hành' : 'trả kết quả; chưa phát hành'}.`;
 return {
  direct, pipeline, releaseLabel, classifierDescription,
  workspaceLabel: !runtime.workflow ? 'Đang tải' : direct ? 'Một worktree / project trên Mac' : 'Luồng kiểm tra chi tiết',
  queueLabel: !runtime.workflow ? 'Đang tải' : runtime.workflow.serializedProjects ? 'Xử lý tuần tự' : 'Không bật hàng đợi tuần tự',
  approvalDescription: automatic ? 'Low/medium tự chạy khi đủ phạm vi và điều kiện kiểm tra. High hoặc quyết định sản phẩm chưa rõ cần admin xác nhận.' : 'Low đủ điều kiện được tự chạy. Medium và high cần admin xác nhận trước khi sửa code; khảo sát chỉ đọc vẫn tự chạy.',
  automaticWarning: automatic && missing.length ? 'Chưa sẵn sàng tự chạy medium: '+missing.join('; ')+'.' : '',
  repairDescription: p.ciRepairEnabled ? `Tối đa hai lượt sửa trong phạm vi low/medium đã cấp quyền, trên cùng PR.${!releaseReady ? ' Chỉ hoạt động khi request có quyền tự phát hành và CI thất bại.' : ''} Hết lượt hoặc cần mở rộng phạm vi sẽ dừng.` : 'CI thất bại sẽ dừng để xử lý; Codex không tự nhận lượt sửa CI.'
 };
}
export function mainModelSavePayload(saved, mainModel) {
 return Object.fromEntries(['mode','strategy','model','dailyCalls','dailyTokens','autoSync','semanticEnabled','syncMinutes'].map(k=>[k,saved[k]]).concat([['mainModel',mainModel]]));
}
