import {test} from 'node:test';import assert from 'node:assert/strict';
import {browserCriterion,criterionLogEvidence,collectCriterionCi,reportedCriterionEvidence} from '../server/criterion-ci.js';
const command='node node_modules/@playwright/test/cli.js test tests/browser/draft.spec.ts --grep qc-schema';
const row={criterionIndex:0,verification:{method:'test',command,files:['tests/browser/draft.spec.ts','tests/browser/fixture.tsx']}};
const logs='2026-10-23 ✓ 1 [desktop] › tests/browser/draft.spec.ts:12:1 › qc-schema generation saves checkpoint (1s)\n2026-10-23 ✓ 2 [mobile] › tests/browser/draft.spec.ts:12:1 › qc-schema generation saves checkpoint (1s)';
test('criterion CI requires approved explicit browser commands and passing records on both platforms',()=>{assert.ok(browserCriterion(command));for(const c of ['npm run check',command+' --list',command+'; echo pass',command.replace('qc-schema','.*')])assert.equal(browserCriterion(c),null);assert.equal(criterionLogEvidence([row],logs)[0].names.length,2);for(const bad of ['',logs.split('\n')[0],logs.replaceAll('✓','-'),logs.replaceAll('qc-schema','other-tag'),logs.replaceAll('draft.spec.ts:','unrelated.spec.ts:'),logs+'\n2026 - 3 [desktop] › tests/browser/draft.spec.ts:4:1 › qc-schema skipped'])assert.throws(()=>criterionLogEvidence([row],bad));});
test('criterion reconciliation independently checks exact PR/head/base/scope and job before reading test records',async()=>{const repo='owner/repo',commit='a'.repeat(40),base='b'.repeat(40),branch='lab/REQ-ABCDEF12-123';const r={id:'REQ-ABCDEF12',repository:repo,branch:'main',baseCommit:base,draft:{allowedPaths:['src/ui.tsx',...row.verification.files],traceability:[row]},result:{localArtifact:{branch}}};const pr={number:6,changed_files:3,html_url:'https://github.com/'+repo+'/pull/6',head:{sha:commit,ref:branch,repo:{full_name:repo}},base:{ref:'main',repo:{full_name:repo}}};const fixtures={['pulls?state=open&head='+encodeURIComponent('owner:'+branch)+'&base=main']:[{number:6}],'pulls/6':pr,'pulls/6/files?per_page=100':r.draft.allowedPaths.map(filename=>({filename})),['commits/'+commit]:{parents:[{sha:base}]},['commits/'+commit+'/check-runs?per_page=100']:{total_count:2,check_runs:['writer-check','browser-check'].map((name,id)=>({id,name,head_sha:commit,app:{slug:'github-actions'},status:'completed',conclusion:'success',details_url:'https://github.com/'+repo+'/actions/runs/12/job/34'}))},['commits/'+commit+'/status']:{statuses:[]},'actions/jobs/34':{head_sha:commit,name:'browser-check',status:'completed',conclusion:'success'}};const fetcher=async url=>({ok:true,json:async()=>structuredClone(fixtures[url.split(repo+'/')[1]]),text:async()=>logs});assert.equal((await collectCriterionCi(r,null,fetcher)).commit,commit);const unit={criterionIndex:1,verification:{method:'test',command:'node --test tests/browser/draft.spec.ts',files:[row.verification.files[0]]}};r.draft.traceability.push(unit);r.result.commit=commit;r.result.criterionEvidence=[{criterionIndex:1,method:'test',command:unit.verification.command,files:unit.verification.files,outcome:'passed',detail:'Unit test ran successfully on this exact pinned artifact.'}];r.result.checks=[{command:unit.verification.command,passed:true}];const mixed=await collectCriterionCi(r,null,fetcher);assert.equal(mixed.criteria.length,2);assert.equal(mixed.criteria.find(c=>c.criterionIndex===1).source,'agent-reported');r.draft.traceability.pop();delete r.result.commit;const checkKey='commits/'+commit+'/check-runs?per_page=100';fixtures[checkKey].check_runs[1].status='in_progress';fixtures[checkKey].check_runs[1].conclusion=null;let pending=await collectCriterionCi(r,null,fetcher);assert.equal(pending.pending,true);assert.equal(pending.jobs[1].status,'in_progress');assert.equal(pending.failed,false);fixtures[checkKey].check_runs[1].status='completed';fixtures[checkKey].check_runs[1].conclusion='failure';pending=await collectCriterionCi(r,null,fetcher);assert.equal(pending.failed,true);assert.equal(pending.failures[0].name,'browser-check');fixtures[checkKey].check_runs[1].conclusion='success';for(const [key,change] of [['pulls/6/files?per_page=100',x=>x[0].filename='.github/workflows/evil.yml'],['commits/'+commit,x=>x.parents[0].sha='c'.repeat(40)],['actions/jobs/34',x=>x.head_sha='c'.repeat(40)]]){const old=structuredClone(fixtures[key]);change(fixtures[key]);await assert.rejects(()=>collectCriterionCi(r,null,fetcher));fixtures[key]=old;}});
test('quoted grep alternatives require every tag on both viewports and reject shell or arbitrary regex',()=>{
 const c=command.replace('qc-schema',"'qc-schema|qc-preserved'");
 assert.deepEqual(browserCriterion(c).tags,['qc-schema','qc-preserved']);
 const both=logs+'\n'+logs.replaceAll('qc-schema','qc-preserved');
 assert.equal(criterionLogEvidence([{...row,verification:{...row.verification,command:c}}],both)[0].names.length,4);
 assert.throws(()=>criterionLogEvidence([{...row,verification:{...row.verification,command:c}}],logs),/qc-preserved/);
 for(const value of ["'qc-schema|.*'",'qc-schema|qc-preserved',"'qc-schema;whoami'",'"qc-schema|$(id)"',"'qc-schema||qc-preserved'"])
  assert.equal(browserCriterion(command.replace('qc-schema',value)),null);
});

