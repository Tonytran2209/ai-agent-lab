import {fork} from 'node:child_process';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {command,childEnvironment} from './runner.js';
export const supervisorVersion='runner-control-1.0.0';
export const idleRestart=state=>state?.safeIdle===true;
export function loginState(result){if(result.code===0)return 'ready';return /not logged in|logged out|login required|unauthorized|authentication required/i.test(result.stdout+' '+result.stderr)?'login-required':'unavailable';}
export const restartDelay=(times,now=Date.now())=>{const recent=times.filter(t=>now-t<10*60000);return recent.length>=3?Math.max(1000,10*60000-(now-recent[0])):Math.min(30000,1000*2**recent.length);};
export async function supervise(configPath){
 const config=JSON.parse(await readFile(configPath,'utf8')),token=process.env.AI_AGENT_LAB_MCP_TOKEN;
 if(!token||token.length<24||!path.isAbsolute(config.codexPath))throw Error('Thiếu cấu hình supervisor.');
 const url=new URL(config.mcpUrl);if(url.protocol!=='https:'||url.pathname!=='/mcp'||url.username||url.password||url.search)throw Error('Sai Lab URL.');
 await mkdir(config.stateDir,{recursive:true,mode:0o700});
 const guard=path.join(config.stateDir,'supervisor.lock');
 try{await mkdir(guard,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(await readFile(path.join(guard,'pid'),'utf8'));if(!Number.isSafeInteger(pid)||pid<2)throw Error('Supervisor lock needs inspection.');try{process.kill(pid,0);throw Error('Supervisor already running.');}catch(err){if(err.code!=='ESRCH')throw err;}await rm(guard,{recursive:true});await mkdir(guard,{mode:0o700});}
 await writeFile(path.join(guard,'pid'),String(process.pid),{mode:0o600});
 const workerFile=path.join(config.stateDir,'worker-id');let workerId;try{workerId=(await readFile(workerFile,'utf8')).trim();}catch{workerId=crypto.randomUUID();await writeFile(workerFile,workerId,{mode:0o600,flag:'wx'});}if(!/^[a-f0-9-]{36}$/.test(workerId))throw Error('Sai worker identity.');
 const api=async(suffix,body)=>{const res=await fetch(new URL('/runner/control'+suffix,url),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});if(!res.ok)throw Object.assign(Error('Control HTTP '+res.status),{status:res.status});return res.json();};
 let child,stopping=false,state={safeIdle:false},seen=0,pending=null,connected=false,busy=false,childBootAt=null,outcome=null,finishing=null,health={state:'unknown',checkedAt:null},nextStart=0;
 const bootAt=new Date().toISOString(),restartsFile=path.join(config.stateDir,'supervisor-restarts.json');let restarts=[];try{restarts=JSON.parse(await readFile(restartsFile,'utf8'));}catch{}if(!Array.isArray(restarts))restarts=[];
 const finish=(c,phase,note)=>{outcome={c,phase,note};return finishing||(finishing=(async()=>{try{await api('/'+c.id+'/result',{workerId,phase,note});pending=null;outcome=null;}catch(e){if(e.status===409||e.status===400){pending=null;outcome=null;}else throw e;}finally{finishing=null;}})());};
 const check=async()=>{const r=await command(config.codexPath,['login','status'],{env:childEnvironment(process.env),timeout:15000});health={state:loginState(r),checkedAt:new Date().toISOString()};};
 const start=()=>{
  connected=false;childBootAt=new Date().toISOString();state={safeIdle:false};seen=Date.now();
  child=fork(fileURLToPath(new URL('./runner.js',import.meta.url)),[configPath],{env:process.env,stdio:['ignore','inherit','inherit','ipc']});const owned=child;
  owned.on('message',m=>{if(m?.type==='runner-state'){state={safeIdle:m.safeIdle===true};seen=Date.now();}if(m?.type==='connected'){connected=true;if(pending?.sent&&['restart','reconnect'].includes(pending.action))void finish(pending,'completed',pending.action==='restart'?'Runner mới đã kết nối Lab.':'Đã tạo lại kết nối Lab.').catch(()=>{});}});
  let exited=false;
  const onExit=async()=>{if(exited)return;exited=true;
   child=null;connected=false;
   // Never discard locks from a busy crashed coding process: its detached tools may still be writing.
   if(!stopping&&state.safeIdle){const lock=path.join(config.stateDir,'runner.lock');try{if((await readFile(path.join(lock,'pid'),'utf8')).trim()===String(owned.pid))await rm(lock,{recursive:true});}catch{}}
   restarts=restarts.filter(t=>Date.now()-t<10*60000);restarts.push(Date.now());await writeFile(restartsFile,JSON.stringify(restarts),{mode:0o600});nextStart=Date.now()+restartDelay(restarts);
  };owned.once('exit',()=>void onExit().catch(()=>{nextStart=Date.now()+60000;}));owned.once('error',()=>void onExit().catch(()=>{nextStart=Date.now()+60000;}));
 };
 const stop=()=>{stopping=true;child?.kill('SIGTERM');};process.once('SIGTERM',stop);process.once('SIGINT',stop);
 const tick=async()=>{
  if(busy||stopping)return;busy=true;
  try{
   if(!child&&Date.now()>=nextStart)start();
   const stalled=child&&Date.now()-seen>180000;
   if(stalled&&idleRestart(state))child.kill('SIGTERM');
   await api('/heartbeat',{workerId,controlProtocol:'runner-control-v1',version:supervisorVersion,bootAt,childBootAt,state:stalled?'stalled':!child?'backoff':pending?.action==='restart'?'restarting':state.safeIdle?'idle':connected?'busy':'starting',childSeenAt:seen?new Date(seen).toISOString():null,codex:health});
   if(!child||!idleRestart(state))return;
   if(outcome){await finish(outcome.c,outcome.phase,outcome.note);return;}
   const c=(await api('?workerId='+workerId)).command;
   if(!c)pending=null;
   if(c&&!['restart','reconnect','check-codex'].includes(c.action))throw Error('Unknown control action');
   if(c){if(pending?.id!==c.id){if(!child||!idleRestart(state))return;await api('/'+c.id+'/claim',{workerId});pending={...c,sent:false};}
    if(!child||!idleRestart(state)||pending.sent)return;pending.sent=true;
    if(c.action==='restart'){child.kill('SIGTERM');}
    else if(c.action==='reconnect'){child.send({type:'reconnect'});}
    else if(c.action==='check-codex'){await check();await finish(c,health.state==='ready'?'completed':'failed',health.state==='ready'?'Phiên Codex CLI đang đăng nhập; chưa gọi model.':health.state==='login-required'?'Cần đăng nhập Codex trên Mac.':'Chưa xác minh được Codex CLI; kiểm tra cài đặt/kết nối trên Mac.');}
   }
   if(!c&&(!health.checkedAt||Date.now()-Date.parse(health.checkedAt)>15*60000))await check();
  }catch{ /* Network errors keep durable commands pending; no model calls or credential refresh. */ }
  finally{busy=false;}
 };
 await tick();const timer=setInterval(()=>void tick(),15000);
 await new Promise(resolve=>{const t=setInterval(()=>{if(stopping&&!child&&!busy){clearInterval(t);resolve();}},250);});clearInterval(timer);process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);await rm(guard,{recursive:true});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))supervise(process.argv[2]||'mac/config.local.json').catch(()=>{console.error('Supervisor chưa khởi động được; kiểm tra config và quyền Mac.');process.exitCode=1;});
