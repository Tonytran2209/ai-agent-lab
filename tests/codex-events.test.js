import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codexEvents} from '../mac/codex-events.js';
import {taskProgress} from '../src/workflow.js';

test('Codex progress handles fragmented JSON without retaining model/tool contents',()=>{
 let now=Date.parse('2026-10-26T02:00:00Z');const p=codexEvents(()=>now);
 p.push('{"type":"turn.sta');p.push('rted"}\ninvalid\n');
 now+=1000;p.push(JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'SECRET_SENTINEL'}})+'\n');
 assert.deepEqual(p.snapshot(),{elapsedSeconds:1,events:2,lastEventAt:'2026-10-26T02:00:01.000Z',stage:'reading-source'});
 assert.ok(!JSON.stringify(p.snapshot()).includes('SECRET_SENTINEL'));
 p.push('{"type":"turn.completed"}\n');assert.equal(p.snapshot().stage,'completed');
});
test('live runner heartbeat cannot disguise silent Codex as source activity',()=>{
 const r={status:'feedback',preparation:{engine:'codex-local',status:'running'},planning:{lease:{expiresAt:new Date(Date.now()+600000).toISOString()},progress:{elapsedSeconds:300,lastEventAt:new Date(Date.now()-240000).toISOString(),stage:'waiting-model'}}};
 assert.equal(taskProgress(r).title,'Đang chờ phản hồi từ Codex');
 r.planning.progress.lastEventAt=new Date().toISOString();assert.equal(taskProgress(r).title,'Codex đang khảo sát');
 delete r.planning.progress;assert.equal(taskProgress(r).title,'Codex đang khảo sát');
});
