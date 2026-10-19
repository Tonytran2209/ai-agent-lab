export function assessCi(response, statuses, commit) {
  if (response.total_count > 100) throw new Error('Quá nhiều checks; cần kiểm tra thủ công.');
  const latest=new Map();
  for(const r of response.check_runs||[]){const key=(r.app?.id||r.app?.slug)+':'+r.name;const old=latest.get(key);if(!old||r.id>old.id)latest.set(key,r);}
  const runs=[...latest.values()], required=['writer-check','browser-check'].map(name=>runs.find(r=>r.name===name&&r.app?.slug==='github-actions'&&r.head_sha===commit));
  const failed=runs.some(r=>r.status==='completed'&&!['success','neutral','skipped'].includes(r.conclusion))||(statuses.statuses||[]).some(s=>['error','failure'].includes(s.state));
  return {failed,ready:!failed&&required.every(r=>r?.status==='completed'&&r.conclusion==='success')&&runs.every(r=>r.status==='completed')&&!(statuses.statuses||[]).some(s=>s.state==='pending'),evidenceUrl:required[1]?.details_url,missing:required.some(r=>!r)};
}
export const ciSetupPaths=['.github/workflows/agent-lab-ci.yml','playwright.agent-lab.config.mjs','tests/agent-lab/server.mjs','tests/agent-lab/fixture.jsx','tests/agent-lab/draft.spec.mjs'];
