import {test} from 'node:test';import assert from 'node:assert/strict';
import {ciInfrastructure} from '../server/ci-infrastructure.js';
const sha='a'.repeat(40),run={id:10,name:'browser-tests (mobile)',head_sha:sha,app:{slug:'github-actions'},status:'completed',conclusion:'failure',details_url:'https://github.com/o/r/actions/runs/1/job/2'};
const response={check_runs:[run]},job={head_sha:sha,name:run.name,steps:[{name:'Prepare Chromium with bounded retry',status:'completed',conclusion:'failure'},{name:'Run npx playwright test',status:'completed',conclusion:'skipped'}]};
test('browser environment failure before tests is classified without converting it to success',async()=>{const out=await ciInfrastructure(async()=>job,response,sha);assert.equal(out.failureKind,'infrastructure');assert.equal(out.jobs[0].conclusion,'failure');});
test('test failures, wrong-head job evidence and unreadable jobs never count as known infrastructure failures',async()=>{for(const altered of [{...job,head_sha:'b'.repeat(40)},null])assert.equal((await ciInfrastructure(async()=>altered,response,sha)).failureKind,'unknown');assert.equal((await ciInfrastructure(async()=>{throw Error('403');},response,sha)).failureKind,'unknown');});
test('active browser setup is visible and latest job attempt replaces an old failure',async()=>{const active={...run,id:11,status:'in_progress',conclusion:null};const out=await ciInfrastructure(async()=>({...job,steps:[{name:'Run npx playwright install --with-deps chromium',status:'in_progress'}]}),{check_runs:[run,active]},sha);assert.equal(out.jobs.length,1);assert.equal(out.jobs[0].stage,'Đang chuẩn bị Chromium');assert.equal(out.failureKind,undefined);});
test('a separate code failure cannot be hidden by an infrastructure failure',async()=>{assert.equal((await ciInfrastructure(async()=>job,{check_runs:[run,{...run,name:'writer-check',id:12}]},sha)).failureKind,'unknown');});
test('single browser-check workflows also expose setup failures before tests',async()=>{const mono={...run,name:'browser-check'};const out=await ciInfrastructure(async()=>({...job,name:mono.name}),{check_runs:[mono]},sha);assert.equal(out.failureKind,'infrastructure');assert.equal(out.jobs[0].name,'browser-check');});

test('named browser assertions are test failures, with the exact failed step',async()=>{
 const out=await ciInfrastructure(async(p,logs)=>logs?'Error: expect(locator).toHaveCSS(expected) failed':({...job,steps:[{name:'Run browser tests',status:'completed',conclusion:'failure'}]}),response,sha);
 assert.equal(out.failureKind,'test');assert.equal(out.jobs[0].failedStep,'Run browser tests');
});
test('container startup failures and pinned Chromium preflight remain infrastructure failures',async()=>{
 for(const name of ['Initialize containers','Set up job','Verify pinned Playwright environment']){
  const out=await ciInfrastructure(async()=>({...job,steps:[{name,status:'completed',conclusion:'failure'},{name:'Run browser tests',status:'completed',conclusion:'skipped'}]}),response,sha);
  assert.equal(out.failureKind,'infrastructure');assert.equal(out.jobs[0].failedStep,name);
 }
});
test('aggregate failure is retained as a consequence; latest writer success replaces old failure',async()=>{
 const out=await ciInfrastructure(async()=>job,{check_runs:[run,{...run,id:11,name:'browser-check'},{...run,id:12,name:'writer-check'},{...run,id:13,name:'writer-check',conclusion:'success'}]},sha);
 assert.equal(out.failureKind,'infrastructure');assert.equal(out.jobs.length,3);assert.match(out.jobs.find(j=>j.name==='browser-check').stage||'',/^$|Thiếu/);
});
test('a failing aggregate after successful shards cannot be treated as infrastructure',async()=>{
 const out=await ciInfrastructure(async()=>job,{check_runs:[{...run,conclusion:'success'},{...run,id:11,name:'browser-check'}]},sha);
 assert.equal(out.failureKind,'unknown');
});

test('actual browser timeout outranks an echoed image check that succeeded earlier in the same job',async()=>{
 const log=`##[group]Run node -e "if(v!=='1.64.1') throw Error('Playwright image/package mismatch: '+v)"\nnode -e "if(v!=='1.64.1') throw Error('Playwright image/package mismatch: '+v)"\nLAB_TEST_V1 ${JSON.stringify({protocol:'lab-test-v1',commit:sha,project:'mobile',file:'tests/agent-lab/sidebar-scroll.spec.mjs',status:'timedOut'})}`;
 const out=await ciInfrastructure(async(p,logs)=>logs?log:({...job,steps:[{name:'Verify CI configuration',status:'completed',conclusion:'success'},{name:'Verify pinned Playwright environment',status:'completed',conclusion:'success'},{name:'Run browser tests',status:'completed',conclusion:'failure'}]}),response,sha);
 assert.equal(out.failureKind,'test');assert.equal(out.jobs[0].failedStep,'Run browser tests');assert.match(out.jobs[0].stage,/Kiểm thử giao diện/);
});
