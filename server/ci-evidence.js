export function assessCi(response, statuses, commit, policy={}) {
  if (response.total_count > 100) throw new Error('Quá nhiều checks; cần kiểm tra thủ công.');
  const latest=new Map();
  for(const r of response.check_runs||[]){const key=(r.app?.id||r.app?.slug)+':'+r.name;const old=latest.get(key);if(!old||Number(r.id||0)>Number(old.id||0))latest.set(key,r);}
  const names=policy.browserRequired===false?['writer-check']:['writer-check','browser-check'];
  const runs=[...latest.values()].filter(r=>policy.browserRequired!==false||!/^browser-(check|tests)(?: |$)/.test(r.name)), required=names.map(name=>runs.find(r=>r.name===name&&r.app?.slug==='github-actions'&&r.head_sha===commit));
  const byContext=new Map();for(const [index,s] of (statuses.statuses||[]).entries()){const key=s.context||'unknown:'+index;const old=byContext.get(key);if(!old||Number(s.id||0)>Number(old.id||0)||!s.id&&!old.id&&String(s.created_at||'')>String(old.created_at||''))byContext.set(key,s);}const currentStatuses=[...byContext.values()];
  const failures=runs.filter(r=>r.status==='completed'&&(!['success','neutral','skipped'].includes(r.conclusion)||['writer-check','browser-check'].includes(r.name)&&r.conclusion!=='success')).map(r=>({name:r.name,conclusion:r.conclusion,url:r.details_url}));
  const failed=runs.some(r=>r.status==='completed'&&!['success','neutral','skipped'].includes(r.conclusion))||currentStatuses.some(s=>['error','failure'].includes(s.state));
  failures.push(...currentStatuses.filter(s=>['error','failure'].includes(s.state)).map(s=>({name:s.context||'Commit status',conclusion:s.state,url:s.target_url})));
  const jobs=required.map((r,i)=>({name:names[i],status:r?.status||'missing',conclusion:r?.conclusion||null,url:r?.details_url,startedAt:r?.started_at,completedAt:r?.completed_at}));
  return {failed,failures,jobs,ready:!failed&&required.every(r=>r?.status==='completed'&&r.conclusion==='success')&&runs.every(r=>r.status==='completed')&&!currentStatuses.some(s=>s.state==='pending'),evidenceUrl:(required[1]||required[0])?.details_url,missing:required.some(r=>!r)};
}
export const ciSetupPaths=['.github/workflows/agent-lab-ci.yml','playwright.agent-lab.config.mjs','tests/agent-lab/server.mjs','tests/agent-lab/fixture.jsx','tests/agent-lab/draft.spec.mjs','tests/agent-lab/evidence-reporter.cjs'];
