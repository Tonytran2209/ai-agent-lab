import path from 'node:path';
import {mkdir,lstat,realpath} from 'node:fs/promises';
// One runner-owned worktree per project. Never reset or delete dirty work.
export async function sharedWorktree(config,base,run,options={}){
 if(!/^[a-f0-9]{40}$/.test(base))throw Error('Sai base workspace.');
 const target=path.join(config.stateDir,'workspace');
 const git=async(args,cwd=config.repoPath)=>{const v=await run('git',['-c','core.hooksPath=/dev/null','-C',cwd,...args],{...options,timeout:120000});if(v.code)throw Error('Workspace project chưa sẵn sàng; giữ nguyên dữ liệu cục bộ.');return v.stdout.trim();};
 await mkdir(config.stateDir,{recursive:true,mode:0o700});
 try{const stat=await lstat(target);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Workspace không hợp lệ.');
  if(await git(['rev-parse','--path-format=absolute','--git-common-dir'],target)!==await git(['rev-parse','--path-format=absolute','--git-common-dir']))throw Error('Workspace thuộc repo khác.');
  if(await realpath(target)!==path.join(await realpath(config.stateDir),'workspace'))throw Error('Workspace qua symlink.');
  if(await git(['status','--porcelain','--untracked-files=all'],target))throw Object.assign(Error('Workspace còn thay đổi chưa lưu; giữ nguyên để phục hồi, chưa nhận task khác.'),{code:'WORKSPACE_DIRTY'});
  await git(['switch','--detach',base],target);
 }catch(e){if(e.code!=='ENOENT')throw e;await git(['worktree','add','--detach',target,base]);}
 return target;
}
