import os from 'node:os';
import path from 'node:path';
import {mkdir,writeFile,stat,rm} from 'node:fs/promises';
// Exclusive runner lock. A lock older than the current boot is always stale: every process
// that could still hold it (including detached Codex tools) died with the reboot or power
// loss. Without a reboot a dead PID is NOT enough, because detached tools of a crashed busy
// runner may still be writing; that case still needs explicit inspection.
export async function acquireRunnerLock(stateDir,{pid=process.pid,now=Date.now(),uptimeSeconds=os.uptime(),log=()=>{}}={}){
 const lock=path.join(stateDir,'runner.lock');
 try{await mkdir(lock,{mode:0o700});}
 catch(error){
  if(error.code!=='EEXIST')throw error;
  const bootAt=now-uptimeSeconds*1000,created=(await stat(lock)).mtimeMs;
  if(!(created<bootAt-5000))throw error;
  log('Xoá runner.lock còn lại từ trước lần khởi động máy gần nhất.');
  await rm(lock,{recursive:true,force:true});
  await mkdir(lock,{mode:0o700});
 }
 await writeFile(path.join(lock,'pid'),String(pid),{mode:0o600});
 return lock;
}
