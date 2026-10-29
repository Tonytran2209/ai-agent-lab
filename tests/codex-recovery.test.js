import {test} from 'node:test';import assert from 'node:assert/strict';
import {startupFailure,runCodexWithRecovery,codexFailureMessage} from '../mac/codex-recovery.js';
const failed={code:1,stdout:'',stderr:'failed to initialize in-process app-server client: Operation not permitted'};
test('only transient startup failures before model/tool activity can reconnect',()=>{
 assert.equal(startupFailure(failed),true);
 for(const r of [{...failed,code:0},{...failed,signal:'SIGTERM'},{...failed,stderr:'401 unauthorized'},{...failed,stderr:'schema invalid'},{...failed,stderr:'permission denied opening source'},{...failed,stdout:'{"type":"turn.started"}\n'},{...failed,stdout:'{"type":"item.completed"}\n'},{...failed,stdout:'model response'}])assert.equal(startupFailure(r),false);
 assert.equal(startupFailure({...failed,stderr:'network connection reset'}),true);
 assert.match(codexFailureMessage({...failed,stderr:'unrecognized option'}),/Không mặc định/);
});
test('startup reconnect checks login, unchanged checkout, keeps same arguments and retries only once',async()=>{
 const calls=[],order=[];const args=['exec','--json','--sandbox','read-only'],options={cwd:'/repo',input:'original feedback'};
 const run=async(exe,a,o)=>{calls.push({exe,a,o});return a[0]==='login'?{code:0}:failed;};
 const result=await runCodexWithRecovery(run,'codex',args,options,{beforeRetry:async()=>order.push('scope'),onRetry:async()=>order.push('notice'),wait:async()=>order.push('wait')});
 assert.equal(result,failed);assert.equal(calls.length,3);assert.deepEqual(calls[1].a,['login','status']);assert.equal(calls[2].a,args);assert.equal(calls[2].o,options);assert.deepEqual(order,['scope','notice','wait']);
});
test('authentication failure, changed checkout and cancellation never retry a model',async()=>{
 let calls=0;await runCodexWithRecovery(async(_,args)=>{calls++;return args[0]==='login'?{code:1}:failed;},'codex',['exec','--json'],{});assert.equal(calls,2);
 calls=0;await assert.rejects(()=>runCodexWithRecovery(async(_,args)=>{calls++;return args[0]==='login'?{code:0}:failed;},'codex',['exec','--json'],{},{beforeRetry:async()=>{throw Error('dirty');}}),/dirty/);assert.equal(calls,2);
 calls=0;const c=new AbortController();c.abort();await runCodexWithRecovery(async()=>{calls++;return failed;},'codex',['exec','--json'],{signal:c.signal});assert.equal(calls,1);
});

test('execution must opt into JSON and streamed activity cannot be lost by stdout truncation',async()=>{
 for(const event of ['{"type":"turn.started"}\n','{"type":"item.started","item":{"type":"command_execution"}}\n']){let calls=0;await runCodexWithRecovery(async(_,a,o)=>{calls++;o.onStdout?.(event);return {...failed,stderr:'stream disconnected',stdout:''};},'codex',['exec','--json'],{});assert.equal(calls,1);}
 let calls=0;await runCodexWithRecovery(async()=>{calls++;return failed;},'codex',['exec'],{});assert.equal(calls,1);
});
