import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openDatabase} from '../server/db.js';import {createService} from '../server/service.js';import {publishStep,latestChecks} from '../mac/release.js';
const draft={title:'Giới hạn mở đầu Draft',problem:'Đoạn mở đầu hiển thị quá dài.',layer:'design',module:'draft',allowedPaths:['src/components/workspace/Step4Draft.tsx'],acceptanceCriteria:['Mở đầu hiển thị tối đa sáu dòng.'],risk:'low',questions:[]};
const result={summary:'Đã sửa preview, giữ nguyên dữ liệu gốc.',changedPaths:draft.allowedPaths,commit:'a'.repeat(40),localArtifact:{branch:'lab/REQ-ABCDEF12-123'},checks:[{command:'npm run check',passed:true,output:'passed'},{command:'Google Chrome --headless',passed:false,output:'exit 134'}]};
function fixture(){const dir=mkdtempSync(path.join(os.tmpdir(),'lab-browser-')),db=openDatabase(dir),s=createService(db);return {s,close(){db.close();rmSync(dir,{recursive:true,force:true});},complete(input=result){const r=s.create({feedback:'Giới hạn mở đầu Draft tối đa sáu dòng.'},'User');s.submit(r.id,draft,'Admin');const c=s.claim(r.id,'Mac',r.baseCommit);s.complete(r.id,c.claimToken,input);return s.get(r.id);}};}
test('manual supplemental verification binds the exact result and preserves the failed Chrome record without granting release',()=>{
 const f=fixture();try{const r=f.complete();assert.equal(r.status,'failed');
  assert.throws(()=>f.s.supplementVerification(r.id,{expectedCommit:'b'.repeat(40),expectedResultRevision:r.resultRevision,note:'Verified the actual browser fixture and editing.'},'Admin'));
  const verified=f.s.supplementVerification(r.id,{expectedCommit:r.result.commit,expectedResultRevision:r.resultRevision,note:'Actual browser fixture: six lines, full body and editing, source intact; screenshot captured.'},'Admin');
  assert.equal(verified.status,'review');assert.equal(verified.result.checks[1].passed,false);assert.equal(verified.release,undefined);assert.equal(verified.verification.source,'admin-attested');
  assert.equal(f.s.accept(r.id,'Admin').release.phase,'queued');
 }finally{f.close();}
});
test('failed non-browser checks cannot be replaced by manual or CI browser evidence',()=>{
 const f=fixture();try{const r=f.complete({...result,checks:[...result.checks,{command:'backend typecheck',passed:false,output:'failed'}]});assert.throws(()=>f.s.queueVerification(r.id,'Admin'));assert.throws(()=>f.s.supplementVerification(r.id,{expectedCommit:r.result.commit,expectedResultRevision:r.resultRevision,note:'Actual browser checks passed, but backend remains broken.'},'Admin'));}finally{f.close();}
});
test('CI verification queue blocks acceptance, sanitizes leases, and only reaches review with a pinned evidence URL',()=>{
 const f=fixture();try{const r=f.complete({...result,browserVerification:'ci',checks:result.checks.slice(0,1)});assert.equal(r.status,'verifying');assert.throws(()=>f.s.accept(r.id,'Admin'));assert.equal(f.s.verifications().length,1);
 const c=f.s.claimVerification(r.id,'worker');assert.throws(()=>f.s.claimVerification(r.id,'other'));assert.ok(!JSON.stringify(f.s.get(r.id)).includes('tokenHash'));
 assert.throws(()=>f.s.reportVerification(r.id,c.verificationToken,{phase:'passed',note:'Premature success',evidenceUrl:'https://github.com/Tonytran2209/RebuildWriterStudioTool/actions/runs/1'}));
 f.s.reportVerification(r.id,c.verificationToken,{phase:'ci',prNumber:3,prUrl:'https://github.com/Tonytran2209/RebuildWriterStudioTool/pull/3',note:'Draft PR đã tạo.'});assert.throws(()=>f.s.reportVerification(r.id,c.verificationToken,{phase:'failed',note:'Stale claim'}));
 const next=f.s.claimVerification(r.id,'worker');assert.throws(()=>f.s.reportVerification(r.id,next.verificationToken,{phase:'passed',note:'Wrong evidence',evidenceUrl:'https://example.com/pass'}));
 const passed=f.s.reportVerification(r.id,next.verificationToken,{phase:'passed',note:'writer-check và browser-check đã đạt.',evidenceUrl:'https://github.com/Tonytran2209/RebuildWriterStudioTool/actions/runs/1/job/2'});assert.equal(passed.status,'review');assert.equal(passed.release,undefined);assert.equal(f.s.accept(r.id,'Admin').release.phase,'ci');
 }finally{f.close();}
});
test('verification worker observes CI but never marks a draft ready or calls merge',async()=>{
 const repo='Tonytran2209/RebuildWriterStudioTool',calls=[];const r={id:'REQ-ABCDEF12',repository:repo,status:'verifying',result:{...result,checks:result.checks.slice(0,1)},draft,release:{phase:'ci',prNumber:3,authorizedAt:new Date().toISOString()}};
 const api=async(e,m)=>{calls.push([e,m]);if(e.includes('/files?'))return [{filename:draft.allowedPaths[0]}];if(e.includes('/check-runs?'))return {total_count:3,check_runs:[{id:1,name:'browser-check',app:{slug:'github-actions'},status:'completed',conclusion:'failure'},...['writer-check','browser-check'].map((name,index)=>({id:10+index,name,app:{slug:'github-actions'},status:'completed',conclusion:'success',details_url:`https://github.com/${repo}/actions/runs/1/job/2`}))]};if(e.endsWith('/status'))return {statuses:[]};return {head:{sha:r.result.commit},base:{ref:'main',repo:{full_name:repo}},changed_files:1,state:'open',draft:true,mergeable:true};};
 const verified=await publishStep({request:r,purpose:'verification',config:{repoPath:'/tmp/fake'},run:async()=>({code:0,stdout:`https://github.com/${repo}.git`}),api});assert.equal(verified.phase,'passed');assert.ok(!calls.some(([e,m])=>m==='PUT'||e==='graphql'));
});

test('old failed check suites do not override a newer pending or successful run of the same check',()=>{
 const app={slug:'github-actions'},old={id:1,name:'browser-check',app,status:'completed',conclusion:'failure'},pending={id:3,name:'browser-check',app,status:'in_progress',conclusion:null};
 assert.deepEqual(latestChecks([old,pending]),[pending]);assert.deepEqual(latestChecks([pending,old]),[pending]);
 const passed={...pending,status:'completed',conclusion:'success'};assert.deepEqual(latestChecks([old,passed]),[passed]);
 const other={...old,id:2,name:'writer-check'};assert.equal(latestChecks([old,passed,other]).length,2);
});
