import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,mkdirSync,utimesSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runnerConnected,withErrorSince,runnerErrorGraceMs,runnerStaleMs} from '../server/runner-presence.js';
import {createHeartbeatGuard,heartbeatRejected} from '../mac/heartbeat-guard.js';
import {acquireRunnerLock} from '../mac/runner-lock.js';
import {openDatabase} from '../server/db.js';
import {createService} from '../server/service.js';

test('a brief runner loop error stays connected; a persistent error or stale heartbeat disconnects',()=>{
  const t=Date.parse('2026-11-06T10:00:00Z'),iso=ms=>new Date(ms).toISOString();
  assert.equal(runnerConnected({phase:'idle',lastSeenAt:iso(t)},t+1000),true);
  assert.equal(runnerConnected({phase:'idle',lastSeenAt:iso(t)},t+runnerStaleMs),false);
  const error=withErrorSince({phase:'error',lastSeenAt:iso(t)},{phase:'idle'},t);
  assert.equal(error.errorSince,iso(t));
  assert.equal(runnerConnected(error,t+30000),true);
  const persisted=withErrorSince({phase:'error',lastSeenAt:iso(t+90000)},error,t+90000);
  assert.equal(persisted.errorSince,iso(t),'errorSince is kept while the error continues');
  assert.equal(runnerConnected(persisted,t+runnerErrorGraceMs),false);
  assert.equal(withErrorSince({phase:'idle',lastSeenAt:iso(t)},persisted,t).errorSince,undefined);
  assert.equal(runnerConnected(null),false);
});

test('service status uses the grace period for runner errors',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'lab-runner-presence-')),db=openDatabase(dir);
  try{
    const s=createService(db);
    s.reportRunner({phase:'idle',projects:[]});
    s.reportRunner({phase:'error',requestId:null});
    assert.equal(s.runnerStatus().connected,true,'one failed poll must not show the Mac as disconnected');
    const stored=JSON.parse(db.prepare("SELECT value FROM settings WHERE key='mac_runner'").get().value);
    stored.errorSince=new Date(Date.now()-runnerErrorGraceMs-1000).toISOString();
    db.prepare("UPDATE settings SET value=? WHERE key='mac_runner'").run(JSON.stringify(stored));
    assert.equal(s.runnerStatus().connected,false);
    s.reportRunner({phase:'idle'});
    assert.equal(s.runnerStatus().connected,true);
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('claim heartbeats tolerate transient misses but stop at once on a rejected claim',()=>{
  let lost=0;const guard=createHeartbeatGuard(()=>lost++);
  assert.equal(guard.fail(new Error('fetch failed')),false);
  assert.equal(guard.fail(new Error('Planning API HTTP 503')),false);
  guard.ok();
  assert.equal(guard.fail(new Error('Recheck API HTTP 429')),false);
  assert.equal(guard.fail(new Error('The operation was aborted due to timeout')),false);
  assert.equal(guard.fail(new Error('CI setup API: 502')),true,'third consecutive transient miss aborts');
  assert.equal(lost,1);
  assert.equal(guard.fail(new Error('again')),true);assert.equal(lost,1,'abort fires once');
  let rejected=0;const strict=createHeartbeatGuard(()=>rejected++);
  assert.equal(strict.fail(new Error('CI repair API 409')),true);assert.equal(rejected,1);
  assert.equal(heartbeatRejected(Object.assign(new Error('Claim đã hết hạn'),{mcpRejected:true})),true);
  assert.equal(heartbeatRejected(new Error('Recheck API HTTP 408')),false);
});

test('runner lock from before the last boot is cleared; a live-boot lock is kept',async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'lab-runner-lock-'));
  try{
    const lock=path.join(dir,'runner.lock');mkdirSync(lock);
    const now=Date.now(),old=(now-2*3600000)/1000;utimesSync(lock,old,old);
    await assert.rejects(acquireRunnerLock(dir,{pid:11,now,uptimeSeconds:3*3600}),{code:'EEXIST'},'no reboot since the lock: keep it for inspection');
    const messages=[];await acquireRunnerLock(dir,{pid:22,now,uptimeSeconds:3600,log:m=>messages.push(m)});
    assert.equal(readFileSync(path.join(lock,'pid'),'utf8'),'22');
    assert.equal(messages.length,1);
    await assert.rejects(acquireRunnerLock(dir,{pid:33,now,uptimeSeconds:3600}),{code:'EEXIST'},'a lock created this boot is never cleared');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
