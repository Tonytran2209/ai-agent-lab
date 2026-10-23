import {test} from 'node:test';import assert from 'node:assert/strict';
import {startMonitor} from '../mac/monitor.js';
import {codexModelArgs} from '../mac/codex.js';
import {workflowMessage,taskProgress} from '../src/workflow.js';
import {hasBehavioralTest} from '../server/impact.js';
test('CI monitor progresses independently, coalesces polls, survives failures and drains before stop',async()=>{
 let finish,count=0;const first=new Promise(r=>{finish=r;});
 const monitor=startMonitor(async()=>{count++;if(count===1)await first;},{intervalMs:100000});
 const a=monitor.tick(),b=monitor.tick();assert.equal(a,b);
 await Promise.resolve();assert.equal(count,1);
 // A coding lane can stay blocked while the separate monitor completes cycles.
 let codingDone=false;const coding=new Promise(r=>{setTimeout(()=>{codingDone=true;r();},20);});
 finish();await a;await monitor.tick();assert.equal(count,2);assert.equal(codingDone,false);
 await monitor.stop();await monitor.tick();assert.equal(count,2);await coding;
 let errors=0;const failed=startMonitor(async()=>{throw Error('network');},{onError:()=>errors++,intervalMs:100000});
 await failed.tick();await failed.tick();assert.equal(errors,2);await failed.stop();
});
test('Mac and cloud model arguments are explicit and independent of user config',()=>{
 assert.deepEqual(codexModelArgs({},'planning'),['--model','gpt-6.1-sol']);
 assert.deepEqual(codexModelArgs({codexModel:'gpt-6.1-sol',planningModel:'gpt-6-luna'},'planning'),['--model','gpt-6-luna']);
 assert.deepEqual(codexModelArgs({executionModel:'gpt-6.1-sol'},'execution'),['--model','gpt-6.1-sol']);
 assert.throws(()=>codexModelArgs({codexModel:'x --yolo'},'execution'));
 assert.deepEqual(codexModelArgs({planningModel:'local-model'},'planning',{mainModel:'selected-model'}),['--model','selected-model']);
 assert.deepEqual(codexModelArgs({},'execution',{mainModel:'selected-model'}),['--model','selected-model']);
 assert.throws(()=>codexModelArgs({},'execution',{mainModel:'x --yolo'}));
});
test('medium accepts safe quoted alternatives but rejects shell pipelines; UI distinguishes CI pass from criterion reconciliation',()=>{
 const command="node node_modules/@playwright/test/cli.js test tests/browser/draft.spec.ts --grep 'qc-one|qc-two'";
 const verification={method:'test',command,files:['tests/browser/draft.spec.ts']};
 assert.equal(hasBehavioralTest({verification}),true);
 assert.equal(hasBehavioralTest({verification:{...verification,command:command+' | echo pass'}}),false);
 const r={status:'verifying',result:{},verification:{phase:'passed'},criterionCiStatus:'CI đã đạt; đang đối chiếu từng tiêu chí.'};
 assert.equal(workflowMessage(r),r.criterionCiStatus);assert.equal(taskProgress(r).message,r.criterionCiStatus);
});