test('tagged npx and pinned config commands reconcile without allowing full-suite or shell options',()=>{
 for(const prefix of ['node node_modules/@playwright/test/cli.js','npx playwright','npx --no-install playwright'])for(const config of ['', ' --config=playwright.agent-lab.config.mjs',' --config playwright.config.ts']){
  const c=prefix+' test tests/agent-lab/draft.spec.mjs'+config+' --grep created-origin';
  assert.equal(browserCriterion(c).grep,'created-origin');
 }
 for(const c of ['npx playwright test --config=playwright.agent-lab.config.mjs tests/agent-lab/draft.spec.mjs','npx playwright test tests/agent-lab/draft.spec.mjs --grep created --list','npx playwright test tests/agent-lab/draft.spec.mjs --config=../../evil.mjs --grep created'])assert.equal(browserCriterion(c),null);
});

test('pinned config option is accepted in each CLI position with tags still mandatory',()=>{
 const file='tests/agent-lab/draft.spec.mjs',cfg='--config=playwright.agent-lab.config.mjs';
 for(const suffix of [cfg+' '+file+' --grep created',file+' '+cfg+' --grep created',file+' --grep created '+cfg])assert.equal(browserCriterion('npx playwright test '+suffix).file,file);
 assert.equal(browserCriterion('npx playwright test '+cfg+' '+file+' --grep created '+cfg),null);
});

test('mixed plans preserve local unit evidence without claiming browser CI verification and reject stale/missing/failed reports',()=>{
 const commit='a'.repeat(40),unit={criterionIndex:1,verification:{method:'test',command:'node --test tests/agent-lab/prompt.test.mjs',files:['tests/agent-lab/prompt.test.mjs']}};
 const e={criterionIndex:1,method:'test',command:unit.verification.command,files:unit.verification.files,outcome:'passed',detail:'Four isolated unit tests passed without calling any provider.'};
 const r={result:{commit,criterionEvidence:[e],checks:[{command:e.command,passed:true}]}};
 const proof=reportedCriterionEvidence(r,[unit],commit)[0];assert.equal(proof.source,'agent-reported');assert.deepEqual(proof.names,[]);
 assert.throws(()=>reportedCriterionEvidence(r,[unit],'b'.repeat(40)),/xác minh lại/);
 for(const mutation of [v=>v.result.criterionEvidence[0].outcome='pending-ci',v=>v.result.checks[0].passed=false,v=>v.result.criterionEvidence[0].command='npm run check']){const v=structuredClone(r);mutation(v);assert.throws(()=>reportedCriterionEvidence(v,[unit],commit));}
 const repaired=structuredClone(r);repaired.ciRepair={phase:'pushed',commit:'b'.repeat(40),criterionEvidence:[e],checks:[{command:e.command,passed:true}]};assert.equal(reportedCriterionEvidence(repaired,[unit],'b'.repeat(40))[0].source,'agent-reported');
});
