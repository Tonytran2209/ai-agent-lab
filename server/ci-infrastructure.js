// Read-only diagnosis of the current GitHub Actions browser jobs. Never marks CI green.
export async function ciInfrastructure(api,response,commit){
 const latest=new Map();
 for(const run of response.check_runs||[]){if(run.head_sha!==commit||run.app?.slug!=='github-actions'||!/^browser-tests \((desktop|mobile)\)$/.test(run.name))continue;const old=latest.get(run.name);if(!old||Number(run.id)>Number(old.id))latest.set(run.name,run);}
 const jobs=[];let failed=0,infrastructure=0,unknown=false;
 for(const run of latest.values()){
  const row={name:run.name,status:run.status,conclusion:run.conclusion||null,url:run.details_url,startedAt:run.started_at,completedAt:run.completed_at};jobs.push(row);
  if(run.status==='completed'&&run.conclusion==='success')continue;
  const match=new RegExp('/actions/runs/[0-9]+/job/([0-9]+)$').exec(run.details_url||'');
  const broken=run.status==='completed'&&!['success','neutral','skipped'].includes(run.conclusion);if(broken)failed++;
  if(!match){unknown=true;continue;}
  let job;try{job=await api('actions/jobs/'+match[1]);}catch{unknown=true;continue;}
  if(!job||job.head_sha!==commit||job.name!==run.name){unknown=true;continue;}
  const active=job.steps?.find(s=>s.status==='in_progress');
  if(active)row.stage=/playwright install|Prepare Chromium|install-deps/.test(active.name)?'Đang chuẩn bị Chromium':/playwright test|Run browser tests/.test(active.name)?'Đang chạy kiểm thử giao diện':'Đang chuẩn bị môi trường CI';
  if(broken){const step=job.steps?.find(s=>s.status==='completed'&&['failure','timed_out','cancelled'].includes(s.conclusion));const testsStarted=job.steps?.some(s=>/playwright test|Run browser tests/.test(s.name)&&(s.status==='in_progress'||s.status==='completed'&&s.conclusion!=='skipped'));if(step&&/playwright install|Prepare Chromium|install-deps|actions\/(setup-node|checkout)@/.test(step.name)&&!testsStarted){infrastructure++;row.stage='Lỗi chuẩn bị Chromium/môi trường; chưa chạy test';}else unknown=true;}
 }
 const otherFailure=(response.check_runs||[]).some(r=>r.head_sha===commit&&r.status==='completed'&&!['success','neutral','skipped'].includes(r.conclusion)&&r.name!=='browser-check'&&!/^browser-tests \(/.test(r.name));
 return {jobs,failureKind:failed>0&&failed===infrastructure&&!unknown&&!otherFailure?'infrastructure':undefined};
}
