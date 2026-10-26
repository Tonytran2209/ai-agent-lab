// Keep only bounded counters/timestamps. Never persist model text, tool input or credentials.
export function codexEvents(now=()=>Date.now()) {
 let buffer='',events=0,lastEventAt=null,stage='starting',failureCategory='unknown';
 const started=now();
 return {
  push(chunk){
   buffer+=String(chunk);
   let end;
   while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
    let e;try{e=JSON.parse(line);}catch{continue;}
    if(!e||typeof e.type!=='string')continue;
    events++;lastEventAt=new Date(now()).toISOString();
    if(e.type==='turn.completed')stage='completed';
    else if(e.type==='turn.failed'||e.type==='error'){stage='failed';failureCategory=codexFailureCategory(JSON.stringify(e.error||e.message||''));}
    else if(e.type.startsWith('item.'))stage=e.type==='item.started'&&e.item?.type==='command_execution'?'reading-source':'waiting-model';
    else if(e.type==='turn.started')stage='waiting-model';
   }
   if(buffer.length>1000000)buffer='';
  },
  diagnostics(){return {...this.snapshot(),failureCategory};},
  snapshot(){return {elapsedSeconds:Math.max(0,Math.floor((now()-started)/1000)),events:Math.min(events,100000),lastEventAt,stage};}
 };
}

// Static categories only: provider bodies/headers and model output must never reach diagnostics.
export function codexFailureCategory(stderr=''){
 if(/unauthorized|authentication|401|not logged in|login required/i.test(stderr))return 'authentication';
 if(/429|rate.limit|usage.limit|quota.exceeded/i.test(stderr))return 'rate-limit';
 if(/invalid.{0,30}schema|schema.{0,30}(invalid|unsupported)/i.test(stderr))return 'schema';
 if(/stream disconnected|connection reset|network|websocket|timed out|error sending request/i.test(stderr))return 'transport';
 const errors=stderr.split(/\r?\n/).filter(line=>!/\bWARN(?:ING)?\b/i.test(line)).join('\n');
 if(/operation not permitted|permission denied|sandbox/i.test(errors))return 'local-permission';
 return 'unknown';
}
