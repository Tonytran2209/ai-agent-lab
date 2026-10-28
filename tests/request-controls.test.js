import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../server/db.js';
import {createService} from '../server/service.js';
import {createApp} from '../server/index.js';
import {createCiRepair} from '../server/ci-repair.js';
import {workflowMessage,requiresAttention,preparationRunning,taskProgress} from '../src/workflow.js';
const file='src/components/workspace/Step4Draft.tsx';
const draft={title:'Improve preview display',problem:'Improve the existing preview contrast without changing stored content.',layer:'design',module:'Draft',risk:'low',allowedPaths:[file],acceptanceCriteria:['Preview contrast is readable.'],questions:[],migrationNotes:''};
function fixture(serialized=true){const dir=mkdtempSync(path.join(os.tmpdir(),'lab-controls-')),db=openDatabase(dir),s=createService(db,{serializeProjects:serialized});return {db,s,patch(id,fn){const r=s.rawForAnalysis(id);fn(r);db.prepare('UPDATE requests SET data=? WHERE id=?').run(JSON.stringify(r),id);},create(text='Improve preview contrast for this feedback.'){return s.create({feedback:text},'Member');},close(){db.close();rmSync(dir,{recursive:true,force:true});}};}
const stop=(s,id)=>s.stopRequest(id,'Không cần thực hiện feedback này nữa.','Admin',s.get(id).updatedAt);
const archive=(s,id)=>s.archiveRequest(id,'Admin',s.get(id).updatedAt);

test('queued stop releases only its lane, does not spend budget, and cannot restart after trash restore',()=>{
 const f=fixture();try{
  const a=f.create(),b=f.create('A different preview feedback behind the first.');f.s.localPlanning.enqueue(a.id,'Member');f.s.localPlanning.enqueue(b.id,'Member');
  const other=f.s.create({feedback:'Keep the other project independent.',projectId:'intercom-writer-studio'},'Member');f.s.localPlanning.enqueue(other.id,'Member');const untouched=f.s.rawForAnalysis(other.id);
  assert.throws(()=>f.s.archiveRequest(a.id,'Admin',a.updatedAt));assert.throws(()=>f.s.stopRequest(a.id,'Stop this task.','Admin','stale'));
  const stopped=stop(f.s,a.id);assert.equal(stopped.status,'rejected');assert.equal(stopped.stopControl.pending,false);assert.equal(f.s.get(b.id).projectQueue.blocked,false);assert.equal(f.s.localPlanning.budget(a.projectId),0);assert.ok(!f.s.localPlanning.queue().some(j=>j.requestId===a.id));assert.deepEqual(f.s.rawForAnalysis(other.id),untouched);
  const before=f.s.get(a.id),events=f.s.events(a.id).length;const trashed=archive(f.s,a.id);assert.ok(trashed.archivedAt);assert.equal(f.s.events(a.id).length,events+1);assert.equal(trashed.feedback,before.feedback);assert.equal(trashed.baseCommit,before.baseCommit);
  const restored=f.s.restoreRequest(a.id,'Admin',trashed.updatedAt);assert.equal(restored.archivedAt,undefined);assert.equal(restored.status,'rejected');assert.throws(()=>f.s.localPlanning.enqueue(a.id,'Admin'));assert.throws(()=>f.s.rebase(a.id,'Admin'));assert.throws(()=>f.s.edit(a.id,draft,'Admin'));assert.ok(!f.s.ready().some(r=>r.id===a.id));
 }finally{f.close();}
});

test('running survey stops heartbeat and ignores late output while preserving the lock across restart until confirmed',()=>{
 const f=fixture();try{
  const a=f.create(),b=f.create('Next preview feedback must not overlap.');f.s.localPlanning.enqueue(a.id,'Member');f.s.localPlanning.enqueue(b.id,'Member');const job=f.s.localPlanning.get(a.id),c=f.s.localPlanning.claim(a.id,job.id,a.baseCommit);
  stop(f.s,a.id);assert.throws(()=>f.s.localPlanning.heartbeat(a.id,job.id,c.planningToken));assert.throws(()=>f.s.localPlanning.complete(a.id,job.id,c.planningToken,{}));f.s.localPlanning.failed(a.id,job.id,c.planningToken,'heartbeat');assert.equal(f.s.get(a.id).status,'rejected');assert.ok(f.s.get(a.id).planning.lease);assert.equal(f.s.get(b.id).projectQueue.blocked,true);
  assert.throws(()=>archive(f.s,a.id));assert.throws(()=>f.s.confirmRequestStopped(a.id,'Admin',f.s.get(a.id).updatedAt,true));
  const row=JSON.parse(f.db.prepare('SELECT data FROM local_planning WHERE request_id=?').get(a.id).data);row.lease.expiresAt=new Date(0).toISOString();f.db.prepare('UPDATE local_planning SET data=? WHERE request_id=?').run(JSON.stringify(row),a.id);
  const restarted=createService(f.db,{serializeProjects:true});assert.equal(restarted.get(b.id).projectQueue.blocked,true);assert.equal(restarted.requestControls(a.id).canConfirmStopped,true);assert.throws(()=>restarted.confirmRequestStopped(a.id,'Admin',restarted.get(a.id).updatedAt,false));
  restarted.confirmRequestStopped(a.id,'Admin',restarted.get(a.id).updatedAt,true);assert.equal(restarted.get(a.id).planning.phase,'cancelled');assert.equal(restarted.get(a.id).planning.lease,null);assert.equal(restarted.get(b.id).projectQueue.blocked,false);assert.equal(restarted.localPlanning.budget(a.projectId),1);assert.ok(archive(restarted,a.id).archivedAt);
 }finally{f.close();}
});

