// Independent from coding, completion-based, bounded to one in-flight cycle.
export function startMonitor(run,{intervalMs=15000,onError=()=>{},onState=()=>{}}={}){
 let active,stopped=false,timer;
 const schedule=()=>{clearTimeout(timer);if(!stopped){timer=setTimeout(()=>void tick(),typeof intervalMs==='function'?intervalMs():intervalMs);timer.unref();}};
 const tick=()=>stopped?Promise.resolve():active||(clearTimeout(timer),active=Promise.resolve().then(()=>{onState(true);return run();}).catch(onError).finally(()=>{active=null;onState(false);schedule();}));
 schedule();return {tick,isBusy:()=>Boolean(active),async stop(){stopped=true;clearTimeout(timer);await active;}};
}
