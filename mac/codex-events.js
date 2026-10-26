// Keep only bounded counters/timestamps. Never persist model text, tool input or credentials.
export function codexEvents(now=()=>Date.now()) {
 let buffer='',events=0,lastEventAt=null,stage='starting';
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
    else if(e.type==='turn.failed'||e.type==='error')stage='failed';
    else if(e.type.startsWith('item.'))stage=e.item?.type==='command_execution'?'reading-source':'waiting-model';
    else if(e.type==='turn.started')stage='waiting-model';
   }
   if(buffer.length>1000000)buffer='';
  },
  snapshot(){return {elapsedSeconds:Math.max(0,Math.floor((now()-started)/1000)),events:Math.min(events,100000),lastEventAt,stage};}
 };
}
