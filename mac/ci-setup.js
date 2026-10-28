import {adapterPaths,adapterProtocol} from '../server/ci-adapters.js';
import path from 'node:path';
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {githubClient} from './release.js';
import {ciTemplate,adapterTemplate} from './ci-template.js';
import {assessCi,ciSetupPaths} from '../server/ci-evidence.js';
export async function ciSetupStep({job:j,config,run,api,signal}) {
 if(!/^[a-f0-9-]{36}$/.test(j.id)||! /^[a-f0-9]{40}$/.test(j.baseCommit))throw new Error('CI job identity không hợp lệ.');
 if(j.projectId!==config.projectId||j.repository!==config.repository||j.branch!==config.branch)throw new Error('CI job không khớp project/checkout.');
 const managed=adapterPaths(j);
 const prefix='repos/'+j.repository, branch='lab-ci/'+j.id;
 const git=async(args,cwd=config.repoPath)=>{const r=await run('git',['-C',cwd,...args],{signal,timeout:120000});if(r.code&&/workflow.*scope|refusing.*workflow|workflow.*permission/i.test(r.stderr||''))throw new Error('Token gh thiếu quyền cập nhật workflow. Cấp scope workflow (OAuth) hoặc Workflows: write rồi Thử lại CI.');if(r.code)throw new Error('Git thiết lập CI thất bại: '+args[0]+'. Kiểm tra checkout/quyền GitHub.');return r.stdout.trim();};
 const origin=await git(['remote','get-url','origin']);if(!['https://github.com/'+j.repository+'.git','https://github.com/'+j.repository,'git@github.com:'+j.repository+'.git'].includes(origin))throw new Error('Remote CI không khớp project.');
 const head=await api(prefix+'/commits/'+encodeURIComponent(j.branch));
 const evidence=async commit=>assessCi(await api(prefix+'/commits/'+commit+'/check-runs?per_page=100'),await api(prefix+'/commits/'+commit+'/status'),commit);
 if(j.phase==='queued'){
  if(head.sha!==j.baseCommit)throw new Error('Branch đã thay đổi sau khi xếp lịch; đồng bộ library và tạo lại job trước khi chuẩn bị CI.');
  const checks=await evidence(head.sha);
  if(checks.ready)return {phase:'ready',existing:true,commit:head.sha,note:'writer-check và browser-check hiện có đã đạt trên main/branch đã chọn. Giữ nguyên cấu hình CI.'};
  await git(['fetch','--no-tags','origin',j.baseCommit]);
  const read=async p=>git(['show',j.baseCommit+':'+p]);
  const tree=(await git(['ls-tree','-r','--name-only',j.baseCommit])).split('\n');
  const workflows=tree.filter(p=>/^\.github\/workflows\/[^/]+\.ya?ml$/.test(p));
  if(workflows.length){
   const text=(await Promise.all(workflows.map(read))).join('\n');const compatible=/\bwriter-check\s*:/.test(text)&&/\bbrowser-check\s*:/.test(text);
   if(!compatible)throw new Error('Repo có workflow riêng. Cần adapter/bổ sung hai job writer-check và browser-check; không ghi đè workflow hiện có.');
   return {phase:'ci',existing:true,commit:head.sha,note:'Giữ nguyên CI hiện có; đang chờ hai kiểm tra GitHub đạt trên commit hiện tại.'};
  }
  if(j.adapter?.key==='existing-ci@1')throw Error('Adapter CI hiện có không tạo workflow; cần writer-check/browser-check thực trước khi xác minh.');
  const files=j.adapter?await adapterTemplate(read,j.branch,j.adapter):await ciTemplate(read,j.branch);
  if(managed.some(p=>tree.includes(p)))throw new Error('File cấu hình CI đích đã tồn tại; cần kiểm tra thủ công để tránh ghi đè.');
  const auth=await run(config.ghPath||'/opt/homebrew/bin/gh',['api','--include','user'],{signal,timeout:30000});
  if(auth.code)throw new Error('Mac chưa xác minh được quyền GitHub gh. Kiểm tra gh auth login.');
  const scopes=auth.stdout.match(/^x-oauth-scopes:\s*(.*)$/im)?.[1];
  if(scopes!==undefined&&!scopes.split(',').map(v=>v.trim()).includes('workflow'))throw new Error('gh trên Mac thiếu scope workflow. Chạy gh auth refresh -h github.com -s workflow trong Terminal, xác nhận quyền trên GitHub, rồi Thử lại CI.');
  const worktree=path.join(config.stateDir,'ci-setup',j.id);
  await mkdir(path.dirname(worktree),{recursive:true,mode:0o700});
  let exists=false;try{const s=await lstat(worktree);if(s.isSymbolicLink())throw new Error('Worktree CI không hợp lệ.');exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!exists)await git(['worktree','add','-b',branch,worktree,j.baseCommit]);
  if(await git(['branch','--show-current'],worktree)!==branch)throw new Error('Worktree CI thuộc nhánh khác.');
  const current=await git(['rev-parse','HEAD'],worktree);
  if(current!==j.baseCommit&&await git(['rev-parse','HEAD^'],worktree)!==j.baseCommit)throw new Error('Lịch sử worktree CI không khớp base.');
  for(const [p,content] of Object.entries(files)){
   let partial=worktree;for(const part of p.split('/')){partial=path.join(partial,part);try{if((await lstat(partial)).isSymbolicLink())throw new Error('Symlink trong file CI.');}catch(e){if(e.code!=='ENOENT')throw e;}}
   try{if(await readFile(path.join(worktree,p),'utf8')!==content)throw new Error('File CI đã thay đổi; không ghi đè.');}catch(e){if(e.code!=='ENOENT')throw e;await mkdir(path.dirname(path.join(worktree,p)),{recursive:true});await writeFile(path.join(worktree,p),content);}
  }
  const changed=(await git(['diff','--name-only',j.baseCommit],worktree)+'\n'+await git(['ls-files','--others','--exclude-standard'],worktree)).split('\n').filter(Boolean);
  if(!changed.length||changed.some(p=>!managed.includes(p))||new Set(changed).size!==managed.length)throw new Error('Diff CI không đúng danh sách file đã cho phép.');
  if(current===j.baseCommit){await git(['add','--',...managed],worktree);await git(['-c','user.name=AI Agent Lab','-c','user.email=agent-lab@users.noreply.github.com','commit','-m','Set up scoped Agent Lab CI'],worktree);}
  const commit=await git(['rev-parse','HEAD'],worktree);
  const helper='!'+(config.ghPath||'/opt/homebrew/bin/gh')+' auth git-credential';
  await git(['-c','credential.helper=','-c','credential.helper='+helper,'push','origin','refs/heads/'+branch+':refs/heads/'+branch]);
  const prs=await api(prefix+'/pulls?state=all&head='+encodeURIComponent(j.repository.split('/')[0])+':'+encodeURIComponent(branch)+'&base='+encodeURIComponent(j.branch));
  let pr=prs.find(p=>p.head.sha===commit&&p.state==='open');if(!pr&&prs.length)throw new Error('PR CI đã bị đóng/thay đổi; cần kiểm tra thủ công.');
  if(!pr)pr=await api(prefix+'/pulls','POST',{head:branch,base:j.branch,title:'Set up Agent Lab CI',body:'Admin yêu cầu thiết lập CI từ Agent Lab. Chỉ thêm workflow và fixture/test tách biệt; không sửa logic app, secrets hoặc migration.\n\nwriter-check: npm run check. browser-check: component Draft và EB V2 (nếu có), desktop/mobile, API fixture tách biệt, screenshot và trace. Không gọi AI production.\n\nProfile: writer-react-v1. Mac không chạy Chromium; kết quả CI GitHub là bằng chứng kiểm tra.',draft:true});
  return {phase:'ci',commit,prNumber:pr.number,note:'Đã tạo draft PR #'+pr.number+'. GitHub đang chạy writer-check và browser-check.'};
 }
 if(j.phase==='syncing'){
  const e=await evidence(head.sha);if(e.failed)throw new Error('CI trên branch sau merge chưa đạt. Giữ phát hành tắt và kiểm tra GitHub.');
  if(!e.ready)return {phase:'syncing',note:'Đã merge cấu hình; đang chờ CI trên branch đích trước khi đồng bộ library.'};
  return {phase:'ready',commit:head.sha,note:'Cấu hình CI đã merge và hai kiểm tra GitHub đã đạt trên branch đích. Library sẽ được đồng bộ.'};
 }
 if(j.phase==='ci'){
  const commit=j.commit,e=await evidence(commit);
  if(e.failed)throw new Error('CI chưa đạt. Xem report/trace trong GitHub; giữ nguyên PR, không merge hoặc bật phát hành.');
  if(!e.ready){if(Date.now()-Date.parse(j.lastAttemptAt||j.createdAt)>30*60000)throw new Error('Hết thời gian chờ CI. Kiểm tra workflow/quyền Actions rồi thử lại.');return {phase:'ci',note:'Đang chờ writer-check và browser-check trên đúng commit.'};}
  if(j.existing){if(head.sha!==commit)throw new Error('Branch đã đổi; cần kiểm tra lại CI trên commit mới.');return {phase:'ready',existing:true,commit,note:'CI hiện có đã được xác minh trên branch đích; không cần tạo PR cấu hình.'};}
  const pr=await api(prefix+'/pulls/'+j.prNumber);
  if(pr.head.sha!==commit||pr.base.ref!==j.branch||pr.base.repo.full_name!==j.repository||pr.head.ref!==branch)throw new Error('PR CI đã đổi head/base.');
  const files=await api(prefix+'/pulls/'+j.prNumber+'/files?per_page=100');if(!(j.adapter?[managed.length]:[5,ciSetupPaths.length]).includes(files.length)||!ciSetupPaths.slice(0,5).every(p=>files.some(f=>f.filename===p))||pr.changed_files!==files.length||files.some(f=>!managed.includes(f.filename)))throw new Error('PR CI có file ngoài scope.');
  if(pr.merged)return {phase:'syncing',mergeCommit:pr.merge_commit_sha,note:'PR cấu hình đã merge; chờ CI branch đích.'};
  if(pr.state!=='open')throw new Error('PR CI đã đóng.');
  if(!j.autoMerge)return {phase:'awaiting-merge',note:'Hai kiểm tra CI đã đạt. Admin có thể xem PR và bấm Hoàn tất thiết lập.'};
  if(pr.draft){await api('graphql','POST',{query:'mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id}}}',variables:{id:pr.node_id}});return {phase:'ci',note:'CI đã đạt; đã chuyển PR sang ready để hoàn tất thiết lập.'};}
  if(!pr.mergeable||['behind','blocked','dirty'].includes(pr.mergeable_state))throw new Error('PR cần cập nhật base hoặc chưa đủ điều kiện merge; không tự sửa xung đột.');
  const merged=await api(prefix+'/pulls/'+j.prNumber+'/merge','PUT',{sha:commit,merge_method:'squash'});if(!merged.merged)throw new Error('GitHub chưa cho phép merge cấu hình CI.');
  return {phase:'syncing',mergeCommit:merged.sha,note:'Đã merge đúng PR cấu hình CI; chưa bật phát hành, chờ kiểm tra branch đích.'};
 }
 throw new Error('Sai giai đoạn CI.');
}
export async function pollCiSetups(configs,token,run,signal,onPullRequest=async()=>{}){
 if(!configs.length)return;
 const base=new URL('/runner/ci-setups',configs[0].mcpUrl);
 const request=async(suffix='',body)=>{const res=await fetch(base.href+suffix,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(suffix.endsWith('/report')?180000:30000),body:body?JSON.stringify(body):undefined});if(!res.ok)throw new Error('CI setup API: '+res.status);return res.json();};
 const {jobs}=await request();
 for(const row of jobs){const config=configs.find(c=>c.projectId===row.projectId&&c.repository===row.repository);if(!config||signal?.aborted)continue;
  let claim;try{claim=await request('/'+row.projectId+'/claim',{jobId:row.id,protocol:adapterProtocol});}catch{continue;}
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});let heartbeat=Promise.resolve();
  const keep=setInterval(()=>{heartbeat=request('/'+row.projectId+'/heartbeat',{jobId:row.id,setupToken:claim.setupToken}).catch(()=>controller.abort());},60000);
  let update;try{const env={...process.env};for(const k of ['AI_AGENT_LAB_MCP_TOKEN','MCP_TOKEN','OPENAI_API_KEY'])delete env[k];const safeRun=(exe,args,opts={})=>run(exe,args,{...opts,env,signal:controller.signal});update=await ciSetupStep({job:claim.job,config,run:safeRun,api:githubClient(safeRun,config.ghPath||'/opt/homebrew/bin/gh',env,controller.signal),signal:controller.signal});if(update.prNumber)await onPullRequest('https://github.com/'+row.repository+'/pull/'+update.prNumber);}catch(e){update={phase:'failed',note:String(e.message).slice(0,2000)};}finally{clearInterval(keep);await heartbeat;signal?.removeEventListener('abort',abort);}
  try{await request('/'+row.projectId+'/report',{jobId:row.id,setupToken:claim.setupToken,update});}
  catch(e){if(update.phase==='failed')throw e;await request('/'+row.projectId+'/report',{jobId:row.id,setupToken:claim.setupToken,update:{...update,phase:'failed',note:'Mac đã dừng bước này; server chưa xác minh được GitHub/library. Kiểm tra quyền/rate limit rồi dùng Thử lại CI. '+update.note}});}
  return;
 }
}
