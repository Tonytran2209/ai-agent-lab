// Remote CI/deploy observation must continue while the coding lane is busy.
// One in-flight monitor cycle; server-side claims still arbitrate other workers.
export function startMonitor(run,{intervalMs=15000,onError=()=>{}}={}){
 let active,stopped=false;
 const tick=()=>stopped?Promise.resolve():active||(active=Promise.resolve().then(run).catch(onError).finally(()=>{active=null;}));
 const timer=setInterval(()=>{void tick();},intervalMs);timer.unref();
 return {tick,async stop(){stopped=true;clearInterval(timer);await active;}};
}
