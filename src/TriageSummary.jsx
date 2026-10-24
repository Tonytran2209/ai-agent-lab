import React from 'react';
export default function TriageSummary({request:r}){
 const c=r.classification;if(!c)return null;
 return <details className="request-disclosure"><summary>Luna · phân loại sơ bộ<span>{c.risk} · {c.category}</span></summary><p>{c.summary}</p>{c.policyAdjusted&&<p>Luna dự kiến {c.modelRisk}; quy tắc nội dung giữ mức định tuyến {c.risk}. Codex vẫn phải xác minh tác động thực tế.</p>}{c.contextStale&&<p className="error">Ngữ cảnh phân loại thuộc base trước. Codex phải đối chiếu lại với source và MD mới.</p>}{c.uncertainty?.length>0&&<div className="triage-checklist"><h4>Codex cần xác minh</h4><ul>{c.uncertainty.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}<small>{c.contextSources?.length||0} nguồn MD · {c.learningSources?.length||0} kinh nghiệm đã xác minh{c.projectMap?' · Có bản đồ kiến thức project':''}. Nhãn dự kiến không cấp quyền thực thi; Codex xác minh tác động trước khi chốt.</small></details>;
}
