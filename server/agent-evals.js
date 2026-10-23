import {intentRisk} from './local-planning.js';
import {semanticTerms,knowledgeVersion} from './knowledge.js';
export const evaluationVersion='agent-evals-v1';
export const evaluationCases=[
 ['Thay đổi màu chữ hiển thị Draft','low','layout'],['Điều chỉnh spacing giao diện preview','low','layout'],
 ['Sửa luồng đăng nhập để bỏ xác thực','high','authentication'],['Cập nhật quyền truy cập thành viên','high','authorization'],
 ['Change billing payment authorization rules','high','billing'],['Xóa dữ liệu toàn bộ database','high','data'],
 ['Add database migration for storage','high','data'],['Sửa API export bài viết','medium',''],
 ['Lưu dữ liệu Outline sau reload','medium','outline'],['Khôi phục selected Core Idea khi chuyển bài','medium',''],
 ['Fix semantic QC review cache workflow','medium','quality'],['Bổ sung Gate checkpoint trong workflow','medium','workflow']
].map(([feedback,risk,concept],i)=>({id:'case-'+i,feedback,risk,concept}));

export const holdoutCases=[
 ['Chỉ đổi biểu tượng và khoảng cách của nút xác nhận.','low'],
 ['Chỉ sửa lỗi chính tả ở tiêu đề bảng, giữ nguyên dữ liệu.','low'],
 ['Đồng bộ trạng thái tab với bài đang mở khi chuyển bài.','medium'],
 ['Bổ sung cache cho phản hồi API danh sách.','medium'],
 ['Đổi quyền đọc các bài riêng tư theo vai trò thành viên.','high'],
 ['Thay đổi cách tính phí khi nâng cấp gói thuê bao.','high'],
 ['Backfill dữ liệu bằng migration schema mới.','high'],
 ['Di chuyển cấu hình production và secret sang môi trường khác.','high']
].map(([feedback,risk],i)=>({id:'holdout-'+i,feedback,risk}));
export function policyEvaluation(){const cases=evaluationCases.map(c=>({...c,actual:intentRisk(c.feedback),concepts:semanticTerms(c.feedback)}));return {version:evaluationVersion,knowledgeVersion,cases,accuracy:cases.filter(c=>c.actual===c.risk).length/cases.length,highMisses:cases.filter(c=>c.risk==='high'&&c.actual!=='high').length,note:'Bộ regression chính sách, không đại diện độ chính xác model trên dữ liệu thực.'};}
export function operationalMetrics(db,service,projectId){const rs=service.list().filter(r=>r.projectId===projectId),classified=rs.filter(r=>r.draft),reviewed=db.prepare('SELECT data FROM risk_feedback').all().map(v=>JSON.parse(v.data)).filter(v=>v.projectId===projectId);return {requests:rs.length,classified:classified.length,reviewed:reviewed.length,disagreements:reviewed.filter(v=>v.systemRisk!==v.reviewerRisk).length,disagreementRate:reviewed.length?reviewed.filter(v=>v.systemRisk!==v.reviewerRisk).length/reviewed.length:null,failed:rs.filter(r=>r.status==='failed'||r.release?.phase==='failed').length,resurveyed:rs.filter(r=>(r.planning?.attempts||0)>1).length,deployed:rs.filter(r=>r.release?.phase==='deployed').length,afterDeployFailures:rs.filter(r=>r.release?.phase==='failed'&&r.release?.mergeCommit).length,byRisk:Object.fromEntries(['low','medium','high'].map(k=>[k,classified.filter(r=>r.draft.risk===k).length])),note:'Số lượng bài học và deploy không chứng minh model thông minh hơn; cần nhãn admin và bộ đánh giá độc lập.'};}
