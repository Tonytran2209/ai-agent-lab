import crypto from 'node:crypto';
import {z} from 'zod';
import {fail} from './schemas.js';
export const knowledgeVersion='hybrid-concepts-v1';
export const digest=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
export const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('đ','d');
const stop=new Set('the and for with this that from feedback request project toi cua cac mot nhung nay khi thi voi cho can hay giup duoc dang phan bai'.split(' '));
export const terms=s=>new Set(normalize(s).split(/[^a-z0-9]+/).filter(v=>v.length>2&&!stop.has(v)));
// Explicit bilingual concepts are inspectable, not embeddings or learned authority.
const concepts={authentication:['dang nhap','xac thuc','authentication','login','password','mat khau'],authorization:['phan quyen','quyen truy cap','authorization','permission','rls'],data:['du lieu','database','storage','luu tru','persist','supabase'],layout:['giao dien','hien thi','layout','display','preview','spacing'],workflow:['luong','quy trinh','workflow','gate','checkpoint'],outline:['dan bai','outline','title','tieu de'],quality:['chat luong','quality','semantic','qc'],billing:['thanh toan','billing','payment']};
export const semanticTerms=s=>Object.entries(concepts).filter(([,vs])=>vs.some(v=>normalize(s).includes(v))).map(([k])=>k);
export function relevance(query,text){const q=terms(query),t=terms(text),matched=[...q].filter(v=>t.has(v)),semantic=semanticTerms(query).filter(v=>semanticTerms(text).includes(v));return {score:matched.reduce((n,v)=>n+(v.length>5?2:1),0)+semantic.length*3,matched,concepts:semantic};}
export function createKnowledge(db,service){
 db.exec(`CREATE TABLE IF NOT EXISTS knowledge_nodes(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,library_id TEXT NOT NULL,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS knowledge_project ON knowledge_nodes(project_id,library_id);
 CREATE TABLE IF NOT EXISTS lesson_reviews(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS knowledge_state(project_id TEXT PRIMARY KEY,data TEXT NOT NULL);`);
 const state=id=>JSON.parse(db.prepare('SELECT data FROM knowledge_state WHERE project_id=?').get(id)?.data||'{}');
 function index(projectId){const lib=service.currentLibrary(projectId);if(state(projectId).libraryId===lib.id)return lib;
  const known=new Set(lib.sourcePaths),nodes=[];for(const doc of lib.documents){const lines=doc.content.split('\n');for(let i=0;i<lines.length;i+=24){const content=lines.slice(i,i+24).join('\n');if(!content.trim())continue;nodes.push({id:digest([lib.id,doc.path,i]),projectId,libraryId:lib.id,commit:lib.sourceCommit,kind:'md',path:doc.path,startLine:i+1,endLine:Math.min(i+24,lines.length),content,contentHash:digest(doc.content),references:[...new Set(content.match(/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+/g)||[])].filter(p=>known.has(p)).slice(0,30)});}}
  const insert=db.prepare('INSERT OR IGNORE INTO knowledge_nodes VALUES(?,?,?,?)');for(const n of nodes)insert.run(n.id,projectId,lib.id,JSON.stringify(n));db.prepare('INSERT OR REPLACE INTO knowledge_state VALUES(?,?)').run(projectId,JSON.stringify({...state(projectId),libraryId:lib.id,indexedAt:new Date().toISOString(),nodes:nodes.length}));return lib;
 }
 const incidents=id=>service.list().filter(r=>r.projectId===id&&(r.status==='failed'||r.preparation?.status==='failed'||r.release?.phase==='failed')).map(r=>({requestId:r.id,commit:r.baseCommit,kind:'unverified-incident',problem:r.feedback.slice(0,800),note:(r.preparation?.error||r.release?.note||r.executionFailure?.note||'Kiểm tra chưa đạt').slice(0,800),requiresSourceRevalidation:true}));
 const reviews=id=>db.prepare('SELECT data FROM lesson_reviews WHERE project_id=?').all(id).map(v=>JSON.parse(v.data));
 function lessons(projectId){return service.memory.list(projectId).map(m=>({...m,review:reviews(projectId).find(r=>r.id===m.id)||null}));}
 function search(projectId,query,{libraryId,limit=6}={}){const current=index(projectId),lib=libraryId?service.library(libraryId):current;if(lib.projectId!==projectId)fail('Library khác project.',400);
  let nodes=db.prepare('SELECT data FROM knowledge_nodes WHERE project_id=? AND library_id=?').all(projectId,lib.id).map(v=>JSON.parse(v.data));
  // Pinned historical requests remain searchable without changing the current index.
  if(!nodes.length)nodes=lib.documents.flatMap(d=>d.content.split('\n').reduce((a,_,i,ls)=>{if(i%24===0)a.push({id:digest([lib.id,d.path,i]),kind:'md',path:d.path,startLine:i+1,endLine:Math.min(i+24,ls.length),content:ls.slice(i,i+24).join('\n'),contentHash:digest(d.content),commit:lib.sourceCommit,libraryId:lib.id,projectId});return a;},[]));
  const matches=nodes.map(n=>({...n,retrieval:relevance(query,n.path+' '+n.content)})).filter(n=>n.retrieval.score>0).sort((a,b)=>b.retrieval.score-a.retrieval.score).slice(0,Math.min(12,Math.max(1,limit)));
  const memory=service.project(projectId).memoryEnabled===false?[]:lessons(projectId).filter(m=>m.enabled&&m.review?.state!=='invalid'&&m.repository===lib.repository&&!(m.policyReferences||[]).flatMap(t=>t.rules).some(ref=>!lib.documents.some(d=>d.path===ref.path&&digest(d.content)===ref.contentHash))).map(m=>({...m,retrieval:relevance(query,m.problem+' '+m.module+' '+m.allowedPaths.join(' '))})).filter(m=>m.retrieval.score>=4).sort((a,b)=>b.retrieval.score-a.retrieval.score).slice(0,3);
  return {version:knowledgeVersion,projectId,libraryId:lib.id,commit:lib.sourceCommit,matches,incidents:incidents(projectId).filter(m=>relevance(query,m.problem).score>=4).slice(0,3),memory:memory.map(m=>({...m,requiresSourceRevalidation:true})),candidatePaths:lib.sourcePaths.filter(p=>/^(src\/|backend\/|tests\/)/.test(p)&&!/(secret|credential|\.env|lock\.json)/i.test(p)).map(path=>({path,...relevance(query,path.replace(/([a-z])([A-Z])/g,'$1 $2'))})).filter(v=>v.score>0).sort((a,b)=>b.score-a.score).slice(0,12)};
 }
 let retriever;
 return {index,search,state,lessons,configureRetriever(fn){retriever=fn;},async retrieve(projectId,query,options={}){const base=search(projectId,query,options);return retriever?retriever(projectId,query,base,options):base;},
  review(projectId,id,input,actor){const b=z.object({state:z.enum(['valid','invalid','superseded']),reason:z.string().trim().min(20).max(1200),replacementId:z.string().max(64).optional()}).strict().parse(input);const all=lessons(projectId);if(!all.some(m=>m.id===id))fail('Không tìm thấy bài học.',404);if(b.state==='superseded'&&(!b.replacementId||b.replacementId===id||!all.some(m=>m.id===b.replacementId)))fail('Cần bài học thay thế cùng project.',400);const v={id,projectId,...b,actor,at:new Date().toISOString()};db.prepare('INSERT OR REPLACE INTO lesson_reviews VALUES(?,?,?)').run(id,projectId,JSON.stringify(v));service.memory.setEnabled(projectId,id,b.state==='valid');return v;},
  snapshot(projectId){const lib=index(projectId),memory=lessons(projectId);return {projectId,repository:lib.repository,libraryId:lib.id,commit:lib.sourceCommit,...state(projectId),retrieval:knowledgeVersion,lessons:memory,incidents:incidents(projectId),graph:db.prepare('SELECT data FROM knowledge_nodes WHERE project_id=? AND library_id=?').all(projectId,lib.id).map(v=>JSON.parse(v.data)).filter(n=>n.references.length).map(n=>({document:n.path,startLine:n.startLine,files:n.references})),note:'Tìm kiếm kết hợp từ khóa và nhóm nghĩa Việt/Anh; không phải embedding hoặc tự huấn luyện model.'};}
 };
}
