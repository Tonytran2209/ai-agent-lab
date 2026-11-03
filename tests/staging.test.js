import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../server/db.js';
import {createService} from '../server/service.js';
import {createApp} from '../server/index.js';
const config={NODE_ENV:'test',LAB_ENVIRONMENT:'staging',LAB_REMOVE_UNUSED_DEFAULT_PROJECTS:'true',ADMIN_PASSWORD:'admin-staging-test-123456789',USER_PASSWORD:'user-staging-test-123456789',SESSION_SECRET:'session-staging-test-123456789',MCP_TOKEN:'token-staging-test-123456789'};
function fixture(){const dir=mkdtempSync(path.join(os.tmpdir(),'lab-staging-')),db=openDatabase(dir);return{db,close(){db.close();rmSync(dir,{recursive:true,force:true});}};}
test('empty staging boots, authenticates and serves config/projects without a Writer library',async()=>{
 const f=fixture(),{app,service}=createApp(config,{db:f.db});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{assert.deepEqual(service.projects(),[]);const base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Admin',password:config.ADMIN_PASSWORD})});assert.equal(login.status,200);const headers={Cookie:login.headers.get('set-cookie').split(';')[0]};
 for(const url of ['/api/config','/api/projects','/api/requests']){const r=await fetch(base+url,{headers});assert.equal(r.status,200,url);const b=await r.json();if(url.endsWith('config'))assert.equal(b.project,null);}
 const lib=JSON.parse(readFileSync(new URL('../library/writer-studio.json',import.meta.url),'utf8'));lib.projectId='a2a-test-project';lib.repository='Example/a2a-test';service.addLibrary(lib);assert.equal(service.currentLibrary().projectId,lib.projectId);assert.equal(service.projects()[0].runnerEnabled,false);assert.equal(service.projects()[0].releaseEnabled,false);
 assert.equal(createService(f.db,{bootstrapDefaults:false}).projects().length,1);
 }finally{await new Promise(r=>server.close(r));f.close();}
});
test('staging removes only unused exact seed registrations and preserves immutable libraries',()=>{const f=fixture();try{createService(f.db);const count=f.db.prepare('SELECT count(*) n FROM libraries').get().n;const {service}=createApp(config,{db:f.db});assert.equal(service.projects().length,0);assert.equal(JSON.parse(f.db.prepare("SELECT value FROM settings WHERE key='staging_removed_seed:writer-studio'").get().value).id,'writer-studio');assert.equal(f.db.prepare('SELECT count(*) n FROM libraries').get().n,count);assert.equal(createService(f.db,{bootstrapDefaults:false}).projects().length,0);}finally{f.close();}});
test('cleanup refuses production and any seed with request history without partial deletion',()=>{const f=fixture();try{createService(f.db);assert.throws(()=>createApp({...config,LAB_ENVIRONMENT:'production'},{db:f.db}),/requires staging/);f.db.prepare('INSERT INTO requests(id,data) VALUES (?,?)').run('REQ-12345678',JSON.stringify({projectId:'intercom-writer-studio'}));assert.throws(()=>createApp(config,{db:f.db}),/request history/);assert.equal(f.db.prepare('SELECT count(*) n FROM projects').get().n,2);}finally{f.close();}});
test('production keeps both legacy defaults; Railway staging name alone opts out',()=>{const f=fixture();try{assert.equal(createService(f.db).projects().length,2);}finally{f.close();}const g=fixture();try{const {service}=createApp({...config,LAB_ENVIRONMENT:undefined,LAB_REMOVE_UNUSED_DEFAULT_PROJECTS:undefined,RAILWAY_ENVIRONMENT_NAME:'staging-a2a'},{db:g.db});assert.deepEqual(service.projects(),[]);}finally{g.close();}});

test('cleanup refuses CI/deploy onboarding even without feedback',()=>{const f=fixture();try{createService(f.db);f.db.exec('CREATE TABLE deployment_credentials(project_id TEXT PRIMARY KEY,data TEXT NOT NULL)');f.db.prepare('INSERT INTO deployment_credentials VALUES (?,?)').run('writer-studio','{}');assert.throws(()=>createApp(config,{db:f.db}),/onboarding\/CI\/deployment/);assert.equal(f.db.prepare('SELECT count(*) n FROM projects').get().n,2);}finally{f.close();}});
