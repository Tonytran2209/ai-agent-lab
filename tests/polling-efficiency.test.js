import test from 'node:test';import assert from 'node:assert/strict';
import {startPolling,loadRequestIndex} from '../src/polling.js';
import {readMonitorQueues,runnerPollDelay} from '../mac/queue-polling.js';
import {requestIndexRows,requestIndexPage} from '../server/request-index.js';
import {DatabaseSync} from 'node:sqlite';
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function clock(){let id=0;const scheduled=new Map();return {scheduled,setTimeout(fn,ms){scheduled.set(++id,{fn,ms});return id;},clearTimeout(id){scheduled.delete(id);},async fire(){const [id,{fn}]=scheduled.entries().next().value;scheduled.delete(id);fn();await settle();}};}
function visibility(){const handlers=new Set();return {hidden:false,addEventListener(_,fn){handlers.add(fn);},removeEventListener(_,fn){handlers.delete(fn);},change(hidden){this.hidden=hidden;for(const fn of handlers)fn();}};}
test('browser polling coalesces slow calls, suspends hidden tabs, resumes once and stops',async()=>{
 const timers=clock(),doc=visibility();let count=0,resolve;
 const p=startPolling(async()=>{count++;if(count===1)await new Promise(r=>resolve=r);},{document:doc,timers,interval:()=>15000});await settle();
 p.tick();p.tick();assert.equal(count,1);doc.change(true);resolve();await settle();assert.equal(timers.scheduled.size,0);
 doc.change(false);await settle();assert.equal(count,2);assert.equal(timers.scheduled.size,1);p.stop();doc.change(false);assert.equal(timers.scheduled.size,0);assert.equal(count,2);
});
test('failed polling retries soon, then uses bounded backoff and a successful call restores normal cadence',async()=>{
 const timers=clock(),doc=visibility();let fails=true;const p=startPolling(async()=>{if(fails)throw Error('offline');},{document:doc,timers,interval:()=>30000});await settle();
 const next=()=>[...timers.scheduled.values()][0].ms;assert.equal(next(),3000);await timers.fire();assert.equal(next(),10000);await timers.fire();assert.equal(next(),60000);await timers.fire();assert.equal(next(),120000);await timers.fire();assert.equal(next(),120000);fails=false;await timers.fire();assert.equal([...timers.scheduled.values()][0].ms,30000);p.stop();
});
test('idle browser request budget falls and all paginated history remains searchable',async()=>{
 const timers=clock(),doc=visibility();let count=0;const p=startPolling(async()=>{count+=3;},{document:doc,timers,interval:()=>30000});await settle();for(let i=0;i<9;i++)await timers.fire();p.stop();
 assert.equal(count,30);assert.ok(count<4*60); // Old four-endpoint refresh: 240 calls in five minutes.
 const urls=[];const rows=await loadRequestIndex(async url=>{urls.push(url);return urls.length===1?{requests:[{id:'new'}],nextBefore:12}:{requests:[{id:'old'}],nextBefore:null};},true);assert.deepEqual(rows.map(r=>r.id),['new','old']);assert.match(urls[1],/before=12/);
});
test('runner reads global monitor queues once, preserves explicit failures and idle cadence',async()=>{
 const urls=[];const q=await readMonitorQueues({mcpUrl:'https://lab.test/mcp'},'private',new AbortController().signal,async url=>{urls.push(url.pathname);return {ok:true,json:async()=>({requests:[{id:url.pathname}]})};});
 assert.deepEqual(urls,['/runner/verifications','/runner/releases']);assert.equal(q.releases.length,1);
 await assert.rejects(()=>readMonitorQueues({mcpUrl:'https://lab.test/mcp'},'private',null,async()=>({ok:false,status:503})),/503/);
 assert.equal(runnerPollDelay({}),60000);assert.equal(runnerPollDelay({},{active:true}),15000);assert.equal(runnerPollDelay({},{failures:10}),120000);
});
test('summary projection pages all history, isolates members and strips large/private evidence',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE requests(id TEXT PRIMARY KEY,data TEXT NOT NULL)');let bytes=0;
 for(let i=0;i<5;i++){const r={id:'REQ-'+i,author:i===1?'Bob':'Alice',status:'failed',title:'Full searchable title '+i,feedback:'Feedback '+i,updatedAt:'2026-11-04T00:00:00Z',draft:{risk:'medium',allowedPaths:['source'],problem:'evidence'.repeat(20000)},result:{commit:'a'.repeat(40),summary:'private-evidence'},lease:{expiresAt:'2026-11-05T00:00:00Z',tokenHash:'secret'},approval:{requestHash:'consent'},archivedAt:i===3?'2026-11-04':null};const data=JSON.stringify(r);bytes+=data.length;db.prepare('INSERT INTO requests VALUES(?,?)').run(r.id,data);}
 const rows=requestIndexRows(db),first=requestIndexPage(rows,{role:'admin',name:'Admin'},{limit:2,includeArchived:true}),second=requestIndexPage(rows,{role:'admin',name:'Admin'},{limit:3,before:first.nextBefore,includeArchived:true});
 assert.equal(new Set([...first.requests,...second.requests].map(r=>r.id)).size,5);assert.equal(first.total,5);
 const member=requestIndexPage(rows,{role:'member',name:'Alice'},{includeArchived:true});assert.equal(member.total,3);assert.ok(member.requests.every(r=>r.author==='Alice'&&!r.archivedAt));
 assert.ok(!JSON.stringify(rows).includes('secret'));assert.ok(!JSON.stringify(rows).includes('private-evidence'));assert.equal(rows[0].request.draft.risk,'medium');assert.equal(rows[0].request.lease.expiresAt,'2026-11-05T00:00:00Z');assert.ok(JSON.stringify(rows).length<bytes/20);db.close();
});
test('one unavailable monitor queue does not starve the other independent lane',async()=>{
 const q=await readMonitorQueues({mcpUrl:'https://lab.test/mcp'},'private',null,async url=>url.pathname.endsWith('verifications')?{ok:false,status:503}:{ok:true,json:async()=>({requests:[{id:'release'}]})});assert.equal(q.failed,true);assert.equal(q.releases[0].id,'release');
});
test('summary HTTP contract, consent-free reads and immutable library cache stay compatible',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const os=await import('node:os');const path=await import('node:path');const {openDatabase}=await import('../server/db.js');const {createApp}=await import('../server/index.js');
 const dir=mkdtempSync(path.join(os.tmpdir(),'lab-index-')),db=openDatabase(dir);const config={NODE_ENV:'test',ADMIN_PASSWORD:'admin-polling-123456789012345',SESSION_SECRET:'session-polling-123456789012345',MCP_TOKEN:'mcp-polling-123456789012345'};const f=createApp(config,{db,serializeProjects:true});const server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  f.service.create({feedback:'Improve the visible button label on this page.'},'Admin');
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Admin',password:config.ADMIN_PASSWORD})});assert.equal(login.status,200);const headers={Cookie:login.headers.get('set-cookie').split(';')[0]};
  const response=await fetch(base+'/api/requests?summary=true&limit=1',{headers});assert.equal(response.status,200);const page=await response.json();assert.equal(page.requests.length,1);assert.ok(page.requests[0].projectQueue);assert.equal(page.total,1);
  const legacy=await fetch(base+'/api/requests',{headers});assert.equal((await legacy.json()).requests.length,1);
  assert.equal((await fetch(base+'/api/requests?summary=true&limit=9999',{headers})).status,400);
  const lib=await fetch(base+'/api/library',{headers});assert.equal(lib.status,200);assert.ok(lib.headers.get('etag'));const original=await lib.json();
  const cached=f.service.library(original.id);cached.documents[0].content='mutated';assert.notEqual(f.service.library(original.id).documents[0].content,'mutated');
  assert.equal((await fetch(base+'/api/library',{headers:{...headers,'If-None-Match':lib.headers.get('etag'),'Cache-Control':'max-age=0'}})).status,304);
 }finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});
