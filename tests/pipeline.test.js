import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {openDatabase} from '../server/db.js';
import {createService,hash} from '../server/service.js';
import {createPipeline} from '../server/pipeline.js';
import {createApp} from '../server/index.js';

const draft={title:'Đổi dấu gạch ngang trong hiển thị Draft',problem:'Chỉ đổi dấu gạch ngang khi hiển thị Draft và giữ dữ liệu đã lưu.',layer:'design',module:'draft',allowedPaths:['src/components/workspace/Step4Draft.tsx'],acceptanceCriteria:['Hiển thị dấu - thay cho — trong bài Draft.','Nội dung lưu trong database không đổi.'],questions:[],assumptions:['Chỉ thay phần hiển thị, giữ nguyên API và dữ liệu gốc.'],risk:'low',migrationNotes:''};
function fixture(){const dir=mkdtempSync(path.join(os.tmpdir(),'lab-pipeline-'));const db=openDatabase(dir);const service=createService(db);return{db,service,close(){db.close();rmSync(dir,{recursive:true,force:true});}};}
const analyzer=(plan=draft)=>async(service,id,actor)=>{const r=service.rawForAnalysis(id);return service.saveAnalysis(id,plan,{model:'mock',learningSources:service.learningExamples(r).map(x=>({requestId:x.requestId,outcome:x.outcome}))},actor,hash(JSON.stringify(r)));};

