import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {labMaintenance,completeReviewPages,checkoutPinned,reviewEvidence,eligibleFinding,repairPath,ciReady,reviewedHead,atomicJson,reviewBot,labRepository} from '../mac/lab-maintenance.js';
const sha='a'.repeat(40),bot={login:reviewBot,type:'Bot'},finding={id:123,commit_id:sha,user:bot,path:'src/App.jsx',body:'[P1] unsafe startup retry',pull_request_url:'https://api.github.com/repos/'+labRepository+'/pulls/104',created_at:'2026-10-29T00:00:00Z'};
test('only authenticated fixed-repository bot findings are eligible, and protected update/auth/policy paths cannot self-modify',()=>{
 assert.equal(eligibleFinding(finding),true);
 for(const v of [{...finding,user:{login:reviewBot,type:'User'}},{...finding,user:{login:'other[bot]',type:'Bot'}},{...finding,commit_id:'bad'},{...finding,pull_request_url:'https://api.github.com/repos/attacker/repo/pulls/104'},{...finding,body:'P2 cosmetic'}])assert.equal(eligibleFinding(v),false);
 for(const p of ['mac/codex-events.js','tests/recovery.test.js','docs/runner.md','server/ci-infrastructure.js'])assert.equal(repairPath(p),true,p);
 for(const p of ['mac/codex.js','mac/ci-template.js','mac/control-wake.js','mac/monitor.js','server/scope.js','server/risk-rubric.js','server/recheck-policy.js','server/service.js','server/schemas.js','server/release.js','mac/runner.js','mac/planning.js','mac/codex-recovery.js','mac/release.js','mac/supervisor.js','mac/runtime-activation.js','mac/lab-maintenance.js','mac/install.js','mac/config.local.json','.github/workflows/check.yml','package.json','AGENTS.md','library/policies/automation.md','server/auth.js','src/../secret.js'])assert.equal(repairPath(p),false,p);
});
test('required CI and clean review must be exact-head; unrelated success or unresolved findings never grant merge',()=>{
 const check={id:1,name:'check',head_sha:sha,app:{slug:'github-actions'},status:'completed',conclusion:'success'};
 assert.equal(ciReady({total_count:1,check_runs:[check]},sha),true);
 for(const change of [{head_sha:'b'.repeat(40)},{status:'in_progress'},{conclusion:'skipped'},{app:{slug:'other'}}])assert.equal(ciReady({total_count:1,check_runs:[{...check,...change}]},sha),false);
 assert.equal(ciReady({total_count:101,check_runs:[check]},sha),false);
 const review={user:bot,commit_id:sha,state:'APPROVED'};assert.equal(reviewedHead([review],[],sha),true);assert.equal(reviewedHead([review],[finding],sha),false);assert.equal(reviewedHead([{...review,commit_id:'b'.repeat(40)}],[],sha),false);
});
test('maintenance is opt-in and persists rejected/interrupted work without an automatic paid replay',async()=>{
 const root=await mkdtemp('/tmp/lab-maintenance-test-');try{
 let calls=0;const disabled=labMaintenance({stateDir:root},async()=>{calls++;throw Error('unexpected');},{});await disabled.tick();assert.equal(await disabled.runtime(null),null);assert.equal(calls,0);
 const dir=root+'/lab-maintenance';await mkdir(dir);await atomicJson(dir+'/jobs.json',{jobs:[{id:123,phase:'coding',sourcePr:104,attempts:1}]});
 const run=async(exe,args)=>{calls++;assert.equal(args[0],'api');return {code:0,stdout:JSON.stringify([finding])};};
 const maintenance=labMaintenance({stateDir:root,labReviewAutomation:true,labReviewSince:'2026-10-28T00:00:00Z'},run,{});await maintenance.tick();let saved=JSON.parse(await readFile(dir+'/jobs.json'));assert.equal(saved.jobs.length,1);assert.equal(saved.jobs[0].phase,'blocked');assert.equal(saved.jobs[0].attempts,1);await maintenance.tick();saved=JSON.parse(await readFile(dir+'/jobs.json'));assert.equal(saved.jobs[0].attempts,1);assert.equal(calls,2);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('a closed unmerged PR is ignored without touching a checkout or calling Codex',async()=>{
 const root=await mkdtemp('/tmp/lab-maintenance-test-');try{
 const calls=[];const run=async(exe,args)=>{calls.push({exe,args});return {code:0,stdout:JSON.stringify(args[3]?.includes('/pulls/comments')?[finding]:{state:'closed',merged:false})};};
 const maintenance=labMaintenance({stateDir:root,labReviewAutomation:true,labReviewSince:'2026-10-28T00:00:00Z'},run,{});await maintenance.tick();const state=JSON.parse(await readFile(root+'/lab-maintenance/jobs.json'));assert.equal(state.jobs[0].phase,'ignored');assert.equal(calls.length,2);assert.ok(calls.every(c=>c.args[0]==='api'));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('exact-head reviewed repair completes once and stale base never merges',async()=>{
 const root=await mkdtemp('/tmp/lab-maintenance-flow-');try{
  const current='b'.repeat(40),fixed='c'.repeat(40),base='d'.repeat(40);let modelCalls=0,merges=0;
  const dir=root+'/lab-maintenance';await mkdir(dir);const state={jobs:[{id:123,sourcePr:104,prNumber:105,phase:'ci',attempts:1,commit:fixed,base,branch:'lab-review/123',publishedAt:Date.now()}]};await atomicJson(dir+'/jobs.json',state);
  const run=async(exe,args,options)=>{assert.equal(args[0],'api');const endpoint=args[3];let data;
   if(endpoint.includes('/pulls/comments?'))data=[];
   else if(endpoint.endsWith('/pulls/105/merge')){merges++;assert.equal(JSON.parse(options.input).sha,fixed);data={merged:true,sha:current};}
   else if(endpoint.includes('/issues/105/comments?')||endpoint.includes('/pulls/105/comments?'))data=[];
   else if(endpoint.endsWith('/pulls/105/reviews?per_page=100'))data=[{user:bot,commit_id:fixed,state:'APPROVED'}];
   else if(endpoint.includes('/check-runs?'))data={total_count:1,check_runs:[{id:2,name:'check',head_sha:fixed,app:{slug:'github-actions'},status:'completed',conclusion:'success'}]};
   else if(endpoint.endsWith('/pulls/105'))data={number:105,state:'open',draft:false,head:{sha:fixed,ref:'lab-review/123',repo:{full_name:labRepository}},base:{sha:base,ref:'main',repo:{full_name:labRepository}}};
   else throw Error('Unexpected endpoint '+endpoint);
   return {code:0,stdout:JSON.stringify(data)};
  };
  const maintenance=labMaintenance({stateDir:root,labReviewAutomation:true},run,{});await maintenance.tick();const saved=JSON.parse(await readFile(dir+'/jobs.json'));assert.equal(saved.jobs[0].phase,'merged');assert.equal(saved.jobs[0].mergeCommit,current);assert.equal(merges,1);assert.equal(modelCalls,0);
  await atomicJson(dir+'/jobs.json',{jobs:[{...state.jobs[0],base:'e'.repeat(40)}]});await maintenance.tick();assert.equal(JSON.parse(await readFile(dir+'/jobs.json')).jobs[0].phase,'blocked');assert.equal(merges,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('runtime update never installs unreviewed main even with green CI',async()=>{
 const root=await mkdtemp('/tmp/lab-maintenance-runtime-');try{
 const commit='a'.repeat(40);let executableCalls=0;
 const run=async(exe,args)=>{if(args[0]!=='api'){executableCalls++;throw Error('must not install');}const endpoint=args[3];let data;
 if(endpoint.endsWith('/commits/main'))data={sha:commit};
 else if(endpoint.includes('/check-runs?'))data={total_count:1,check_runs:[{id:1,name:'check',head_sha:commit,app:{slug:'github-actions'},status:'completed',conclusion:'success'}]};
 else if(endpoint.endsWith('/commits/'+commit+'/pulls'))data=[{number:104,merged_at:'2026-10-29T00:00:00Z',merge_commit_sha:commit,base:{ref:'main'},head:{sha:commit,repo:{full_name:labRepository}}}];
 else if(endpoint.includes('/issues/'))data=[];else if(endpoint.includes('/comments?'))data=[finding];else if(endpoint.includes('/reviews?'))data=[{user:bot,commit_id:commit}];else throw Error('unexpected');return {code:0,stdout:JSON.stringify(data)};};
 assert.equal(await labMaintenance({stateDir:root,labReviewAutomation:true,mcpUrl:'https://lab.example/mcp'},run,{},async()=>({ok:true,json:async()=>({ok:true,deployedCommit:commit})})).runtime(null),null);assert.equal(executableCalls,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('green main never updates Mac before Railway health confirms that exact commit',async()=>{
 const root=await mkdtemp('/tmp/lab-maintenance-health-');try{
 let writes=0;const commit='a'.repeat(40);
 const run=async(exe,args)=>{assert.equal(args[0],'api');const endpoint=args[3];if(endpoint.endsWith('/commits/main'))return {code:0,stdout:JSON.stringify({sha:commit})};if(endpoint.includes('/check-runs?'))return {code:0,stdout:JSON.stringify({total_count:1,check_runs:[{id:1,name:'check',head_sha:commit,app:{slug:'github-actions'},status:'completed',conclusion:'success'}]})};writes++;throw Error('must not install');};
 for(const deployed of [null,'b'.repeat(40)]){const m=labMaintenance({stateDir:root,labReviewAutomation:true,mcpUrl:'https://lab.example/mcp'},run,{},async(url,options)=>{assert.equal(url.href,'https://lab.example/health');assert.equal(options.redirect,'error');return {ok:true,json:async()=>({ok:true,deployedCommit:deployed})};});assert.equal(await m.runtime(null),null);}assert.equal(writes,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('only authenticated exact-commit completed clean bot summary counts, never a reaction or running/stale/malformed summary',()=>{
 const state={code_review:{commit_sha:sha,status:'completed',has_any_findings:false,has_unresolved_findings:false}};
 const summary=v=>({user:bot,body:'<!-- codex-review-state:v1 '+JSON.stringify(v)+' -->'});
 assert.equal(reviewedHead([],[],sha,[summary(state)]),true);
 for(const v of [{...state,code_review:{...state.code_review,status:'running'}},{...state,code_review:{...state.code_review,commit_sha:'b'.repeat(40)}},{...state,code_review:{...state.code_review,has_any_findings:true}},{...state,security_review:{commit_sha:sha,status:'running'}}])assert.equal(reviewedHead([],[],sha,[summary(v)]),false);
 assert.equal(reviewedHead([],[],sha,[{...summary(state),user:{login:'attacker',type:'Bot'}}]),false);
 assert.equal(reviewedHead([],[finding],sha,[summary(state)]),false);
});

test('negative top-level or security summary cannot be overridden by an otherwise valid review',()=>{
 const summary={user:bot,body:'<!-- codex-review-state:v1 '+JSON.stringify({code_review:{commit_sha:sha,status:'completed',has_any_findings:false,has_unresolved_findings:false},security_review:{commit_sha:sha,status:'completed',has_any_findings:true,has_unresolved_findings:true}})+' -->'};
 const approved={user:bot,commit_id:sha,state:'APPROVED'};assert.equal(reviewEvidence([approved],[],sha,[summary]).blocked,true);assert.equal(reviewedHead([approved],[],sha,[summary]),false);
 for(const r of [{...approved,state:'CHANGES_REQUESTED',body:'P1 unsafe retry'},{...approved,state:'COMMENTED',body:'P1 unsafe retry'}])assert.equal(reviewedHead([r],[],sha),false);
 assert.equal(reviewedHead([{...approved,state:'COMMENTED'}],[],sha),false);
});

test('fresh no-checkout Git clones initialize once; existing dirty worktrees are never reset',async()=>{
 const {execFileSync}=await import('node:child_process'),{writeFile}=await import('node:fs/promises');const root=await mkdtemp('/tmp/lab-fresh-checkout-');
 const git=(dir,args)=>execFileSync('git',['-c','core.hooksPath=/dev/null','-C',dir,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{const origin=root+'/origin',clone=root+'/clone';await mkdir(origin);git(origin,['init']);await writeFile(origin+'/tracked.txt','original');git(origin,['add','tracked.txt']);git(origin,['-c','user.name=Test','-c','user.email=test@example.com','commit','-m','initial']);const head=git(origin,['rev-parse','HEAD']);
 execFileSync('git',['clone','--no-checkout',origin,clone],{stdio:'pipe'});assert.match(git(clone,['status','--porcelain']),/D\s+tracked/);
 await checkoutPinned(async args=>git(clone,args),head,true);assert.equal(git(clone,['status','--porcelain']),'');assert.equal(await readFile(clone+'/tracked.txt','utf8'),'original');
 await writeFile(clone+'/tracked.txt','preserved edits');await assert.rejects(()=>checkoutPinned(async args=>git(clone,args),head,false),/Dirty maintenance/);assert.equal(await readFile(clone+'/tracked.txt','utf8'),'preserved edits');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('complete review pagination includes later negative evidence and fails closed at bound',async()=>{
 const approved={user:bot,commit_id:sha,state:'APPROVED'},negative={user:bot,commit_id:sha,state:'CHANGES_REQUESTED',body:'P1 security blocker'};const seen=[];
 const rows=await completeReviewPages(async endpoint=>{seen.push(endpoint);return endpoint.endsWith('&page=2')?[negative]:Array.from({length:100},()=>approved);},'reviews?per_page=100');
 assert.equal(rows.length,101);assert.equal(seen.length,2);assert.equal(reviewedHead(rows,[],sha),false);
 await assert.rejects(()=>completeReviewPages(async()=>Array.from({length:100},()=>approved),'reviews?per_page=100'),/pagination/);
 const summary={user:bot,body:'<!-- codex-review-state:v1 '+JSON.stringify({code_review:{commit_sha:sha,status:'completed',has_any_findings:true,has_unresolved_findings:true}})+' -->'};
 const summaries=await completeReviewPages(async endpoint=>endpoint.endsWith('&page=2')?[summary]:Array.from({length:100},()=>({user:{login:'other'},body:''})),'comments?per_page=100');assert.equal(reviewedHead([approved],[],sha,summaries),false);
});

test('a stale pending CI job becomes explicit blocked state without a model or merge',async()=>{
 const root=await mkdtemp('/tmp/lab-maintenance-expiry-');try{await mkdir(root+'/lab-maintenance');await atomicJson(root+'/lab-maintenance/jobs.json',{jobs:[{id:123,phase:'ci',prNumber:105,publishedAt:Date.now()-25*3600000,attempts:1}]});let reads=0;const run=async(_,args)=>{reads++;assert.ok(args[3].includes('/pulls/comments?'));return {code:0,stdout:'[]'};};await labMaintenance({stateDir:root,labReviewAutomation:true},run,{}).tick();const state=JSON.parse(await readFile(root+'/lab-maintenance/jobs.json'));assert.equal(state.jobs[0].phase,'blocked');assert.equal(reads,1);}finally{await rm(root,{recursive:true,force:true});}
});

test('a late negative top-level review is refreshed before merge and cannot be overridden by local approval',async()=>{
 const root=await mkdtemp('/tmp/lab-late-review-');try{const commit='a'.repeat(40),base='b'.repeat(40);await mkdir(root+'/lab-maintenance');await atomicJson(root+'/lab-maintenance/jobs.json',{jobs:[{id:123,phase:'ci',prNumber:105,branch:'lab-review/123',base,commit,publishedAt:Date.now(),attempts:1,review:{commit}}]});let reviews=0,merges=0;
 const run=async(_,args)=>{const endpoint=args[3];let data;if(endpoint.includes('/pulls/comments?')||endpoint.includes('/issues/105/comments?')||endpoint.includes('/pulls/105/comments?'))data=[];else if(endpoint.includes('/reviews?')){reviews++;data=reviews===1?[]:[{user:bot,commit_id:commit,state:'CHANGES_REQUESTED',body:'P1 late issue'}];}else if(endpoint.includes('/check-runs?'))data={total_count:1,check_runs:[{id:1,name:'check',head_sha:commit,app:{slug:'github-actions'},status:'completed',conclusion:'success'}]};else if(endpoint.endsWith('/pulls/105'))data={state:'open',number:105,head:{sha:commit,ref:'lab-review/123',repo:{full_name:labRepository}},base:{sha:base,ref:'main',repo:{full_name:labRepository}}};else if(endpoint.includes('/merge')){merges++;data={merged:true};}else throw Error('Unexpected '+endpoint);return {code:0,stdout:JSON.stringify(data)};};await labMaintenance({stateDir:root,labReviewAutomation:true},run,{}).tick();assert.equal(merges,0);assert.equal(reviews,2);assert.equal(JSON.parse(await readFile(root+'/lab-maintenance/jobs.json')).jobs[0].phase,'blocked');
 }finally{await rm(root,{recursive:true,force:true});}
});
