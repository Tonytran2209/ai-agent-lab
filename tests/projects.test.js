import {test} from 'node:test'; import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {openDatabase} from '../server/db.js'; import {createService,hash} from '../server/service.js'; import {createApp} from '../server/index.js';
import {parseProjectContract,readRepositoryLibrary,canonicalDocuments} from '../server/library.js';
import {createKnowledge} from '../server/knowledge.js';
import {projectConfig,matchesProject,connectProjects} from '../mac/projects.js'; import {safePacket,repositoryMatches} from '../mac/runner.js';
import {pollVerifications} from '../mac/verify.js'; import {pollReleases} from '../mac/release.js';
const seed=JSON.parse(readFileSync(new URL('../library/intercom-writer-studio.json',import.meta.url),'utf8'));
const plan={title:'Đổi giao diện Draft',problem:'Chỉ thay phần hiển thị của bài viết.',layer:'design',module:'Draft',allowedPaths:['src/components/workspace/Step4Draft.tsx'],acceptanceCriteria:['Nội dung hiển thị đúng.'],assumptions:[],questions:[],risk:'low',migrationNotes:''};
function fixture(){const dir=mkdtempSync(path.join(os.tmpdir(),'lab-projects-'));const db=openDatabase(dir),service=createService(db);return{dir,db,service,close(){db.close();rmSync(dir,{recursive:true,force:true});}};}
function approve(s,projectId){const r=s.create({projectId,feedback:'Thay giao diện Draft cho rõ ràng hơn'},'Member');s.edit(r.id,plan,'Admin');return s.approve(r.id,'Admin');}
test('registry migrates legacy requests, preserves pinned packets and isolates libraries across restart',()=>{
 const f=fixture();try{const s=f.service,old=approve(s,'writer-studio'),packet=s.packet(old.id),intercom=s.currentLibrary('intercom-writer-studio');assert.equal(s.projects().length,2);assert.notEqual(packet.library.id,intercom.id);
 const added=s.addLibrary({...intercom,sourceCommit:'b'.repeat(40),documents:intercom.documents.map(d=>({...d,content:d.content+'\nnew'}))});assert.equal(s.currentLibrary().id,packet.library.id);assert.equal(s.currentLibrary(intercom.projectId).id,added.id);assert.deepEqual(s.packet(old.id),packet);
 const restarted=createService(f.db);assert.equal(restarted.currentLibrary(intercom.projectId).id,added.id);assert.deepEqual(restarted.packet(old.id),packet);assert.throws(()=>s.create({projectId:'unknown-project',feedback:'Một feedback đủ dài'},'M'));
 }finally{f.close();}
});
test('same file paths can be claimed in different repos; disabled project blocks new feedback/claims',()=>{
 const f=fixture();try{const a=approve(f.service,'writer-studio'),b=approve(f.service,'intercom-writer-studio');assert.ok(f.service.claim(a.id,'Mac A',a.baseCommit).claimToken);assert.ok(f.service.claim(b.id,'Mac B',b.baseCommit).claimToken);
 const c=approve(f.service,'intercom-writer-studio');f.service.updateProject(c.projectId,{enabled:false});assert.ok(!f.service.ready().some(r=>r.id===c.id));assert.throws(()=>f.service.claim(c.id,'Mac',c.baseCommit),/tạm dừng/);assert.throws(()=>f.service.create({projectId:c.projectId,feedback:'Một feedback đủ dài'},'M'),/tạm dừng/);
 }finally{f.close();}
});
test('learning and plan identities do not leak between repos; rebase follows own project',()=>{
 const f=fixture();try{const a=approve(f.service,'writer-studio'),b=f.service.create({projectId:'intercom-writer-studio',feedback:a.feedback},'Member');const data=JSON.parse(f.db.prepare('SELECT data FROM requests WHERE id=?').get(a.id).data);data.status='completed';f.db.prepare('UPDATE requests SET data=? WHERE id=?').run(JSON.stringify(data),a.id);assert.deepEqual(f.service.learningExamples(b),[]);
 const lib=f.service.addLibrary({...f.service.currentLibrary(b.projectId),sourceCommit:'c'.repeat(40)});assert.equal(f.service.rebase(b.id,'Admin').baseCommit,lib.sourceCommit);assert.equal(f.service.get(a.id).baseCommit,a.baseCommit);
 assert.throws(()=>f.service.addLibrary({...lib,repository:'Other/wrong-repo'}),/khác/);
 }finally{f.close();}
});
test('contract parser supports both standard libraries and rejects mismatched identity',()=>{
 assert.equal(parseProjectContract(seed.documents.find(d=>d.path==='.agent-hub/project.md').content,seed.repository).projectId,seed.projectId);assert.equal(parseProjectContract('# Example\nprojectId: example-project\nrepository: owner/repo','owner/repo').projectId,'example-project');assert.throws(()=>parseProjectContract('# Bad\nprojectId: bad-project','owner/repo'));
});
test('library loader pins every document to commit, validates completeness, and never reads arbitrary hosts',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async url=>{calls.push(String(url));const tail=String(url).split('/'+seed.repository+'/')[1];if(tail.startsWith('commits/'))return{ok:true,json:async()=>({sha:seed.sourceCommit})};if(tail.startsWith('git/trees/'))return{ok:true,json:async()=>({truncated:false,tree:seed.sourcePaths.map(path=>({path,type:'blob'}))})};const doc=seed.documents.find(d=>tail.startsWith('contents/'+d.path+'?'));return{ok:true,json:async()=>({type:'file',encoding:'base64',size:doc.content.length,content:Buffer.from(doc.content).toString('base64')})};});
 const lib=await readRepositoryLibrary(seed.repository,'main');assert.equal(lib.documents.length,11);assert.ok(calls.filter(p=>p.includes('/contents/')).every(p=>p.endsWith('?ref='+seed.sourceCommit)));await assert.rejects(readRepositoryLibrary('https://evil.test/repo','main'));
});
test('runner configuration and packets reject cross-project routing before editing',()=>{
 const f=fixture();try{const r=approve(f.service,seed.projectId),packet=f.service.packet(r.id),cfg=projectConfig({stateDir:'/safe/state',repoPath:'/safe/legacy',releaseEnabled:true},f.service.project(seed.projectId));assert.equal(cfg.repository,seed.repository);assert.equal(cfg.releaseEnabled,false);assert.ok(cfg.repoPath.startsWith('/safe/state/projects/intercom-writer-studio/'));assert.equal(safePacket(packet,cfg.repository,cfg.projectId).id,r.id);assert.throws(()=>safePacket(packet,'Tonytran2209/RebuildWriterStudioTool','writer-studio'));assert.throws(()=>safePacket({...packet,library:f.service.currentLibrary()},cfg.repository,cfg.projectId));assert.equal(repositoryMatches('https://github.com/'+seed.repository+'.git',seed.repository),true);assert.equal(matchesProject(r,{repository:'Other/repo'}),false);assert.throws(()=>projectConfig({stateDir:'/safe'}, {id:'../../evil',repository:seed.repository}));
 }finally{f.close();}
});
test('verification/release workers skip other projects before obtaining any lease',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push(String(url));return {ok:true,json:async()=>({requests:[{id:'REQ-ABCDEF12',repository:'Other/repo',projectId:'other-project'}]})};});const config={mcpUrl:'https://lab.example/mcp',repository:seed.repository,projectId:seed.projectId,releaseEnabled:true};await pollVerifications(config,'mock',()=>{throw new Error('must not run');});await pollReleases(config,'mock',()=>{throw new Error('must not run');});assert.equal(calls.length,2);assert.ok(calls.every(p=>!p.includes('/claim')));
});
test('project endpoints require admin mutations and expose project-scoped library to members',async()=>{
 const f=fixture(),config={MD_TRACEABILITY_ENABLED:"false",ADMIN_PASSWORD:'admin-password-long-test-only-123',USER_PASSWORD:'user-password-long-test-only-123',SESSION_SECRET:'session-long-secret-test-123456789',MCP_TOKEN:'mcp-long-secret-test-123456789',NODE_ENV:'test'};const {app}=createApp(config,{db:f.db});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{const login=async password=>{const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Member',password})});const body=await r.json();return{Cookie:r.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json','X-CSRF-Token':body.user.csrf};};const member=await login(config.USER_PASSWORD),admin=await login(config.ADMIN_PASSWORD);
 const runtime=await(await fetch(base+'/api/config',{headers:admin})).json();assert.equal(runtime.workflow.mode,'direct-v1');assert.equal(runtime.workflow.serializedProjects,true);assert.equal(runtime.classifier.enabled,false);assert.equal(runtime.classifier.configured,false);
 assert.equal((await fetch(base+'/api/projects',{headers:member})).status,200);assert.equal((await fetch(base+'/api/projects',{method:'POST',headers:member,body:JSON.stringify({repository:seed.repository})})).status,403);assert.equal((await fetch(base+'/api/projects/'+seed.projectId,{method:'PATCH',headers:member,body:'{"runnerEnabled":false}'})).status,403);
 assert.equal((await fetch(base+'/api/projects/'+seed.projectId,{method:'PATCH',headers:admin,body:'{"releaseEnabled":true}'})).status,400);
 const lib=await(await fetch(base+'/api/library?projectId='+seed.projectId,{headers:member})).json();assert.equal(lib.repository,seed.repository);
 const res=await fetch(base+'/api/requests',{method:'POST',headers:member,body:JSON.stringify({projectId:seed.projectId,feedback:'Một feedback Intercom đủ dài'})});assert.equal((await res.json()).repository,seed.repository);
 }finally{await new Promise(resolve=>server.close(resolve));f.close();}
});
test('admin registers a third canonical repo without overwriting other projects and enables Mac separately',async t=>{
 const f=fixture(),config={MD_TRACEABILITY_ENABLED:"false",ADMIN_PASSWORD:'admin-test-password-1234567890',USER_PASSWORD:'member-test-password-1234567890',SESSION_SECRET:'session-test-password-1234567890',MCP_TOKEN:'mcp-test-password-1234567890',NODE_ENV:'test'};
 const {app}=createApp(config,{db:f.db});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port,original=globalThis.fetch;
 const docs=seed.documents.map(d=>({...d,content:d.path==='.agent-hub/project.md'?'# Third Studio\nprojectId: third-studio\nrepository: Team/third-studio':d.content}));let reads=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
 if(!String(url).startsWith('https://api.github.com/repos/'))return original(url,options);reads++;const suffix=String(url).split('/Team/third-studio/')[1];if(suffix==='')return{ok:true,json:async()=>({default_branch:'develop'})};if(suffix.startsWith('commits/'))return{ok:true,json:async()=>({sha:'d'.repeat(40)})};if(suffix.startsWith('git/trees/'))return{ok:true,json:async()=>({tree:seed.sourcePaths.map(path=>({type:'blob',path})),truncated:false})};const doc=docs.find(d=>suffix.startsWith('contents/'+d.path+'?'));return{ok:true,json:async()=>({type:'file',encoding:'base64',size:doc.content.length,content:Buffer.from(doc.content).toString('base64')})};});
 try{const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Admin',password:config.ADMIN_PASSWORD})});const body=await login.json(),headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':body.user.csrf};
 const r=await fetch(base+'/api/projects',{method:'POST',headers,body:JSON.stringify({repository:'Team/third-studio',runnerEnabled:true})});assert.equal(r.status,201);const project=await r.json();assert.equal(project.id,'third-studio');assert.equal(project.branch,'develop');assert.equal(project.runnerEnabled,true);assert.equal(project.releaseEnabled,false);assert.equal(f.service.projects().length,3);assert.equal(f.service.currentLibrary().projectId,'writer-studio');
 const before=reads;assert.equal((await fetch(base+'/api/projects',{method:'POST',headers,body:JSON.stringify({repository:'Team/third-studio'})})).status,400);assert.equal(reads,before);
 }finally{await new Promise(resolve=>server.close(resolve));f.close();}
});
test('legacy database without registry retains old library and approval identities',()=>{
 const f=fixture();try{const s=f.service,r=approve(s,'writer-studio'),before=s.packet(r.id);f.db.exec('DROP TABLE projects');const restarted=createService(f.db);assert.deepEqual(restarted.packet(r.id),before);assert.equal(restarted.currentLibrary().id,before.library.id);assert.ok(restarted.claim(r.id,'Mac',r.baseCommit).claimToken);}finally{f.close();}
});
test('acceptance on a new project does not implicitly enable release',()=>{
 const f=fixture();try{const s=f.service,r=approve(s,seed.projectId),claim=s.claim(r.id,'Mac',r.baseCommit);s.complete(r.id,claim.claimToken,{summary:'Đã kiểm tra kết quả trong môi trường thử nghiệm.',changedPaths:plan.allowedPaths,commit:'e'.repeat(40),localArtifact:{branch:'lab/'+r.id+'-123'},checks:[{command:'npm run check',passed:true,output:'passed'}]});const done=s.accept(r.id,'Admin');assert.equal(done.status,'completed');assert.equal(done.release,undefined);assert.throws(()=>s.publish(r.id,'Admin'),/chưa bật/);s.updateProject(r.projectId,{releaseEnvironment:'intercom / production',releaseEnabled:true});assert.equal(s.publish(r.id,'Admin').release.phase,'queued');}finally{f.close();}
});

