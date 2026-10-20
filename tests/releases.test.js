import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { createService } from '../server/service.js';
import { publishStep } from '../mac/release.js';
const repo='Tonytran2209/RebuildWriterStudioTool', commit='a'.repeat(40), base='b'.repeat(40), merged='c'.repeat(40);
const draft={title:'Chuẩn hóa dấu Draft',problem:'Chỉ đổi dấu trên giao diện Draft.',layer:'design',module:'draft',allowedPaths:['src/components/workspace/Step4Draft.tsx'],acceptanceCriteria:['Dấu ngắn hiển thị đúng.'],risk:'low',questions:[]};
const report={summary:'Đã sửa và kiểm tra toàn bộ hành vi.',changedPaths:draft.allowedPaths,commit,localArtifact:{branch:'lab/REQ-ABCDEF12-123'},checks:[{command:'npm run check',passed:true,output:'passed'}]};
test('admin acceptance queues a bound release; claims are exclusive, sanitized and ordered; retries never approve coding',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'release-')),db=openDatabase(dir),s=createService(db);
 try{
  const r=s.create({feedback:'Thay ký tự gạch ngang trong Draft.'},'User');s.submit(r.id,draft,'Admin');const c=s.claim(r.id,'mac',r.baseCommit);s.complete(r.id,c.claimToken,report);
  assert.equal(s.releases().length,0);const accepted=s.accept(r.id,'Admin');assert.equal(accepted.release.phase,'queued');assert.throws(()=>s.reject(r.id,'Admin','Cancel during publish'));
  assert.throws(()=>s.publish(r.id,'Admin'));const claim=s.claimRelease(r.id,'publisher');assert.throws(()=>s.claimRelease(r.id,'other'));
  assert.ok(!JSON.stringify(s.get(r.id)).includes(claim.releaseToken));assert.ok(!JSON.stringify(s.releases()).includes('tokenHash'));
  assert.throws(()=>s.updateRelease(r.id,claim.releaseToken,{phase:'deployed',note:'Fake deployment success'}));
  assert.throws(()=>s.updateRelease(r.id,claim.releaseToken,{phase:'ci',prNumber:1,prUrl:'https://github.com/evil/repo/pull/1',note:'Wrong repository PR'}));
  s.updateRelease(r.id,claim.releaseToken,{phase:'ci',prNumber:1,prUrl:`https://github.com/${repo}/pull/1`,note:'CI đang chạy.'});
  assert.throws(()=>s.updateRelease(r.id,claim.releaseToken,{phase:'failed',note:'Stale claim'}));
  const next=s.claimRelease(r.id,'publisher');s.updateRelease(r.id,next.releaseToken,{phase:'deploying',mergeCommit:merged,note:'Đã merge đúng commit.'});
  const fail=s.claimRelease(r.id,'publisher');s.updateRelease(r.id,fail.releaseToken,{phase:'failed',note:'Railway mất kết nối.'});
  const retry=s.publish(r.id,'Admin');assert.equal(retry.release.phase,'deploying');assert.equal(retry.status,'completed');assert.equal(s.ready().length,0);
  const final=s.claimRelease(r.id,'publisher');s.updateRelease(r.id,final.releaseToken,{phase:'deployed',note:'Railway xác nhận đúng commit.'});assert.equal(s.releases().length,0);assert.equal(s.releaseLibrarySync(r.id,true).release.librarySync,'synced');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('high risk requires separate explicit release confirmation and failed checks cannot publish',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'release-risk-')),db=openDatabase(dir),s=createService(db);
 try{
  const r=s.create({feedback:'Thay giao diện có rủi ro cao.'},'User');s.submit(r.id,{...draft,risk:'high'},'Admin',{confirmHighRisk:true});const c=s.claim(r.id,'mac',r.baseCommit);s.complete(r.id,c.claimToken,report);
  assert.throws(()=>s.accept(r.id,'Admin'));assert.equal(s.get(r.id).status,'review');assert.equal(s.accept(r.id,'Admin',{confirmHighRisk:true}).release.phase,'queued');
  const f=s.create({feedback:'Sửa Draft nhưng kiểm tra thất bại.'},'User');s.submit(f.id,draft,'Admin');const fc=s.claim(f.id,'mac',f.baseCommit);s.complete(f.id,fc.claimToken,{...report,checks:[{command:'npm run check',passed:false,output:'failed'}]});assert.throws(()=>s.accept(f.id,'Admin'));assert.throws(()=>s.publish(f.id,'Admin'));
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
const packet=(phase='queued')=>({id:'REQ-ABCDEF12',repository:repo,title:draft.title,status:'completed',baseCommit:base,draft,result:report,release:{phase,prNumber:1,authorizedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}});
const config={repoPath:'/tmp/test-publisher',ghPath:'/opt/homebrew/bin/gh',releaseEnvironment:'production'};
const gitRun=async(_,args)=>{const a=args.slice(2);let stdout='';if(a[0]==='remote')stdout=`https://github.com/${repo}.git`;if(a[0]==='rev-parse')stdout=a[1].endsWith('^')?base:commit;if(a[0]==='diff')stdout=draft.allowedPaths[0];return {code:0,stdout};};
const pr={number:1,html_url:`https://github.com/${repo}/pull/1`,head:{sha:commit,repo:{full_name:repo}},base:{ref:'main',repo:{full_name:repo}},changed_files:1,state:'open',mergeable:true,mergeable_state:'clean'};
const check={head_sha:commit,name:'writer-check',app:{slug:'github-actions'},status:'completed',conclusion:'success'};
test('publisher creates a PR idempotently and never force pushes or writes main',async()=>{
 const commands=[];const run=async(e,a)=>{commands.push(a);return gitRun(e,a);};
 const api=async(endpoint,method,body)=>{if(endpoint.includes('/pulls?'))return [];assert.equal(method,'POST');assert.equal(body.base,'main');return pr;};
 const result=await publishStep({request:packet(),config,run,api});assert.equal(result.phase,'ci');assert.ok(commands.some(a=>a.includes('push')));assert.ok(!commands.some(a=>a.includes('--force')||a.includes('main')));
 await assert.rejects(publishStep({request:{...packet(),result:{...report,changedPaths:['backend/index.ts']}},config,run,api}),/phạm vi/);
});
const ciApi=(checks=[check,{...check,name:"browser-check"}],override={})=>async(endpoint,method)=>{
 if(method==='PUT')return {merged:true,sha:merged};
 if(endpoint.includes('/files?'))return [{filename:draft.allowedPaths[0]}];
 if(endpoint.includes('/check-runs?'))return {total_count:checks.length,check_runs:checks};
 if(endpoint.endsWith('/status'))return {statuses:[]};
 return {...pr,...override};
};
test('merge requires exact head, scoped PR, successful real GitHub Actions check; empty/pending never merge',async()=>{
 assert.equal((await publishStep({request:packet('ci'),config,run:gitRun,api:ciApi([])})).phase,'ci');
 await assert.rejects(publishStep({request:packet('ci'),config,run:gitRun,api:ciApi([{...check,conclusion:'failure'}])}),/CI/);
 await assert.rejects(publishStep({request:packet('ci'),config,run:gitRun,api:ciApi([check,{...check,name:"browser-check"}],{head:{sha:merged}})}),/head/);
 await assert.rejects(publishStep({request:packet('ci'),config,run:gitRun,api:ciApi([check,{...check,name:"browser-check"}],{mergeable:false})}),/xung đột/);
 const result=await publishStep({request:packet('ci'),config,run:gitRun,api:ciApi()});assert.equal(result.phase,'deploying');assert.equal(result.mergeCommit,merged);
});
test('Railway success must belong to the expected commit, environment and Railway bot; failures retain merged main',async()=>{
 const r=packet('deploying');r.release.mergeCommit=merged;
 const api=(sha=merged,state='success')=>async endpoint=>endpoint.includes('/statuses')?[{state,environment_url:'https://railway.com/project/test'}]:[{id:5,sha,environment:'production',creator:{login:'railway-app[bot]'}}];
 assert.equal((await publishStep({request:r,config,run:gitRun,api:api()})).phase,'deployed');
 assert.equal((await publishStep({request:r,config,run:gitRun,api:api(base)})).phase,'deploying');
 await assert.rejects(publishStep({request:r,config,run:gitRun,api:api(merged,'failure')}),/Railway deploy lỗi/);
});
test('release HTTP endpoints require admin acceptance and authenticated publisher; claims never leak to readers',async()=>{
 const {createApp}=await import('../server/index.js');
 const dir=mkdtempSync(path.join(os.tmpdir(),'release-http-'));
 const config={DATA_DIR:dir,ADMIN_PASSWORD:'admin-'.repeat(6),USER_PASSWORD:'member-'.repeat(6),MCP_TOKEN:'mcp-'.repeat(10),SESSION_SECRET:'session-'.repeat(6)};
 const {app,db,service:s}=createApp(config);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const r=s.create({feedback:'Thay dấu gạch ngang hiển thị Draft.'},'Member');s.submit(r.id,draft,'Admin');const c=s.claim(r.id,'Mac',r.baseCommit);s.complete(r.id,c.claimToken,report);
  const login=async password=>{const res=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Test',password})});return {Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':(await res.json()).user.csrf,'Content-Type':'application/json'};};
  const member=await login(config.USER_PASSWORD),admin=await login(config.ADMIN_PASSWORD);
  assert.equal((await fetch(origin+'/api/requests/'+r.id+'/accept',{method:'POST',headers:member,body:'{}'})).status,403);
  assert.equal((await fetch(origin+'/runner/releases')).status,401);
  assert.equal((await fetch(origin+'/api/requests/'+r.id+'/accept',{method:'POST',headers:admin,body:'{}'})).status,200);
  const bearer={Authorization:'Bearer '+config.MCP_TOKEN,'Content-Type':'application/json'};
  const claimed=await (await fetch(origin+'/runner/releases/'+r.id+'/claim',{method:'POST',headers:bearer,body:'{}'})).json();assert.ok(claimed.releaseToken);
  const publicRows=await (await fetch(origin+'/api/requests',{headers:member})).text();assert.ok(!publicRows.includes(claimed.releaseToken));assert.ok(!publicRows.includes('tokenHash'));
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});
test('publisher ignores checks on another SHA and rejects rename sources outside approved scope',async()=>{
 const checks=[{...check,head_sha:merged},{...check,name:'browser-check',head_sha:merged}];const r=await publishStep({request:packet('ci'),config,run:gitRun,api:ciApi(checks)});assert.equal(r.phase,'ci');
 const good=ciApi();const api=async(e,m,b)=>e.includes('/files?')?[{filename:draft.allowedPaths[0],previous_filename:'backend/secrets.ts'}]:good(e,m,b);
 await assert.rejects(()=>publishStep({request:packet('ci'),config,run:gitRun,api}),/phạm vi/);
});
