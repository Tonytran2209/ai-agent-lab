// Durable metadata-only recovery. Never runs project code or merges a second time.
import {syncLibrary} from './library.js';
import {canReconcileDeployment,verifyRecoveredDeployment} from './deploy-reconciliation.js';
export function createRecovery(service,config,{sync=syncLibrary,verify=verifyRecoveredDeployment,clock=()=>Date.now()}={}){
 let active,timer;
 async function recover(){const observed=new Set();for(let r of service.list()){
  if(r.status==='awaiting-approval'){try{service.recoverSupplementalChecks(r.id);}catch{}continue;}
  if(r.release?.phase==='failed'){
   // Read-only reconciliation of an already successful deploy, never a deployment retry.
   // One request per project per tick; durable exponential backoff survives server restarts.
   if(config.GITHUB_TOKEN&&canReconcileDeployment(r)&&!r.projectQueue?.blocked&&!observed.has(r.projectId)){
    observed.add(r.projectId);
    try{if(service.beginDeploymentObservation(r.id,r.updatedAt,clock())){
     const proof=await verify(r,service.project(r.projectId),null,config.GITHUB_TOKEN,{discoverHead:true});
     service.reconcileDeployment(r.id,proof,'Deployment observer',r.updatedAt,{automatic:true});
    }}catch{} // Failed/pending/foreign proof keeps the original failure and its FIFO lock.
   }
   r=service.get(r.id);
   if(r.release?.phase==='failed'){try{service.recoverPublication(r.id);}catch{}continue;}
  }
  if(r.release?.phase!=='deployed'||r.release.librarySync==='synced'||!service.project(r.projectId).enabled||(r.release.syncNextAt||0)>clock())continue;
  try{await sync(service,config.GITHUB_TOKEN,r.projectId);service.releaseLibrarySync(r.id,true);}
  catch{service.releaseLibrarySync(r.id,false);}
 }}
 const tick=()=>active||(active=recover().finally(()=>{active=null;}));
 return {tick,start(){if(!timer){timer=setInterval(()=>tick().catch(()=>{}),30000);timer.unref();void tick().catch(()=>{});}},async stop(){clearInterval(timer);await active;}};
}