test('same-commit legacy library gets CI metadata once without changing its immutable old snapshot',async t=>{
 const f=fixture(),calls=[];
 t.mock.method(globalThis,'fetch',async url=>{calls.push(String(url));const tail=String(url).split('/'+seed.repository+'/')[1];if(tail.startsWith('commits/'))return{ok:true,json:async()=>({sha:seed.sourceCommit})};if(tail.startsWith('git/trees/'))return{ok:true,json:async()=>({truncated:false,tree:seed.sourcePaths.map(path=>({path,type:'blob'}))})};const doc=seed.documents.find(d=>tail.startsWith('contents/'+d.path+'?'));return{ok:true,json:async()=>({type:'file',encoding:'base64',size:doc.content.length,content:Buffer.from(doc.content).toString('base64')})};});
 try{const old=f.service.currentLibrary(seed.projectId),updated=await readRepositoryLibrary(seed.repository,'main',undefined,old);assert.equal(updated.ciInspectionVersion,1);assert.ok(calls.length>1);const saved=f.service.addLibrary(updated);assert.notEqual(saved.id,old.id);assert.equal(f.service.library(old.id).ciInspectionVersion,undefined);calls.length=0;assert.equal(await readRepositoryLibrary(seed.repository,'main',undefined,saved),saved);assert.equal(calls.length,1);}finally{f.close();}
});

