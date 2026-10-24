import {relevance,digest} from './knowledge.js';
const categories={data:/created_at|updated_at|timestamp|schema|database|dữ liệu|lưu trữ|storage/i,api:/\/api\/|endpoint|api|payload|request|response/i,components:/src\/|component|TaskCard|giao diện|hiển thị/i,workflows:/workflow|gate|checkpoint|luồng|quy trình|trạng thái/i,sensitive:/auth|permission|billing|payment|migration|secrets|phân quyền|thanh toán|xóa dữ liệu/i};
export function projectBrief(lib,query){
 const groups=Object.fromEntries(Object.entries(categories).map(([kind,match])=>{
  const facts=[];for(const d of lib.documents)for(const [i,line] of d.content.split('\n').entries())if(line.trim().length>=15&&match.test(line))facts.push({path:d.path,line:i+1,quote:line.slice(0,200),contentHash:digest(d.content),score:relevance(query,line).score});
  facts.sort((a,b)=>b.score-a.score);return [kind,facts.slice(0,2).map(({score,...f})=>f)];
 }));
 return {protocol:'md-project-map-v1',commit:lib.sourceCommit,libraryVersionId:lib.id,groups,authority:'Pinned MD statements only; code behavior and field availability still require Codex verification.'};
}
