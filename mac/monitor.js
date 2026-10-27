// Remote CI/deploy observation must continue while the coding lane is busy.
// One in-flight monitor cycle; server-side claims still arbitrate other workers.
export function startMonitor(run,{intervalMs=15000,onError=()=>{},onState=()=>{}}={}){
 let active,stopped=false;
 const tick=()=>stopped?Promise.resolve():active||(active=Promise.resolve().then(()=>{onState(true);return run();}).catch(onError).finally(()=>{active=null;onState(false);}));
 const timer=setInterval(()=>{void tick();},intervalMs);timer.unref();
 return {tick,isBusy:()=>Boolean(active),async stop(){stopped=true;clearInterval(timer);await active;}};
}
