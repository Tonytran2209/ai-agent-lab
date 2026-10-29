import {setTimeout as delay} from 'node:timers/promises';
import {codexFailureCategory} from './codex-events.js';
// Retry only an unsuccessful CLI startup, before a model turn or tool invocation.
export function startupFailure(result) {
 if(result.code!==1||result.signal)return false;
 const output=result.stdout||'';
 if(output.trim()){
  const lines=output.trim().split('\n');
  if(lines.some(line=>{try{return !['thread.started','error','turn.failed'].includes(JSON.parse(line).type);}catch{return true;}}))return false;
 }
 const category=codexFailureCategory((result.stderr||'')+' '+output);
 return category==='transport'||category==='local-permission'&&/failed to initialize.*(?:app.server|client)|failed to start.*(?:sandbox|client)/i.test(result.stderr||'');
}
export function codexFailureMessage(result) {
 const category=codexFailureCategory((result.stderr||'')+' '+(result.stdout||''));
 const hints={authentication:'Cần đăng nhập lại Codex CLI trên Mac. Không cần admin duyệt lại request.',
  'local-permission':'Codex không khởi tạo được sandbox/client trên Mac; đã giữ nguyên quyền và dữ liệu.',
  transport:'Kết nối Codex tạm gián đoạn; chưa nhận được kết quả hoàn chỉnh.',
  'rate-limit':'Tài khoản Codex đang chạm hạn mức; cần đợi hạn mức được khôi phục.',schema:'Schema Codex không hợp lệ; cần cập nhật chương trình.'};
 return 'Codex thoát với mã '+result.code+'. '+(hints[category]||'Chưa xác định được lỗi Codex; đã giữ dữ liệu. Không mặc định đây là lỗi đăng nhập.');
}
export async function runCodexWithRecovery(run,executable,args,options,{beforeRetry=async()=>{},onRetry=async()=>{},wait=delay}={}) {
 const first=await run(executable,args,options);
 if(!startupFailure(first)||options.signal?.aborted)return first;
 // Check authentication without changing credentials or invoking a model.
 const auth=await run(executable,['login','status'],{cwd:options.cwd,env:options.env,signal:options.signal,timeout:15000});
 if(auth.code!==0)return first;
 await beforeRetry();
 await onRetry();
 await wait(2000,undefined,{signal:options.signal});
 // A fresh CLI process reconnects; retain the same claim, packet, base and worktree.
 return run(executable,args,options);
}
