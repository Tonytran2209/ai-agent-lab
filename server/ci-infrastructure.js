import {classifyCiLog} from './ci-failure.js';
// Read-only diagnosis of exact-head GitHub jobs. Observation never grants CI success.
const matrixName=/^browser-tests \((desktop|mobile)\)$/;
const testStep=/playwright test|Run browser tests|npm run test:browser/;
const setupStep=/playwright install|Prepare Chromium|install-deps|Verify pinned Playwright environment|Initialize containers|Set up job|Checkout pinned CI tools|actions\/(setup-node|checkout)@/;
export async function ciInfrastructure(api,response,commit){
 const latest=new Map();
 for(const run of response.check_runs||[]){
  if(run.head_sha!==commit||run.app?.slug!=='github-actions')continue;
  const old=latest.get(run.name);if(!old||Number(run.id)>Number(old.id))latest.set(run.name,run);
 }
 const hasMatrix=[...latest.keys()].some(name=>matrixName.test(name));
 const jobs=[],kinds=[];
 for(const run of latest.values()){
  if(!matrixName.test(run.name)&&!['writer-check','browser-check'].includes(run.name))continue;
  const row={name:run.name,status:run.status,conclusion:run.conclusion||null,url:run.details_url,startedAt:run.started_at,completedAt:run.completed_at};jobs.push(row);
  if(run.status==='completed'&&run.conclusion==='success')continue;
  const broken=run.status==='completed'&&!['success','neutral','skipped'].includes(run.conclusion);
  // The aggregate is a consequence of shard failure, not a second source failure.
  const aggregate=hasMatrix&&run.name==='browser-check';
  const match=/\/actions\/runs\/[0-9]+\/job\/([0-9]+)$/.exec(run.details_url||'');
  let job;try{if(match)job=await api('actions/jobs/'+match[1]);}catch{}
  if(!job||job.head_sha!==commit||job.name!==run.name){if(broken&&!aggregate)kinds.push('unknown');continue;}
  row.attempt=job.run_attempt;
  const active=job.steps?.find(s=>s.status==='in_progress');
  if(active){row.step=active.name;row.stage=setupStep.test(active.name)?'Đang chuẩn bị Chromium':testStep.test(active.name)?'Đang chạy kiểm thử giao diện':'Đang chuẩn bị môi trường CI';}
  if(!broken)continue;
  const step=job.steps?.find(s=>s.status==='completed'&&['failure','timed_out','cancelled'].includes(s.conclusion));
  row.failedStep=step?.name;
  if(aggregate){row.stage='Thiếu kết quả desktop/mobile hoặc tổng hợp bằng chứng thất bại';continue;}
  const testsStarted=job.steps?.some(s=>testStep.test(s.name)&&(s.status==='in_progress'||s.status==='completed'&&s.conclusion!=='skipped'));
  let log;try{if(step)log=await api('actions/jobs/'+match[1]+'/logs',true);}catch{}
  const diagnosed=classifyCiLog(log,commit,run.name!=='writer-check');
  const kind=diagnosed||(step?.name==='Verify CI configuration'?'configuration':null)||(step&&setupStep.test(step.name)&&!testsStarted?'infrastructure':'unknown');
  row.failureKind=kind;row.stage=kind==='configuration'?'Cấu hình CI không tương thích; cần đồng bộ công cụ/fixture':kind==='infrastructure'?'Lỗi chuẩn bị Chromium/môi trường; chưa chạy test':kind==='test'?'Kiểm thử giao diện thất bại':kind==='code'?'Kiểm tra code thất bại':'Chưa xác định nguyên nhân; cần xem bước lỗi';kinds.push(kind);
 }
 // Do not hide independent failures or a broken aggregate whose shards all passed.
 const otherFailure=[...latest.values()].some(r=>r.status==='completed'&&!['success','neutral','skipped'].includes(r.conclusion)&&!['writer-check','browser-check'].includes(r.name)&&!matrixName.test(r.name));
 const aggregate=latest.get('browser-check');
 if(hasMatrix&&aggregate?.status==='completed'&&!['success','neutral','skipped'].includes(aggregate.conclusion)&&!kinds.length)kinds.push('unknown');
 if(otherFailure)kinds.push('unknown');
 const failureKind=!kinds.length?undefined:kinds.includes('unknown')?'unknown':kinds.includes('configuration')?'configuration':kinds.includes('test')?'test':kinds.includes('code')?'code':'infrastructure';
 return {jobs,failureKind};
}