test('execution cancellation preserves work evidence and scope locks, rejects late completion and does not stop other projects',()=>{
 const f=fixture(false);try{
  const a=f.create();f.s.submit(a.id,draft,'Admin');const claim=f.s.claim(a.id,'mac-runner',a.baseCommit);const before=f.s.rawForAnalysis(a.id);stop(f.s,a.id);
  assert.throws(()=>f.s.progress(a.id,claim.claimToken,'Still running'));assert.throws(()=>f.s.executionFailure(a.id,claim.claimToken,'Late operational failure'));assert.throws(()=>f.s.complete(a.id,claim.claimToken,{}));assert.deepEqual(f.s.get(a.id).draft,before.draft);assert.equal(f.s.get(a.id).baseCommit,before.baseCommit);
  const b=f.create('A competing request touching the same file.');f.s.submit(b.id,draft,'Admin');assert.throws(()=>f.s.claim(b.id,'another-worker',b.baseCommit),/Phạm vi/);
  f.patch(a.id,r=>{r.lease.expiresAt=new Date(0).toISOString();});f.s.confirmRequestStopped(a.id,'Admin',f.s.get(a.id).updatedAt,true);assert.ok(f.s.claim(b.id,'another-worker',b.baseCommit));assert.throws(()=>f.s.retryExecution(a.id,'Admin'));
  const raw=JSON.stringify(f.s.rawForAnalysis(a.id));assert.ok(!JSON.stringify(f.s.get(a.id)).includes('tokenHash'));assert.ok(raw.includes('stopControl'));
 }finally{f.close();}
});

test('recheck and repair claims remain locked and their heartbeats fail after a stop',()=>{
 const f=fixture();try{for(const key of ['recheck','ciRepair']){
  const r=f.create('Stop this '+key+' while its worker runs.');f.patch(r.id,v=>{v.status=key==='recheck'?'rechecking':'failed';v.draft=draft;v[key]={phase:'running',lease:{expiresAt:new Date(Date.now()+60000).toISOString(),tokenHash:'x',hash:'x'}};});stop(f.s,r.id);
  assert.throws(()=>key==='recheck'?f.s.rechecks.heartbeat(r.id,'x'):createCiRepair(f.db,f.s).heartbeat(r.id,'x'));assert.ok(f.s.get(r.id)[key].lease);assert.equal(f.s.requestControls(r.id).canConfirmStopped,false);
  f.patch(r.id,v=>{v[key].lease.expiresAt=new Date(0).toISOString();});f.s.confirmRequestStopped(r.id,'Admin',f.s.get(r.id).updatedAt,true);assert.equal(f.s.get(r.id)[key].lease,null);
 }}finally{f.close();}
});

test('publishing boundaries cannot be revoked in flight or rolled back, while completed trash keeps MD sync working',()=>{
 const f=fixture();try{
  const a=f.create();for(const key of ['release','verification']){f.patch(a.id,r=>{delete r.release;delete r.verification;r[key]={phase:'ci',lease:{expiresAt:new Date(0).toISOString()}};});assert.throws(()=>stop(f.s,a.id),/Worker đang/);assert.equal(f.s.requestControls(a.id).canStop,false);}
  f.patch(a.id,r=>{delete r.verification;r.status='completed';r.release={phase:'failed',mergeCommit:'b'.repeat(40)};});assert.throws(()=>stop(f.s,a.id),/merge/);
  f.patch(a.id,r=>{r.release={phase:'deployed',mergeCommit:'b'.repeat(40),librarySync:'failed'};r.result={commit:'b'.repeat(40),summary:'Preserved release evidence',checks:[],changedPaths:[]};});const before=f.s.get(a.id);archive(f.s,a.id);f.s.releaseLibrarySync(a.id,true);const after=f.s.get(a.id);assert.equal(after.release.librarySync,'synced');assert.ok(after.archivedAt);assert.deepEqual(after.result,before.result);assert.equal(after.release.mergeCommit,before.release.mergeCommit);assert.throws(()=>f.s.publish(a.id,'Admin'));assert.equal(f.s.recoverPublication(a.id),false);
  const b=f.create('Cancel a release that has not been claimed.');f.patch(b.id,r=>{r.status='completed';r.release={phase:'queued',lease:null};});stop(f.s,b.id);assert.equal(f.s.get(b.id).release.phase,'failed');assert.ok(!f.s.releases().some(r=>r.id===b.id));
 }finally{f.close();}
});