test('same-commit sync adds optional canonical user guide without mutating pinned requests or importing arbitrary docs',async t=>{
 const f=fixture(),calls=[],guide={path:'.agent-hub/design/user-guide.md',content:'# User guide\n\nQuét dẫn chứng từ ảnh: PNG JPEG WebP, tối đa 15 MiB. Bấm Dùng dẫn chứng trước khi chạy brief.'};
 const docs=[...seed.documents,guide],paths=[...seed.sourcePaths,guide.path,'docs/private-notes.md'];
 t.mock.method(globalThis,'fetch',async url=>{
  const tail=String(url).split('/'+seed.repository+'/')[1];calls.push(tail);
  if(tail.startsWith('commits/'))return{ok:true,json:async()=>({sha:seed.sourceCommit})};
  if(tail.startsWith('git/trees/'))return{ok:true,json:async()=>({truncated:false,tree:paths.map(path=>({path,type:'blob'}))})};
  const doc=docs.find(d=>tail==='contents/'+d.path+'?ref='+seed.sourceCommit);assert.ok(doc,'only pinned allowlisted documents may be read: '+tail);
  return{ok:true,json:async()=>({type:'file',encoding:'base64',size:Buffer.byteLength(doc.content),content:Buffer.from(doc.content).toString('base64')})};
 });
 try{
  const s=f.service,r=approve(s,seed.projectId),packet=s.packet(r.id),old=s.currentLibrary(seed.projectId);
  const legacy={...old,ciInspectionVersion:1};
  const loaded=await readRepositoryLibrary(seed.repository,'main',undefined,legacy);
  assert.equal(loaded.libraryFormatVersion,3);assert.equal(loaded.documents.length,12);assert.deepEqual(loaded.documents.at(-1),guide);
  assert.ok(!calls.some(p=>p.startsWith('contents/docs/')));
  const saved=s.addLibrary(loaded);assert.notEqual(saved.id,old.id);assert.deepEqual(s.packet(r.id),packet);assert.equal(s.library(old.id).documents.length,11);
  const knowledge=createKnowledge(f.db,s),found=knowledge.search(seed.projectId,'Quét dẫn chứng PNG JPEG WebP 15 MiB',{libraryId:saved.id,limit:12});
  assert.ok(found.matches.some(m=>m.path===guide.path&&m.commit===seed.sourceCommit));
  assert.ok(!knowledge.search('writer-studio','Quét dẫn chứng PNG JPEG WebP 15 MiB',{limit:12}).matches.some(m=>m.path===guide.path));
  assert.ok(!knowledge.search(seed.projectId,'Quét dẫn chứng PNG JPEG WebP 15 MiB',{libraryId:old.id,limit:12}).matches.some(m=>m.path===guide.path));
  calls.length=0;assert.equal(await readRepositoryLibrary(seed.repository,'main',undefined,saved),saved);assert.equal(calls.length,1);
 }finally{f.close();}
});
