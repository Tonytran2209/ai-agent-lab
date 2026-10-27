import React from 'react';
export default function ContractTrace({request:r}){
 if(r.workflowProtocol==='direct-v1'||!r.contractProtocol||!r.draft)return null;
 const state=r.contract,impact=r.documentationImpact,labels={missing:'Thiếu bằng chứng',failed:'Chưa đạt',reported:'Agent báo cáo',verified:'CI xác minh','pending-ci':'Chờ CI',planned:'Chờ thực hiện'};
 return <details className="request-disclosure contract-trace" open={r.status==='failed'&&!state?.complete}>
  <summary>Tiêu chí & bằng chứng<span>{r.draft?.traceability?.length||0} tiêu chí</span></summary>
  {r.criterionCiStatus&&<p role="status" className="journal-notice">{r.criterionCiStatus}</p>}
  <p className="journal-intro">Đối chiếu quy định MD, cách kiểm tra và kết quả cho từng tiêu chí.</p>
  <div className="contract-criteria">{(r.draft?.traceability||[]).map(row=>{
   const c=state?.criteria.find(c=>c.criterionIndex===row.criterionIndex),status=r.result?c?.status:'planned';
   return <details className="criterion-detail" key={row.criterionIndex} open={['failed','missing'].includes(status)}>
    <summary><span className="criterion-number">{row.criterionIndex+1}</span><strong>{row.criterion}</strong><span className={`criterion-status criterion-${status||'missing'}`}>{labels[status]||'Thiếu bằng chứng'}</span></summary>
    <div className="criterion-content">
     <section><h4>Quy định tham chiếu</h4>{row.rules.map((ref,i)=><div className="criterion-reference" key={i}><a href={`https://github.com/${r.repository}/blob/${r.baseCommit}/${ref.path}#L${ref.startLine}-L${ref.endLine}`} target="_blank" rel="noreferrer">{ref.path}:{ref.startLine}–{ref.endLine} ↗</a><blockquote>{ref.quote}</blockquote></div>)}</section>
     <section><h4>Cách kiểm tra</h4>{row.verification.method==='test'?<code className="journal-command">{row.verification.command}</code>:<p>Đối chiếu source và hành vi</p>}<div className="journal-files">{row.verification.files.map(file=><code key={file}>{file}</code>)}</div><p>{row.verification.expected}</p></section>
     <section><h4>Kết quả đối chiếu</h4>{c?.evidence?<p>{c.evidence.detail}</p>:<p className="subtle">Chưa có kết quả thực thi.</p>}{r.result&&<small>{c?.reason}</small>}</section>
    </div>
   </details>;
  })}</div>
  <div className="contract-docs"><h4>Đánh giá tài liệu</h4>{impact?.review?<><p>{impact.review.updatesNeeded?'Cần cập nhật: '+impact.review.documents.join(', '):'Không cần thay đổi hợp đồng tài liệu.'}</p><p className="subtle">{impact.review.reason}</p>{impact.review.referenceDocuments?.length>0&&<details className="journal-extra"><summary>MD chỉ tham khảo · {impact.review.referenceDocuments.length}</summary>{impact.review.referenceDocuments.map(path=><p key={path}><code>{path}</code></p>)}</details>}</>:<p>Chưa có đánh giá tác động tài liệu.</p>}{state?.documentationStatus==='required'&&<p role="alert" className="error">Tài liệu cần cập nhật chưa có trong diff. Chưa được phát hành.</p>}{impact?.candidates?.length>0&&<details className="journal-extra"><summary>Tài liệu cần đối chiếu · {impact.candidates.length}</summary>{impact.candidates.map(d=><p key={d.path}><code>{d.path}</code><span className="journal-reason">{d.reasons.join(' ')}</span></p>)}<small>{impact.note}</small></details>}</div>
  {r.resultHistory?.some(h=>h.planTraceability)&&<details className="journal-extra"><summary>Các lần chuẩn bị trước</summary>{r.resultHistory.filter(h=>h.planTraceability).map((h,i)=><section className="journal-attempt" key={i}><h4>Commit {h.commit.slice(0,12)}</h4><p>{h.summary}</p>{h.criterionEvidence?.map((e,j)=><p key={j}><strong>Tiêu chí {e.criterionIndex+1} · {labels[e.outcome]||e.outcome}</strong><span className="journal-reason">{e.detail}</span></p>)}{h.documentationReview&&<p>{h.documentationReview.reason}</p>}</section>)}</details>}
  {r.verification?.phase==='passed'&&!r.criterionCi&&<p className="journal-intro">CI chung đã đạt cho commit {r.result?.commit.slice(0,12)}; chưa thay thế bằng chứng riêng của từng tiêu chí.</p>}
 </details>;
}