test('server planning callbacks cannot revive a stopped or archived feedback',()=>{
 const f=fixture();try{const a=f.create();f.s.enqueuePreparation(a.id,'Member');const job=f.s.takePreparation();assert.ok(job);stop(f.s,a.id);archive(f.s,a.id);f.s.finishPreparation(a.id,job.jobId,false,{retryable:true});assert.equal(f.s.get(a.id).status,'rejected');assert.equal(f.s.get(a.id).preparation.status,'cancelled');assert.equal(f.s.takePreparation(),null);}finally{f.close();}
});

test('new request controls are session/CSRF/admin protected, revision bound and trash is opt-in',async()=>{
 const f=fixture(),config={NODE_ENV:'test',MD_TRACEABILITY_ENABLED:'false',ADMIN_PASSWORD:'admin-test-12345678901234567890',USER_PASSWORD:'member-test-12345678901234567890',SESSION_SECRET:'session-test-12345678901234567890',MCP_TOKEN:'mcp-test-12345678901234567890'};
 const {app,service:s}=createApp(config,{db:f.db}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const login=async password=>{const res=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Admin',password})}),b=await res.json();return {Cookie:res.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json','X-CSRF-Token':b.user.csrf};};
  const admin=await login(config.ADMIN_PASSWORD),member=await login(config.USER_PASSWORD),r=s.create({feedback:'Manage lifecycle without disrupting other feedback.'},'Member');
  const send=(suffix,method,headers,body)=>fetch(base+'/api/requests/'+r.id+suffix,{method,headers,body:JSON.stringify(body)});
  assert.equal((await send('/stop','POST',{},{})).status,401);assert.equal((await send('/stop','POST',member,{})).status,403);assert.equal((await send('/stop','POST',{...admin,'X-CSRF-Token':''},{})).status,403);
  assert.equal((await send('/stop','POST',admin,{note:'Stop this feedback.',expectedRevision:'stale'})).status,409);
  assert.equal((await send('/stop','POST',admin,{note:'Stop this feedback.',expectedRevision:s.get(r.id).updatedAt})).status,200);
  const detail=await(await fetch(base+'/api/requests/'+r.id,{headers:admin})).json();assert.equal(detail.request.controls.canArchive,true);
  assert.equal((await send('','DELETE',member,{expectedRevision:s.get(r.id).updatedAt})).status,403);assert.equal((await send('','DELETE',admin,{expectedRevision:s.get(r.id).updatedAt})).status,200);
  assert.ok(!(await(await fetch(base+'/api/requests',{headers:admin})).json()).requests.some(v=>v.id===r.id));assert.ok((await(await fetch(base+'/api/requests?includeArchived=true',{headers:admin})).json()).requests.some(v=>v.id===r.id));assert.ok(!(await(await fetch(base+'/api/requests?includeArchived=true',{headers:member})).json()).requests.some(v=>v.id===r.id));
  assert.equal((await send('/restore','POST',member,{expectedRevision:s.get(r.id).updatedAt})).status,403);assert.equal((await send('/restore','POST',admin,{expectedRevision:s.get(r.id).updatedAt})).status,200);assert.equal(s.get(r.id).status,'rejected');assert.equal(s.ready().length,0);
 }finally{await new Promise(r=>server.close(r));f.close();}
});

test('stop and trash messages never suggest a model retry or work still running',()=>{
 const pending={status:'rejected',stopControl:{pending:true},preparation:{status:'cancelled'},planning:{lease:{expiresAt:new Date(Date.now()+60000).toISOString()}}};assert.equal(preparationRunning(pending),false);assert.match(taskProgress({...pending,ciRepair:{phase:'running'}},{}).title,/Chờ xác nhận worker dừng/);assert.equal(requiresAttention(pending),true);assert.match(workflowMessage(pending),/giữ khoá/);assert.equal(requiresAttention({...pending,stopControl:{pending:false}}),false);assert.match(workflowMessage({...pending,archivedAt:new Date().toISOString()}),/không chạy lại/);
});
