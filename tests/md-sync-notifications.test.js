import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../server/db.js';
import {createApp} from '../server/index.js';

const admin={role:'admin',name:'Admin'};
function fixture(sync){
  const dir=mkdtempSync(path.join(os.tmpdir(),'lab-md-notify-')),db=openDatabase(dir);
  const config={NODE_ENV:'test',ADMIN_PASSWORD:'admin-md-notify-123456789012345',USER_PASSWORD:'member-md-notify-123456789012345',SESSION_SECRET:'session-md-notify-123456789012345',MCP_TOKEN:'mcp-md-notify-1234567890123456'};
  const app=createApp(config,{db,serializeProjects:false,maintenanceOptions:{sync:(...args)=>sync(app.service,...args),fetcher:async()=>({ok:true,json:async()=>({files:[]})})}});
  return {...app,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
const mdNotices=f=>f.notificationCenter.list(admin,{limit:100}).items.filter(x=>x.source==='library');

test('routine MD syncs stay silent; MD changes, failures and recovery notify once each',async()=>{
  let mode='same',commit=0;
  const f=fixture(async service=>{
    const current=service.currentLibrary('writer-studio');
    if(mode==='fail')throw Error('GitHub unavailable');
    if(mode==='same')return current;
    commit++;
    const sha=String(commit).repeat(40).slice(0,40);
    const documents=mode==='code-only'?current.documents:current.documents.map((d,i)=>i===0?{...d,content:d.content+'\nUpdated rule '+commit}:d);
    return service.addLibrary({...current,sourceCommit:sha,documents});
  });
  try{
    await f.maintenance.refresh('writer-studio');
    await f.maintenance.refresh('writer-studio');
    assert.equal(mdNotices(f).length,0,'unchanged hourly syncs must not notify');

    mode='code-only';await f.maintenance.refresh('writer-studio');
    assert.equal(mdNotices(f).length,0,'a new commit without MD changes must not notify');

    mode='md';await f.maintenance.refresh('writer-studio');
    assert.equal(mdNotices(f).length,1);
    assert.equal(mdNotices(f)[0].message,'Đã đồng bộ và lập chỉ mục.');
    mode='same';await f.maintenance.refresh('writer-studio');
    assert.equal(mdNotices(f).length,1,'re-syncing the same MD must not repeat the notice');

    mode='fail';await f.maintenance.refresh('writer-studio');await f.maintenance.refresh('writer-studio');
    assert.equal(mdNotices(f).length,2,'a persistent failure notifies only once');
    assert.equal(mdNotices(f)[0].phase,'failed');

    mode='same';await f.maintenance.refresh('writer-studio');
    assert.equal(mdNotices(f).length,3,'recovery after a failure notifies');
    assert.equal(mdNotices(f)[0].phase,'ready');
    assert.equal(f.maintenance.get('writer-studio').phase,'ready');
  }finally{f.close();}
});
