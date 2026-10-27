import {browserCriterion} from './criterion-ci.js';
import crypto from 'node:crypto';
import {z} from 'zod';
const path=z.string().min(1).max(240).regex(/^[a-zA-Z0-9_./-]+$/).refine(p=>!p.includes('..')&&!p.startsWith('/')&&!/(^|\/)(\.env|\.git|node_modules)(\/|\.|$)/.test(p));
const docPath=path.refine(p=>p.startsWith('.agent-hub/')&&p.endsWith('.md'));
export const documentationReviewSchema=z.object({updatesNeeded:z.boolean(),documents:z.array(docPath).max(11),referenceDocuments:z.array(docPath).max(11).optional(),reason:z.string().trim().min(20).max(2000)});
export const ruleReferenceSchema=z.object({path:docPath,startLine:z.number().int().positive(),endLine:z.number().int().positive(),quote:z.string().min(15).max(1500),contentHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),libraryCommit:z.string().optional()});
export const traceSchema=z.array(z.object({criterionIndex:z.number().int().min(0).max(11),criterion:z.string().min(5).max(1000),rules:z.array(ruleReferenceSchema).min(1).max(3),verification:z.object({method:z.enum(['test','inspection']),command:z.string().max(200),files:z.array(path).min(1).max(5),expected:z.string().min(15).max(1000)})})).min(1).max(12);
export const criterionEvidenceSchema=z.array(z.object({criterionIndex:z.number().int().min(0).max(11),outcome:z.enum(['passed','failed','pending-ci']),method:z.enum(['test','inspection']),command:z.string().max(200),files:z.array(path).min(1).max(5),detail:z.string().min(30).max(2000)})).max(12);
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export function validateContract(draft,library,required=false){
 if(!draft.traceability){if(required)fail('Kế hoạch cần liên kết từng tiêu chí với quy định MD và cách kiểm tra.');return draft;}
 const rows=traceSchema.parse(draft.traceability),review=documentationReviewSchema.parse(draft.documentationReview),seen=new Set();
 if(new Set(rows.filter(r=>r.verification.method==='test').map(r=>r.verification.command)).size>8)fail('Tối đa tám command kiểm tra riêng trong một request.');
 if(rows.length!==draft.acceptanceCriteria.length)fail('Mỗi tiêu chí phải có đúng một liên kết MD → kiểm tra.');
 for(const row of rows){if(seen.has(row.criterionIndex)||row.criterion!==draft.acceptanceCriteria[row.criterionIndex])fail('Liên kết không khớp nội dung/thứ tự tiêu chí.');seen.add(row.criterionIndex);
  for(const ref of row.rules){const doc=library.documents.find(d=>d.path===ref.path);if(!doc)fail('Quy định MD không thuộc library đã ghim.');const lines=doc.content.split('\n');if(ref.endLine<ref.startLine||ref.endLine>lines.length||ref.endLine-ref.startLine>40||!lines.slice(ref.startLine-1,ref.endLine).join('\n').replace(/\r\n/g,'\n').includes(ref.quote.replace(/\r\n/g,'\n'))){const text=doc.content.replace(/\r\n/g,'\n'),quote=ref.quote.replace(/\r\n/g,'\n'),at=text.indexOf(quote);if(at<0||text.indexOf(quote,at+1)!==-1||quote.split('\n').length>41)fail('Trích dẫn hoặc dòng MD không khớp library đã ghim.');ref.startLine=text.slice(0,at).split('\n').length;ref.endLine=ref.startLine+quote.split('\n').length-1;}ref.contentHash=crypto.createHash('sha256').update(doc.content).digest('hex');ref.libraryCommit=library.sourceCommit;}
  const v=row.verification;if(v.method==='test'&&/playwright/i.test(v.command)&&!browserCriterion(v.command))fail('Browser test cần command được hỗ trợ và --grep tag riêng cho tiêu chí; không dùng toàn bộ suite.');if(v.method==='test'&&!v.command.trim()||v.method==='inspection'&&v.command!=='')fail('Test cần command; kiểm tra thủ công không được giả làm command đã chạy.');
  if(v.files.some(p=>!library.sourcePaths.includes(p)&&!draft.allowedPaths.includes(p)))fail('File kiểm tra chưa tồn tại và chưa được duyệt trong scope.');
 }
 if(review.documents.some(p=>!library.documents.some(d=>d.path===p)))fail('Tài liệu cần rà soát không thuộc library.');
 if(review.updatesNeeded&&(!review.documents.length||review.documents.some(p=>!draft.allowedPaths.includes(p))))fail('Tài liệu cần cập nhật phải được đưa vào allowedPaths trước khi duyệt.');
 return {...draft,traceability:rows,documentationReview:review};
}
export function assessContract(r){
 if(!r.contractProtocol)return {required:false,complete:true,criteria:[]};
 const rows=r.draft?.traceability||[],evidence=r.result?.criterionEvidence||[],indices=new Set(),duplicates=evidence.some(e=>indices.has(e.criterionIndex)||!indices.add(e.criterionIndex));
 const criteria=rows.map(row=>{const e=evidence.find(e=>e.criterionIndex===row.criterionIndex);let status=r.result?'missing':'planned',reason=r.result?'Chưa có bằng chứng cho tiêu chí.':'Chờ thực hiện kế hoạch kiểm tra.';
  if(e){status='failed';reason='Bằng chứng không khớp kế hoạch kiểm tra.';const v=row.verification;if(e.method===v.method&&e.command===v.command&&e.files.length&&e.files.length===v.files.length&&e.files.every(p=>v.files.includes(p))&&e.detail?.trim().length>=30){if(e.outcome==='pending-ci'){status='pending-ci';reason='Test hành vi đã chuẩn bị; chờ GitHub CI thực thi trên đúng commit.';}else if(e.outcome==='passed'&&(v.method==='inspection'||r.result.checks.some(c=>c.command===e.command&&c.passed))){status='reported';reason='Agent đã báo cáo; chưa phải kiểm chứng độc lập cho riêng tiêu chí.';}else reason='Agent hoặc check báo tiêu chí chưa đạt.';}}
  const proof=r.criterionCi?.commit===r.result?.commit&&r.criterionCi?.criteria.find(p=>p.criterionIndex===row.criterionIndex&&p.command===row.verification.command&&JSON.stringify(p.files)===JSON.stringify(row.verification.files));if(status==='reported'&&proof&&row.verification.method==='test'){status='verified';reason='Đã đối chiếu ca test desktop/mobile trong job GitHub CI của đúng commit.';}
  return {criterionIndex:row.criterionIndex,criterion:row.criterion,status,reason,attestation:status==='verified'?'github-actions':e?'agent-reported':null,evidence:e||null};
 });
 const review=r.result?.documentationReview,planned=r.draft?.documentationReview;
 let documentationStatus='missing';
 if(review&&review.reason?.trim().length>=20){const docs=[...new Set([...(planned?.updatesNeeded?planned.documents:[]),...(review.updatesNeeded?review.documents:[])])];documentationStatus=docs.length?docs.every(p=>r.result.changedPaths.includes(p))?'updated':'required':'reviewed';if(review.updatesNeeded&&!review.documents.length)documentationStatus='required';}
 return {required:true,complete:!duplicates&&criteria.length===r.draft?.acceptanceCriteria.length&&criteria.length>0&&evidence.length===criteria.length&&criteria.every(c=>['reported','verified'].includes(c.status))&&['updated','reviewed'].includes(documentationStatus),criteria,documentationStatus};
}
export const contractSatisfied=r=>r.workflowProtocol==='direct-v1'||assessContract(r).complete;
export function documentationImpact(r,library){
 const files=r.result?.changedPaths||r.draft?.allowedPaths||[],code=files.filter(p=>!p.startsWith('.agent-hub/'));
 const targets=new Map();const add=(path,reason)=>{if(library.documents.some(d=>d.path===path))targets.set(path,[...(targets.get(path)||[]),reason]);};
 for(const doc of library.documents)for(const file of code)if(doc.content.includes(file)||doc.content.includes(file.split('/').at(-1)))add(doc.path,'MD nhắc tới file thay đổi: '+file);
 if(code.some(p=>p.startsWith('backend/')))for(const p of ['backend/api-contracts.md','backend/workflow.md'])add('.agent-hub/'+p,'Thay đổi backend có thể ảnh hưởng hợp đồng hoặc luồng API.');
 if(code.some(p=>/^(supabase\/|backend\/supabase)/.test(p)))for(const p of ['database/data-model.md','database/storage.md'])add('.agent-hub/'+p,'Thay đổi có thể ảnh hưởng dữ liệu/storage.');
 if(code.some(p=>/^src\//.test(p)))for(const p of ['design/components.md','design/flows.md'])add('.agent-hub/'+p,'Thay đổi frontend cần đối chiếu mô tả component/luồng.');
 return {attestation:'deterministic-candidates',candidates:[...targets].map(([path,reasons])=>({path,reasons})),review:r.result?.documentationReview||r.draft?.documentationReview||null,note:'Đây là dấu hiệu cần rà soát, không tự kết luận tài liệu đã lỗi thời.'};
}

// Shared worker/server contract. References never grant edit scope.
export function documentationScopeIssues(draft,library){
 const review=draft.documentationReview;if(!review)return [];
 const issues=[];const add=(path,code,message)=>issues.push({path,code,message});
 if(review.updatesNeeded&&!review.documents.length)add('draft.documentationReview.documents','MD_UPDATE_EMPTY','Cần liệt kê chính xác MD phải sửa; tài liệu chỉ tham khảo thuộc referenceDocuments.');
 if(review.updatesNeeded)for(const [i,p] of review.documents.entries())if(!draft.allowedPaths.includes(p))add('draft.documentationReview.documents.'+i,'MD_UPDATE_OUTSIDE_SCOPE','MD cần sửa chưa nằm trong allowedPaths: '+p+'. Nếu chỉ đọc đối chiếu, chuyển sang referenceDocuments; không tự mở rộng phạm vi.');
 if(review.updatesNeeded)for(const [i,p] of (review.referenceDocuments||[]).entries())if(review.documents.includes(p))add('draft.documentationReview.referenceDocuments.'+i,'MD_ROLE_CONFLICT','Tài liệu vừa được khai báo cần sửa vừa chỉ tham khảo: '+p);
 if(library)for(const field of ['documents','referenceDocuments'])for(const [i,p] of (review[field]||[]).entries())if(!library.documents.some(d=>d.path===p))add('draft.documentationReview.'+field+'.'+i,'MD_NOT_PINNED','Tài liệu không thuộc MD library đã ghim: '+p);
 return issues;
}
