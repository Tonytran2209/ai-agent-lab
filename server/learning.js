import {classificationInstructions} from './classifier-prompt.js';
import crypto from 'node:crypto';
import {z} from 'zod';
import {modelResponse,decisionSchema} from './agent-provider.js';
import {riskRubric} from './risk-rubric.js';
import {holdoutCases} from './agent-evals.js';
import {classificationContext} from './classification-context.js';
import {fail} from './schemas.js';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const learningSettings=z.object({enabled:z.boolean(),dailyTokens:z.number().int().min(5000).max(100000),autoActivate:z.boolean()}).strict();
export const learningInstructions={baseline:'', 'evidence-first-v1':'Distinguish requested behavior from missing implementation evidence. A display-only request may be low if it preserves data/API/workflow, but unknown storage or business behavior needs source verification. Use supplied verified examples only when relevant to the current project and compatible MD; never copy a past risk label blindly. Give Codex concrete verification tasks. Never grant execution authority.'};
const defaults={enabled:false,dailyTokens:20000,autoActivate:false,active:'baseline'};
export function createLearning(db,service,knowledge,agent,config,{model=modelResponse,clock=()=>Date.now()}={}){
 db.exec('CREATE TABLE IF NOT EXISTS learning_settings(project_id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS learning_profiles(request_id TEXT PRIMARY KEY,project_id TEXT NOT NULL,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS learning_reviews(request_id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS learning_runs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS learning_usage(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,day TEXT NOT NULL,data TEXT NOT NULL)');
 const settings=id=>({...defaults,...JSON.parse(db.prepare('SELECT data FROM learning_settings WHERE project_id=?').get(id)?.data||'{}')});
 const set=(id,value)=>db.prepare('INSERT OR REPLACE INTO learning_settings VALUES (?,?)').run(id,JSON.stringify(value));
 const reviews=id=>JSON.parse(db.prepare('SELECT data FROM learning_reviews WHERE request_id=?').get(id)?.data||'{}');
 const runs=id=>db.prepare('SELECT data FROM learning_runs WHERE project_id=? ORDER BY rowid DESC LIMIT 10').all(id).map(v=>JSON.parse(v.data));
 const day=()=>new Date(clock()).toISOString().slice(0,10);
 const usage=id=>db.prepare('SELECT data FROM learning_usage WHERE project_id=? AND day=?').all(id,day()).map(v=>JSON.parse(v.data)).reduce((n,v)=>n+(v.tokens??v.reserved),0);
 function profiles(id){service.project(id);const current=service.currentLibrary(id);return service.list().filter(r=>r.projectId===id).map(r=>{
  const review=reviews(r.id),ci=r.verification?.source==='github-actions'&&r.verification.phase==='passed';
  const stage=review.incident?'incident':r.release?.phase==='deployed'?'deployed':ci?'ci-verified':r.result?'agent-reported':'pending';
  const value={protocol:'learning-outcome-v1',requestId:r.id,projectId:id,repository:r.repository,feedback:r.feedback.slice(0,1500),baseCommit:r.baseCommit,resultCommit:r.result?.commit||null,mergeCommit:r.release?.mergeCommit||null,libraryVersionId:r.libraryVersionId,classification:r.classification||null,riskAssessment:r.riskAssessment||null,stage,incident:review.incident||false,review,changedPaths:r.result?.changedPaths||[],criteria:r.result?.criterionEvidence||[],documentationReview:r.result?.documentationReview||null,ciUrl:r.verification?.evidenceUrl||null,deploymentUrl:r.release?.deploymentUrl||null,postDeployCheck:r.release?.postDeployCheck||null,sourceRequiresRevalidation:current.sourceCommit!==r.release?.mergeCommit,createdAt:r.createdAt,updatedAt:r.updatedAt};
  db.prepare('INSERT OR REPLACE INTO learning_profiles VALUES (?,?,?)').run(r.id,id,JSON.stringify(value));return value;
 });}
 function dataset(id){const groups=new Map();for(const row of db.prepare('SELECT data FROM risk_feedback ORDER BY rowid DESC').all().map(v=>JSON.parse(v.data)).filter(v=>v.projectId===id)){
  const r=service.get(row.requestId);if(reviews(r.id).incident)continue;const key=hash(r.feedback.trim().toLowerCase());if(!groups.has(key))groups.set(key,{id:r.id,feedback:r.feedback,expected:row.reviewerRisk,provenance:'admin-reviewed',reason:row.reason,group:key,split:parseInt(key.slice(0,2),16)%5===0?'holdout':'reference'});
 }return [...groups.values()];}
 let active,timer;
 async function evaluate(id){service.project(id);const s=settings(id);if(active)fail('Đang chạy đánh giá nền.');if(!config.OPENAI_API_KEY)fail('Chưa cấu hình API cho đánh giá nền.');
 const real=dataset(id).filter(c=>c.split==='holdout').slice(0,4),cases=[...holdoutCases.map(c=>({...c,expected:c.risk,provenance:'fixed-policy-holdout'})),...real];
 const run={id:crypto.randomUUID(),projectId:id,model:agent.settings().model,libraryId:service.currentLibrary(id).id,referenceVersion:hash(service.memory.list(id).map(m=>[m.id,m.enabled])),candidate:'evidence-first-v1',datasetHash:hash(cases),phase:'running',at:new Date(clock()).toISOString(),cases:[],passed:false};
 const save=()=>db.prepare('INSERT OR REPLACE INTO learning_runs VALUES (?,?,?)').run(run.id,id,JSON.stringify(run));save();
 const task=(async()=>{try{for(const c of cases){const context=c.provenance==='admin-reviewed'?classificationContext(service,knowledge,service.get(c.id)):{protocol:'fixed-policy-holdout',documents:[],lessons:[]};const row={id:c.id,provenance:c.provenance,expected:c.expected};
  // Holdout answers must never be retrieved back as examples. Evaluate the shared production prompt.
  context.lessons=[];context.reviewerExamples=[];
  for(const variant of ['baseline','evidence-first-v1']){const input={classificationOnly:true,feedback:c.feedback,context},instructions=classificationInstructions(learningInstructions[variant==='baseline'?s.active:variant]||'');const reserved=Buffer.byteLength(JSON.stringify(input)+instructions)+2048;if(usage(id)+reserved>s.dailyTokens)throw Error('Đã chạm ngân sách cải thiện riêng; không tự gọi lại.');
   const uid=crypto.randomUUID(),entry={runId:run.id,reserved,variant,caseId:c.id,state:'reserved'};db.prepare('INSERT INTO learning_usage VALUES (?,?,?,?)').run(uid,id,day(),JSON.stringify(entry));try{const d=decisionSchema.parse(await model({kind:'decision',model:run.model,key:config.OPENAI_API_KEY,input,instructions,onUsage:u=>{if(Number.isSafeInteger(u?.total_tokens))entry.tokens=u.total_tokens;}}));row[variant]=d.risk;entry.state='completed';}finally{db.prepare('UPDATE learning_usage SET data=? WHERE id=?').run(JSON.stringify(entry),uid);}
  }run.cases.push(row);save();}
  const accuracy=key=>run.cases.filter(c=>c[key]===c.expected).length/run.cases.length;run.baselineAccuracy=accuracy('baseline');run.candidateAccuracy=accuracy(run.candidate);run.highMisses=run.cases.filter(c=>c.expected==='high'&&c[run.candidate]!=='high').length;
  run.passed=run.highMisses===0&&run.candidateAccuracy>=.9&&run.candidateAccuracy>=run.baselineAccuracy;run.phase='completed';
  // Policy examples alone cannot authorize activation. Require representative human labels.
  run.activationReady=run.passed&&real.length>=4&&dataset(id).length>=20;
  if(s.autoActivate&&run.activationReady&&settings(id).enabled&&run.libraryId===service.currentLibrary(id).id&&run.model===agent.settings().model&&run.referenceVersion===hash(service.memory.list(id).map(m=>[m.id,m.enabled]))){set(id,{...settings(id),previous:s.active,active:run.candidate,activatedBy:run.id});run.activated=true;}
 }catch{run.phase='stopped';run.note='Đánh giá chưa hoàn tất hoặc hết ngân sách; giữ nguyên phiên bản đang dùng, không tự lặp API.';}finally{run.finishedAt=new Date(clock()).toISOString();save();}})();active=task;try{await task;return run;}finally{active=null;}}
 const api={
  activeInstructions(id){return learningInstructions[settings(id).active]||'';},
  incident(id){return reviews(id).incident===true;},
  snapshot(id){const outcomes=profiles(id),deployed=outcomes.filter(p=>p.stage==='deployed'),latencies=deployed.map(p=>(Date.parse(p.updatedAt)-Date.parse(p.createdAt))/1000).filter(n=>Number.isFinite(n)&&n>=0);return {settings:settings(id),profiles:outcomes.slice(0,100),metrics:{incidents:outcomes.filter(p=>p.incident).length,deployed:deployed.length,averageCompletionSeconds:latencies.length?Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length):null,note:'Thời gian tính từ tạo feedback đến trạng thái cập nhật cuối; không phải độ chính xác phân loại.'},dataset:dataset(id),runs:runs(id),tokensToday:usage(id),fineTuning:{supported:false,model:agent.settings().model,note:'Không tự huấn luyện model. Chuẩn bị dữ liệu có nhãn; chỉ xem xét model hỗ trợ sau đánh giá độc lập.'}};},
  update(id,input){service.project(id);if(active)fail('Đánh giá đang chạy; thử lưu sau.');set(id,{...settings(id),...learningSettings.parse(input)});return this.snapshot(id);},
  review(id,input,actor){const r=service.get(id),v=z.object({incident:z.boolean(),note:z.string().trim().min(20).max(1200)}).strict().parse(input);db.prepare('INSERT OR REPLACE INTO learning_reviews VALUES (?,?)').run(id,JSON.stringify({...v,actor,at:new Date(clock()).toISOString()}));return this.snapshot(r.projectId);},
  activate(id,runId){const r=runs(id).find(r=>r.id===runId),s=settings(id);if(!r?.activationReady||r.libraryId!==service.currentLibrary(id).id||r.model!==agent.settings().model||r.referenceVersion!==hash(service.memory.list(id).map(m=>[m.id,m.enabled]))||r.datasetHash!==hash([...holdoutCases.map(c=>({...c,expected:c.risk,provenance:'fixed-policy-holdout'})),...dataset(id).filter(c=>c.split==='holdout').slice(0,4)]))fail('Đánh giá chưa đủ nhãn/đã lệch phiên bản; giữ model hiện tại.');set(id,{...s,previous:s.active,active:r.candidate,activatedBy:r.id});return this.snapshot(id);},
  rollback(id){const s=settings(id);set(id,{...s,active:s.previous||'baseline',previous:s.active,activatedBy:null});return this.snapshot(id);},evaluate,
  async tick(){if(active)return;for(const p of service.projects().filter(p=>p.enabled&&settings(p.id).enabled)){profiles(p.id);const last=runs(p.id)[0];if(last?.at?.slice(0,10)===day())continue;if(dataset(p.id).filter(c=>c.split==='holdout').length<4)continue;await evaluate(p.id);break;}},
  start(){if(!timer){timer=setInterval(()=>api.tick().catch(()=>{}),60000);timer.unref();}},async stop(){clearInterval(timer);await active;}
 };return api;
}
