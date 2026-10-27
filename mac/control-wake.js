// Wake on an IPC idle transition as well as the periodic poll. Coalesce bursts.
export function controlWake(tick,{schedule=setTimeout,cancel=clearTimeout,delay=500}={}){
 let timer=null,stopped=false;
 return {wake(){if(stopped||timer!==null)return;timer=schedule(()=>{timer=null;if(!stopped)void tick();},delay);},stop(){stopped=true;if(timer!==null)cancel(timer);timer=null;}};
}