test('minimal member feedback is prepared durably and low risk auto-runs without reproduction/approval',async()=>{
 const f=fixture();const r=f.service.create({feedback:'Thay — bằng - trong hiển thị bài viết Draft',screen:'Draft'},'Member');
 const worker=createPipeline(f.service,{}, {analyze:analyzer()});
 try{worker.enqueue(r.id,'Member');assert.equal(f.service.get(r.id).preparation.status,'queued');worker.start();await worker.tick();const done=f.service.get(r.id);assert.equal(done.status,'approved');assert.equal(done.preparation.status,'completed');assert.equal(done.approval.mode,'auto-low-risk');assert.equal(done.review.required,'none');assert.equal(done.draft.questions.length,0);assert.ok(f.service.claim(done.id,'Mac',done.baseCommit).claimToken);}finally{await worker.stop();f.close();}
});
test('server promotes broad/sensitive scope; medium check and explicit high approval are enforced',async()=>{
 const f=fixture();
 try{
  const process=async plan=>{const r=f.service.create({feedback:'Thay đổi cách hiển thị bài viết Draft'},'Member');const w=createPipeline(f.service,{}, {analyze:analyzer(plan)});w.enqueue(r.id,'Member');w.start();await w.tick();await w.stop();return f.service.get(r.id);};
  const medium=await process({...draft,allowedPaths:['src/components/NewDraftView.tsx']});
  assert.equal(medium.draft.risk,'medium');assert.equal(medium.status,'awaiting-approval');assert.equal(medium.review.required,'check');assert.throws(()=>f.service.claim(medium.id,'Mac',medium.baseCommit));
  assert.equal(f.service.approve(medium.id,'Admin',{expectedRevision:medium.updatedAt}).status,'approved');
  const high=await process({...draft,layer:'backend',allowedPaths:['backend/auth.ts']});
  assert.equal(high.draft.risk,'high');assert.equal(high.status,'awaiting-approval');assert.throws(()=>f.service.approve(high.id,'Admin'),/rủi ro cao/);assert.throws(()=>f.service.submit(high.id,high.draft,'Admin'),/rủi ro cao/);
  assert.equal(f.service.approve(high.id,'Admin',{confirmHighRisk:true,expectedRevision:high.updatedAt}).status,'approved');
  const highRetry=await process({...draft,layer:'backend',allowedPaths:['backend/auth.ts']});
  f.service.clarify(highRetry.id,'Chỉ thay hiển thị Draft, không thay quyền.', 'Member');
  const retryWorker=createPipeline(f.service,{}, {analyze:analyzer(draft)});retryWorker.enqueue(highRetry.id,'Member');retryWorker.start();await retryWorker.tick();await retryWorker.stop();assert.equal(f.service.get(highRetry.id).draft.risk,'high');assert.equal(f.service.get(highRetry.id).approval,null);
  const questions=await process({...draft,questions:['Có thay dữ liệu đã lưu hay chỉ hiển thị?']});assert.equal(questions.draft.risk,'medium');assert.equal(questions.draft.questions.length,0);assert.ok(questions.draft.assumptions.some(x=>x.includes('Cần kiểm tra:')));
 }finally{f.close();}
});
test('queued jobs survive restart, retry boundedly, and stale analysis cannot overwrite manual edits',async()=>{
 const f=fixture();const worker=createPipeline(f.service,{}, {analyze:async()=>{throw new Error('provider unavailable');}});
 try{
  const r=f.service.create({feedback:'Thay đổi hiển thị dấu gạch ngang trong Draft'},'Member');worker.enqueue(r.id,'Member');const job=f.service.takePreparation();assert.ok(job);
  const reloaded=createService(f.db);reloaded.recoverPreparations();assert.equal(reloaded.get(r.id).preparation.status,'queued');assert.notEqual(reloaded.get(r.id).preparation.jobId,job.jobId);assert.equal(reloaded.finishPreparation(r.id,job.jobId,true).preparation.status,'queued');
  const newJob=reloaded.takePreparation();const snapshot=reloaded.rawForAnalysis(r.id);reloaded.edit(r.id,draft,'Admin');assert.throws(()=>reloaded.saveAnalysis(r.id,draft,{},'AI',hash(JSON.stringify(snapshot))),/đã thay đổi/);reloaded.finishPreparation(r.id,newJob.jobId,false);assert.equal(reloaded.get(r.id).preparation.status,'cancelled');
  worker.enqueue(r.id,'Admin');for(let i=0;i<3;i++){const j=f.service.takePreparation();assert.ok(j);f.service.finishPreparation(r.id,j.jobId,false);if(i<2){const stored=f.service.rawForAnalysis(r.id);stored.preparation.retryAt='2000-01-01T00:00:00Z';f.db.prepare('UPDATE requests SET data=? WHERE id=?').run(JSON.stringify(stored),r.id);}}assert.equal(f.service.get(r.id).preparation.status,'failed');assert.equal(f.service.takePreparation(),null);assert.equal(f.service.get(r.id).feedback,'Thay đổi hiển thị dấu gạch ngang trong Draft');
 }finally{await worker.stop();f.close();}
});
test('learning retrieves human-accepted/rejected examples but never pending or failed work',()=>{
 const f=fixture();try{
  const create=()=>{const r=f.service.create({feedback:'Đổi dấu gạch ngang hiển thị Draft',screen:'Draft'},'Member');f.service.edit(r.id,draft,'Admin');return f.service.get(r.id);};
  const accepted=create();f.service.approve(accepted.id,'Admin');const c=f.service.claim(accepted.id,'Mac',accepted.baseCommit);f.service.complete(accepted.id,c.claimToken,{summary:'Đã sửa hiển thị và giữ nguyên dữ liệu đã lưu.',changedPaths:draft.allowedPaths,commit:'a'.repeat(40),localArtifact:{branch:'lab/accepted'},checks:[{command:'npm run check',passed:true,output:'passed'}]});f.service.accept(accepted.id,'Admin');
  const rejected=create();f.service.reject(rejected.id,'Yêu cầu trước đã thay cả dữ liệu, chỉ nên thay hiển thị.','Admin');const pending=create();
  const examples=f.service.learningExamples({feedback:'Thay dấu gạch ngang trong Draft',screen:'Draft'});
  assert.ok(examples.some(x=>x.requestId===accepted.id&&x.outcome==='accepted'));assert.ok(examples.some(x=>x.requestId===rejected.id&&x.reviewerNote.includes('chỉ nên thay hiển thị')));assert.ok(!examples.some(x=>x.requestId===pending.id));
 }finally{f.close();}
});
test('member POST feedback triggers risk routing without prepare permission or browser follow-up',async()=>{
 const f=fixture();const config={MD_TRACEABILITY_ENABLED:"false",ADMIN_PASSWORD:'admin-password-123456789012345',USER_PASSWORD:'member-password-123456789012345',SESSION_SECRET:'session-secret-123456789012345',MCP_TOKEN:'mcp-secret-12345678901234567890',NODE_ENV:'test'};
 const {app,pipeline}=createApp(config,{db:f.db,analyze:analyzer()});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{pipeline.start();const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Member',password:config.USER_PASSWORD})});const {user}=await login.json();const headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':user.csrf};const res=await fetch(base+'/api/requests',{method:'POST',headers,body:JSON.stringify({feedback:'Thay dấu — bằng - khi hiển thị Draft',risk:'low',approval:{actor:'fake'}})});assert.equal(res.status,201);const r=await res.json();await pipeline.tick();const result=await(await fetch(base+'/api/requests/'+r.id,{headers})).json();assert.equal(result.request.status,'approved');assert.equal(result.request.approval.actor,'Impact policy v1');assert.equal(result.request.approval.mode,'auto-low-risk');assert.equal((await fetch(base+'/api/requests/'+r.id+'/approve',{method:'POST',headers,body:JSON.stringify({confirmHighRisk:true})})).status,403);}finally{await pipeline.stop();await new Promise(resolve=>server.close(resolve));f.close();}
});
