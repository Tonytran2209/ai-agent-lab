import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import crypto from 'node:crypto';
import {openDatabase} from '../server/db.js';import {createRunnerControl} from '../server/runner-control.js';import {idleRestart,loginState,restartDelay} from '../mac/supervisor.js';
test('durable remote control is bound to registered Mac, deduplicated, expiring and limited to fixed actions',()=>{
 const dir=mkdtempSync('/tmp/lab-control-'),db=openDatabase(dir),workerId=crypto.randomUUID(),other=crypto.randomUUID();try{
 let c=createRunnerControl(db,{});assert.throws(()=>c.queue('restart','Admin'));c.heartbeat({workerId,controlProtocol:'runner-control-v1'});
 assert.throws(()=>c.queue('run shell','Admin'));const job=c.queue('restart','Admin');assert.equal(c.queue('restart','Admin').id,job.id);assert.throws(()=>c.queue('reconnect','Admin'));assert.equal(c.next(other),null);assert.throws(()=>c.claim(job.id,other));
 c=createRunnerControl(db,{});assert.equal(c.next(workerId).id,job.id);c.claim(job.id,workerId);assert.throws(()=>c.finish(job.id,other,'completed','Wrong Mac'));
 const done=c.finish(job.id,workerId,'completed','New runner connected');assert.equal(done.phase,'completed');assert.equal(c.finish(job.id,workerId,'completed','Retry after lost response').note,done.note);assert.equal(c.next(workerId),null);
 const expired=c.queue('reconnect','Admin');expired.expiresAt=new Date(0).toISOString();db.prepare('UPDATE runner_controls SET data=? WHERE id=?').run(JSON.stringify(expired),expired.id);assert.equal(c.next(workerId),null);assert.equal(c.list()[0].phase,'expired');assert.throws(()=>c.claim(expired.id,workerId));
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('watchdog never treats busy/unknown state as idle and distinguishes auth from infrastructure without a model call',()=>{
 assert.equal(idleRestart({safeIdle:false}),false);assert.equal(idleRestart({phase:'idle'}),false);assert.equal(idleRestart({safeIdle:true}),true);
 assert.equal(loginState({code:0,stdout:'Logged in',stderr:''}),'ready');assert.equal(loginState({code:1,stdout:'Not logged in',stderr:''}),'login-required');assert.equal(loginState({code:1,stdout:'',stderr:'network timeout'}),'unavailable');
 const now=Date.now();assert.ok(restartDelay([now-1000,now-500,now],now)>9*60000);assert.ok(restartDelay([now-11*60000],now)<30000);
});

test('control APIs require admin session and CSRF; worker bearer can only poll fixed commands',async()=>{
 const {createApp}=await import('../server/index.js');const dir=mkdtempSync('/tmp/lab-control-http-'),config={DATA_DIR:dir,ADMIN_PASSWORD:'admin-'.repeat(6),USER_PASSWORD:'member-'.repeat(6),SESSION_SECRET:'session-'.repeat(6),MCP_TOKEN:'mcp-'.repeat(10)};const {app,db}=createApp(config),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const root='http://127.0.0.1:'+server.address().port;
 try{const login=async password=>{const res=await fetch(root+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Test',password})});return {Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':(await res.json()).user.csrf,'Content-Type':'application/json'};};
 const member=await login(config.USER_PASSWORD),admin=await login(config.ADMIN_PASSWORD),workerId=crypto.randomUUID();
 const post=(url,headers,body)=>fetch(root+url,{method:'POST',headers,body:JSON.stringify(body)});
 assert.equal((await post('/api/settings/runner-control',member,{action:'restart'})).status,403);
 assert.equal((await post('/api/settings/runner-control',{Authorization:'Bearer '+config.MCP_TOKEN,'Content-Type':'application/json'},{action:'restart'})).status,401);
 assert.equal((await post('/api/settings/runner-control',{Cookie:admin.Cookie,'Content-Type':'application/json'},{action:'restart'})).status,403);
 const worker={Authorization:'Bearer '+config.MCP_TOKEN,'Content-Type':'application/json'};
 assert.equal((await post('/runner/control/heartbeat',worker,{workerId,controlProtocol:'runner-control-v1',version:'test',bootAt:new Date().toISOString(),state:'idle',childSeenAt:null,codex:{state:'unknown',checkedAt:null}})).status,200);
 assert.equal((await post('/api/settings/runner-control',admin,{action:'restart',shell:'anything'})).status,400);
 assert.equal((await post('/api/settings/runner-control',admin,{action:'restart'})).status,200);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});

test('CI/deploy monitor stays busy until its active work drains before restart can be considered idle',async()=>{
 const {startMonitor}=await import('../mac/monitor.js');let resolve;const state=[];const monitor=startMonitor(()=>new Promise(r=>{resolve=r;}),{intervalMs:100000,onState:v=>state.push(v)});
 const run=monitor.tick();await Promise.resolve();await Promise.resolve();assert.equal(monitor.isBusy(),true);assert.deepEqual(state,[true]);const stopped=monitor.stop();assert.equal(monitor.isBusy(),true);resolve();await run;await stopped;assert.equal(monitor.isBusy(),false);assert.deepEqual(state,[true,false]);
});
