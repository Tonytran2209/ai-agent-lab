// One key per notice: separate tabs cannot overwrite each other's pending queue.
const prefix=identity=>'lab-notification-outbox-v2:'+identity+':';
export function readOutbox(storage,identity){const entries=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(prefix(identity)))continue;try{const value=JSON.parse(storage.getItem(key));if(value&&typeof value.clientId==='string'&&typeof value.message==='string')entries.push(value);}catch{/* Invalid local entries are never sent. */}}return entries;}
export function savePending(storage,identity,value){storage.setItem(prefix(identity)+value.clientId,JSON.stringify(value));}
export function removePending(storage,identity,id){storage.removeItem(prefix(identity)+id);}
