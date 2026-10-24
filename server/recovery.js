// Durable metadata-only recovery. Never runs project code or merges a second time.
import {syncLibrary} from './library.js';
export function createRecovery(service,config,{sync=syncLibrary,clock=()=>Date.now()}={}){
 let active,timer;
 async function recover(){for(const r of service.list()){
  if(r.release?.phase==='failed'){try{service.recoverPublication(r.id);}catch{}continue;}
  if(r.release?.phase!=='deployed'||r.release.librarySync==='synced'||!service.project(r.projectId).enabled||(r.release.syncNextAt||0)>clock())continue;
  try{await sync(service,config.GITHUB_TOKEN,r.projectId);service.releaseLibrarySync(r.id,true);}
  catch{service.releaseLibrarySync(r.id,false);}
 }}
 const tick=()=>active||(active=recover().finally(()=>{active=null;}));
 return {tick,start(){if(!timer){timer=setInterval(()=>tick().catch(()=>{}),30000);timer.unref();void tick();}},async stop(){clearInterval(timer);await active;}};
}
