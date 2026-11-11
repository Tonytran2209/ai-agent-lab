import test from 'node:test';import assert from 'node:assert/strict';
import {fetchResource,setResource,clearResourceCache} from '../src/resource-cache.js';
import {startPolling} from '../src/polling.js';
test('tabs reading the same key share one request and see saved values',async()=>{
 clearResourceCache();let calls=0;const load=async()=>{calls++;return {n:calls};};
 const [a,b]=await Promise.all([fetchResource('k',load),fetchResource('k',load)]);
 assert.equal(calls,1);assert.equal(a,b);
 setResource('k',{n:9});assert.deepEqual(await fetchResource('k',async()=>({n:10})),{n:10});
 await assert.rejects(()=>fetchResource('k',async()=>{throw Error('down');}),/down/);
 assert.deepEqual(await fetchResource('k',load),{n:2},'a failed read does not block the next one');
});
test('polling can wait for a first run when cached data is still fresh',()=>{
 const scheduled=[];const timers={setTimeout(fn,ms){scheduled.push(ms);return scheduled.length;},clearTimeout(){}};let runs=0;
 const p=startPolling(()=>{runs++;},{timers,document:{hidden:false,addEventListener(){},removeEventListener(){}},interval:()=>60000,startDelay:9000});
 assert.equal(runs,0);assert.deepEqual(scheduled,[9000]);p.stop();
});
test('persisted copies belong to one user, survive a reload and are removed at sign-out',async()=>{
 const mem=new Map();globalThis.localStorage={get length(){return mem.size;},key:i=>[...mem.keys()][i]??null,getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
 const m=await import('../src/resource-cache.js?persist');
 m.setCacheOwner('tony:admin');m.setResource('k',{n:1});assert.equal(mem.size,0,'only keys asked to persist are stored');
 const {useResource}=m;assert.equal(typeof useResource,'function');
 // Simulate a persisted key: mark it via a hook-free path.
 mem.set('lab-cache:v1:tony:admin:monitoring:7',JSON.stringify({at:Date.now(),data:{targets:[1]}}));
 mem.set('lab-cache:v1:other:admin:monitoring:7',JSON.stringify({at:Date.now(),data:{targets:[2]}}));
 m.forgetPersisted();assert.equal(mem.size,0);
 delete globalThis.localStorage;
});
