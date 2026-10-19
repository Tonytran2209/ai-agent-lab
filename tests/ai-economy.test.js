import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os'; import path from 'node:path';
import {openDatabase} from '../server/db.js'; import {createService} from '../server/service.js';
import {analyzeFeedback} from '../server/ai.js'; import {createPipeline} from '../server/pipeline.js';
import {compactLibrary,codingPacket,displayRecipe} from '../server/ai-context.js';
const plan={title:'Hiển thị Draft gọn hơn',problem:'Giới hạn phần giới thiệu khi hiển thị.',layer:'design',module:'Draft',allowedPaths:['src/components/workspace/Step4Draft.tsx'],acceptanceCriteria:['Giới thiệu tối đa sáu dòng.'],assumptions:['Giữ nguyên dữ liệu gốc.'],questions:[],risk:'low',migrationNotes:''};
const usage={input_tokens:1000,output_tokens:200,total_tokens:1200,input_tokens_details:{cached_tokens:300}};
function fixture(){const dir=mkdtempSync(path.join(os.tmpdir(),'lab-economy-'));const db=openDatabase(dir), service=createService(db);return{db,service,close(){db.close();rmSync(dir,{recursive:true,force:true});}};}
const feedback={feedback:'Giới hạn phần giới thiệu hiển thị Draft ở sáu dòng',screen:'Draft'};
const reply=(draft=plan)=>({ok:true,json:async()=>({status:'completed',usage,output:[{content:[{type:'output_text',text:JSON.stringify(draft)}]}]})});
test('exact plan cache survives restart, avoids a paid call, and grants no approval',async t=>{
 const f=fixture();let calls=0;const bodies=[];t.mock.method(globalThis,'fetch',async(_,opts)=>{calls++;bodies.push(JSON.parse(opts.body));return reply();});
 try{const a=f.service.create(feedback,'A');await analyzeFeedback(f.service,a.id,'AI',{OPENAI_API_KEY:'mock'});
 const second=createService(f.db);const b=second.create(feedback,'B');const out=await analyzeFeedback(second,b.id,'AI',{});
 assert.equal(calls,1);assert.equal(out.ai.source,'cache');assert.equal(out.approval,null);assert.equal(out.status,'awaiting-approval');
 assert.equal(second.aiLedger.summary({}).tokens,1200);assert.equal(second.aiLedger.summary({}).cachedTokens,300);
 const input=JSON.parse(bodies[0].input);assert.equal(Object.keys(input)[0],'library');assert.ok(!input.library.documents.some(d=>d.path.includes('/database/')));assert.ok(input.library.documents.some(d=>d.path.includes('/policies/')));
 }finally{f.close();}
});
test('changed feedback/model miss cache; invalid and stale responses still record usage',async t=>{
 const f=fixture();let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return reply(calls===2?{wrong:true}:plan);});
 try{const a=f.service.create(feedback,'A');await analyzeFeedback(f.service,a.id,'AI',{OPENAI_API_KEY:'mock'});
 const b=f.service.create({...feedback,feedback:feedback.feedback+' và giữ nút sửa'},'B');await assert.rejects(analyzeFeedback(f.service,b.id,'AI',{OPENAI_API_KEY:'mock'}));
 assert.equal(f.service.aiLedger.summary({}).failures,1);assert.equal(f.service.aiLedger.summary({}).tokens,2400);
 const c=f.service.create(feedback,'C');await analyzeFeedback(f.service,c.id,'AI',{OPENAI_API_KEY:'mock',OPENAI_MODEL:'other'});assert.equal(calls,3);
 t.mock.method(globalThis,'fetch',async()=>{f.service.clarify(b.id,'Giữ nội dung cũ','B');return reply();});
 await assert.rejects(analyzeFeedback(f.service,b.id,'AI',{OPENAI_API_KEY:'mock'}),/thay đổi/);assert.equal(f.service.aiLedger.summary({}).tokens,4800);
 }finally{f.close();}
});
test('bounded recipe works without credentials and refuses extra requirements',async()=>{
 const f=fixture();try{const input={feedback:"Thay thế ký tự dấu gạch ngang dài '—' bằng dấu gạch ngang ngắn '-' trong hiển thị bài viết Draft"};const r=f.service.create(input,'A');const w=createPipeline(f.service,{});w.enqueue(r.id,'A');w.start();await w.tick();await w.stop();assert.equal(f.service.get(r.id).ai.source,'template');assert.equal(f.service.get(r.id).status,'approved');assert.equal(f.service.aiLedger.summary({}).calls,0);assert.equal(displayRecipe({...r,feedback:input.feedback+' và đổi dữ liệu lưu'},f.service.currentLibrary()),null);}finally{f.close();}
});
test('budgets reserve before dispatch and keep unknown-usage failures charged',async t=>{
 const f=fixture();let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:false,status:401};});try{const r=f.service.create(feedback,'A');await assert.rejects(analyzeFeedback(f.service,r.id,'AI',{OPENAI_API_KEY:'mock',AI_DAILY_CALL_LIMIT:1}));await assert.rejects(analyzeFeedback(f.service,r.id,'AI',{OPENAI_API_KEY:'mock',AI_DAILY_CALL_LIMIT:1}),/hạn mức/);assert.equal(calls,1);assert.ok(f.service.aiLedger.summary({}).reservedOrUnknownTokens>0);}finally{f.close();}
});
test('pipeline retries transient provider errors only, does not reset active job on repeated clicks',async t=>{
 for(const status of [401,429,503]){const f=fixture();t.mock.method(globalThis,'fetch',async()=>({ok:false,status,json:async()=>({error:{code:'rate_limit_exceeded'}})}));const r=f.service.create(feedback,'A');const w=createPipeline(f.service,{OPENAI_API_KEY:'mock'});try{const first=w.enqueue(r.id,'A');assert.equal(w.enqueue(r.id,'A').preparation.jobId,first.preparation.jobId);w.start();await w.tick();assert.equal(f.service.get(r.id).preparation.status,status===401?'failed':'queued');assert.equal(f.service.aiLedger.summary({}).calls,1);}finally{await w.stop();f.close();}}
});
test('same author active feedback deduplicates, different author remains separate',()=>{
 const f=fixture();try{const a=f.service.create(feedback,'A',{deduplicate:true});const b=f.service.create(feedback,'A',{deduplicate:true});assert.equal(a.id,b.id);assert.equal(b.duplicate,true);assert.notEqual(f.service.create(feedback,'B',{deduplicate:true}).id,a.id);}finally{f.close();}
});
test('coding prompt excludes previous results/events/approval while preserving pinned scope and policies',()=>{
 const f=fixture();try{const lib=f.service.currentLibrary();const packet=codingPacket({id:'REQ-A',baseCommit:lib.sourceCommit,libraryVersionId:lib.id,draft:plan,result:{huge:'secret-result'},approval:{token:'secret'}},lib);assert.ok(!JSON.stringify(packet).includes('secret'));assert.equal(packet.request.draft,plan);assert.ok(packet.library.documents.some(d=>d.path.includes('/policies/ownership')));assert.ok(JSON.stringify(compactLibrary(lib,'design')).length<JSON.stringify(lib).length);}finally{f.close();}
});
test('token and lifetime request caps block admission; provider quota is not retried',async t=>{
 const f=fixture();let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:false,status:429,json:async()=>({error:{code:'insufficient_quota'}})};});
 const w=createPipeline(f.service,{OPENAI_API_KEY:'mock'});try{const a=f.service.create(feedback,'A');await assert.rejects(analyzeFeedback(f.service,a.id,'AI',{OPENAI_API_KEY:'mock',AI_DAILY_TOKEN_LIMIT:1}),/hạn mức/);assert.equal(calls,0);
 w.enqueue(a.id,'A');w.start();await w.tick();assert.equal(f.service.get(a.id).preparation.status,'failed');assert.equal(calls,1);
 await assert.rejects(analyzeFeedback(f.service,a.id,'AI',{OPENAI_API_KEY:'mock',AI_REQUEST_CALL_LIMIT:1}),/hạn mức/);assert.equal(calls,1);
 }finally{await w.stop();f.close();}
});
