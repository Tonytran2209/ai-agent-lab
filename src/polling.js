// Completion-based polling: one request cycle, no traffic from hidden tabs.
// After a failure (Lab restarting after a deploy, a network blip) retry soon: 3 s, then 10 s,
// then back off to at most 2 minutes. A success restores the normal interval.
export function retryDelay(failures,base){
 if(!failures)return base;
 if(failures===1)return Math.min(3000,base);
 if(failures===2)return Math.min(10000,base);
 return Math.min(120000,base*2**Math.min(failures-2,3));
}
export function startPolling(run,{interval=()=>30000,onError=()=>{},document:doc=globalThis.document,timers=globalThis}={}){
 let stopped=false,active=null,timer=null,failures=0,again=false;
 const clear=()=>{if(timer!==null)timers.clearTimeout(timer);timer=null;};
 const schedule=()=>{clear();if(!stopped&&!doc?.hidden)timer=timers.setTimeout(()=>{void tick();},retryDelay(failures,interval()));};
 const tick=()=>{if(stopped||doc?.hidden)return Promise.resolve();clear();if(active){again=true;return active;}active=Promise.resolve().then(run).then(()=>{failures=0;},e=>{failures++;onError(e);}).finally(()=>{active=null;if(stopped)return;if(again&&!doc?.hidden){again=false;void tick();}else schedule();});return active;};
 const visibility=()=>{clear();if(doc?.hidden)again=false;else void tick();};doc?.addEventListener('visibilitychange',visibility);void tick();
 return {tick,stop(){stopped=true;clear();doc?.removeEventListener('visibilitychange',visibility);}};
}
export async function loadRequestIndex(api,admin){
 const requests=[];let before;
 do{const page=await api('/requests?summary=true&limit=200'+(admin?'&includeArchived=true':'')+(before?'&before='+before:''));requests.push(...page.requests);before=page.nextBefore;}while(before);
 return requests;
}
