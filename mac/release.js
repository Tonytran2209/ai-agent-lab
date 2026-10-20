import {assessCi} from '../server/ci-evidence.js';
import { matchesProject } from './projects.js';
import path from 'node:path';
// This publisher runs on Mac after admin acceptance. Coding subprocesses never receive its credentials.
export function githubClient(run, ghPath, env, signal) {
  if (!path.isAbsolute(ghPath) || !/^[A-Za-z0-9_/. -]+$/.test(ghPath)) throw new Error('ghPath phải là đường dẫn tuyệt đối.');
  return async (endpoint, method = 'GET', body) => {
    const args = ['api', '--method', method, endpoint, ...(body ? ['--input', '-'] : [])];
    const r = await run(ghPath, args, { env, signal, input: body ? JSON.stringify(body) : undefined, timeout: 120000 });
    if (r.code) throw new Error('GitHub API thất bại: ' + method + ' ' + endpoint.split('?')[0]);
    return r.stdout.trim() ? JSON.parse(r.stdout) : {};
  };
}
export function latestChecks(runs) {
  // GitHub can return several check suites for the same head after reopening/rerunning a PR.
  const newest=new Map();
  for(const run of runs){const key=(run.app?.id||run.app?.slug||"unknown")+":"+run.name;const old=newest.get(key);if(!old||Number(run.id||0)>Number(old.id||0))newest.set(key,run);}
  return [...newest.values()];
}
export async function publishStep({ request: r, config, run, api, signal, purpose = "release" }) {
  const repo = config.repository || 'Tonytran2209/RebuildWriterStudioTool';
  const baseBranch = r.branch || config.branch || 'main';
  if (r.repository !== repo || config.projectId && r.projectId !== config.projectId || r.status !== (purpose === 'verification' ? 'verifying' : 'completed') || !r.release || !/^[a-f0-9]{40}$/.test(r.result?.commit)) throw new Error('Sai repository hoặc quyền phát hành.');
  const release = r.release, prefix = 'repos/' + repo;
  const git = async args => {
    const out = await run('git', ['-C', config.repoPath, ...args], { env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !['AI_AGENT_LAB_MCP_TOKEN', 'MCP_TOKEN'].includes(key))), signal, timeout: 120000 });
    if (out.code) throw new Error('Git phát hành thất bại: ' + args[0]);
    return out.stdout.trim();
  };
  if (!['https://github.com/' + repo + '.git', 'https://github.com/' + repo, 'git@github.com:' + repo + '.git'].includes(await git(['remote', 'get-url', 'origin']))) throw new Error('Remote không khớp repository của project.');
  if (release.phase === 'queued') {
    const branch = r.result.localArtifact?.branch;
    if (!branch || !new RegExp('^lab/' + r.id + '-[0-9]+$').test(branch)) throw new Error('Thiếu nhánh cục bộ hợp lệ.');
    if (await git(['rev-parse', 'refs/heads/' + branch]) !== r.result.commit) throw new Error('Nhánh không khớp commit đã nghiệm thu.');
    if (await git(['rev-parse', r.result.commit + '^']) !== r.baseCommit) throw new Error('Commit có lịch sử khác base đã duyệt.');
    const files = (await git(['diff', '--name-only', '--no-renames', r.baseCommit, r.result.commit])).split('\n').filter(Boolean).sort();
    if (!files.length || files.some(p => !r.draft.allowedPaths.includes(p)) || JSON.stringify(files) !== JSON.stringify([...r.result.changedPaths].sort())) throw new Error('Diff không khớp phạm vi đã nghiệm thu.');
    const helper = '!' + (config.ghPath || '/opt/homebrew/bin/gh') + ' auth git-credential';
    // Fast-forward only; never force-push or touch main directly.
    await git(['-c', 'credential.helper=', '-c', 'credential.helper=' + helper, 'push', 'origin', 'refs/heads/' + branch + ':refs/heads/' + branch]);
    let prs = await api(prefix + '/pulls?state=all&head=' + encodeURIComponent(repo.split('/')[0]) + ':' + encodeURIComponent(branch) + '&base=' + encodeURIComponent(baseBranch));
    let pr = prs.find(p => p.head.sha === r.result.commit && (p.state === 'open' || p.merged_at));
    if (!pr) {
      if (prs.length) throw new Error('Nhánh đã có PR bị đóng hoặc thay đổi. Cần kiểm tra thủ công.');
      pr = await api(prefix + '/pulls', 'POST', { head: branch, base: baseBranch, title: '[' + r.id + '] ' + r.title.slice(0, 180),
        body: (purpose === 'verification' ? 'Draft PR để CI kiểm tra trước nghiệm thu. Chưa được merge/deploy.\n\n' : 'Admin đã nghiệm thu trong AI Agent Lab.\n\n') + r.result.summary + '\n\nPhạm vi: ' + files.join(', ') + '\n\nKiểm tra cục bộ do agent báo cáo; CI GitHub phải đạt trước khi merge.', draft: purpose === "verification" });
    }
    return { phase: 'ci', prNumber: pr.number, prUrl: pr.html_url, note: 'Đã đẩy nhánh và tạo PR #' + pr.number + '. Đang chờ CI.' };
  }
  if (release.phase === 'ci') {
    const pr = await api(prefix + '/pulls/' + release.prNumber);
    if (pr.head?.sha !== r.result.commit || pr.base?.ref !== baseBranch || pr.base?.repo?.full_name !== repo || pr.head?.repo?.full_name!==repo) throw new Error('PR đã đổi head/base sau nghiệm thu.');
    const prFiles = await api(prefix + '/pulls/' + release.prNumber + '/files?per_page=100');
    if (pr.changed_files !== prFiles.length || prFiles.some(f => !r.draft.allowedPaths.includes(f.filename)||f.previous_filename&&!r.draft.allowedPaths.includes(f.previous_filename)) || JSON.stringify(prFiles.map(f=>f.filename).sort())!==JSON.stringify([...r.result.changedPaths].sort())) throw new Error('PR chứa file ngoài phạm vi.');
    if (purpose === 'verification' && (pr.merged || pr.state !== 'open')) throw new Error('PR kiểm tra đã bị đóng hoặc merge ngoài luồng.');
    if (pr.merged) return { phase: 'deploying', mergeCommit: pr.merge_commit_sha, note: 'PR đã merge. Đang xác nhận Railway deploy đúng commit.' };
    if (pr.state !== 'open') throw new Error('PR đã đóng mà chưa merge.');
    const response = await api(prefix + '/commits/' + r.result.commit + '/check-runs?per_page=100');
    const checks = {...response,check_runs:latestChecks(response.check_runs)};
    const statuses = await api(prefix + '/commits/' + r.result.commit + '/status');
    if (checks.total_count > 100) throw new Error('Quá nhiều CI checks; cần kiểm tra thủ công.');
    const required = checks.check_runs.find(c => c.name === 'writer-check' && c.app?.slug === 'github-actions');
    const browser = checks.check_runs.find(c => c.name === 'browser-check' && c.app?.slug === 'github-actions');
    if(config.ciReady===false&&!required&&!browser)throw new Error('Project chưa có writer-check và browser-check. Cần bổ sung CI hoặc admin xác minh trình duyệt thực tế trước nghiệm thu.');
    const evidence=assessCi(response,statuses,r.result.commit);
    if(evidence.failed || browser?.status==='completed'&&browser.conclusion!=='success' || required?.status==='completed'&&required.conclusion!=='success')throw new Error('CI không đạt. Giữ PR để kiểm tra, không merge.');
    if(!evidence.ready || pr.mergeable===null){
      if(Date.now()-Date.parse(release.phaseStartedAt||release.authorizedAt)>30*60000)throw new Error('Hết thời gian chờ CI. Kiểm tra PR rồi thử phát hành lại.');
      return {phase:'ci',note:'Đang chờ writer-check và browser-check đạt trên đúng commit.'};
    }
    if (purpose === 'verification') return {phase:'passed',evidenceUrl:browser.details_url,note:'writer-check và browser-check đã đạt trên đúng commit. Chờ admin nghiệm thu tiêu chí của request; chưa merge/deploy.'};
    if (pr.draft) {
      await api('graphql','POST',{query:'mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{id}}}',variables:{id:pr.node_id}});
      return {phase:'ci',note:'Admin đã nghiệm thu; draft PR đã chuyển sang ready. Đang chờ GitHub xác nhận điều kiện merge.'};
    }
    if (!pr.mergeable || pr.mergeable_state === 'blocked' || pr.mergeable_state === 'behind') throw new Error('PR xung đột, chưa đủ điều kiện hoặc cần cập nhật main. Không tự xử lý xung đột.');
    const merged = await api(prefix + '/pulls/' + release.prNumber + '/merge', 'PUT', { sha: r.result.commit, merge_method: 'squash' });
    if (!merged.merged) throw new Error('GitHub chưa cho phép merge PR.');
    return { phase: 'deploying', mergeCommit: merged.sha, note: 'CI đã đạt; đã merge main. Đang chờ Railway deploy đúng commit.' };
  }
  if (release.phase === 'deploying') {
    if (!config.releaseEnvironment) throw new Error('Thiếu releaseEnvironment của Railway trên Mac.');
    const deployments = await api(prefix + '/deployments?sha=' + release.mergeCommit + '&per_page=100');
    const deployment = deployments.find(d => d.sha === release.mergeCommit && d.environment === config.releaseEnvironment && d.creator?.login === 'railway-app[bot]');
    if (deployment) {
      const states = await api(prefix + '/deployments/' + deployment.id + '/statuses');
      if (states[0]?.state === 'success') return { phase: 'deployed', deploymentUrl: states[0].environment_url || states[0].target_url,
        note: 'Railway xác nhận deploy thành công commit ' + release.mergeCommit.slice(0, 12) + '.' };
      if (['failure', 'error'].includes(states[0]?.state)) throw new Error('Railway deploy lỗi. Code đã merge main; cần kiểm tra deployment, không merge lại.');
    }
    if (Date.now() - Date.parse(release.phaseStartedAt || release.updatedAt) > 30 * 60000) throw new Error('Chưa có xác nhận Railway cho đúng commit sau 30 phút. Main đã cập nhật; kiểm tra Railway rồi thử theo dõi lại.');
    return { phase: 'deploying', note: 'Main đã cập nhật. Đang chờ Railway báo trạng thái theo đúng merge commit.' };
  }
  throw new Error('Sai giai đoạn phát hành.');
}
export async function pollReleases(config, token, run, signal, onPullRequest = async () => {}) {
  if (config.releaseEnabled !== true) return;
  const endpoint = new URL('/runner/releases', config.mcpUrl);
  const request = async (suffix = '', body) => {
    const res = await fetch(endpoint.href + suffix, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error('Release API: ' + res.status);
    return res.json();
  };
  const { requests } = await request();
  for (const row of [...requests].reverse()) {
    if (signal?.aborted) return;
    if (!matchesProject(row,config)) continue;
    let claimed;
    try { claimed = await request('/' + row.id + '/claim', {}); } catch { continue; }
    let update;
    try {
      const env = { ...process.env }; delete env.AI_AGENT_LAB_MCP_TOKEN; delete env.MCP_TOKEN;
      update = await publishStep({ request: claimed.request, config, run, signal, api: githubClient(run, config.ghPath || '/opt/homebrew/bin/gh', env, signal) });
      if (update.prUrl) await onPullRequest(update.prUrl);
    } catch (e) { update = { phase: 'failed', note: String(e.message).slice(0, 2000) }; }
    await request('/' + row.id + '/report', { releaseToken: claimed.releaseToken, update });
    return; // One release stage per poll; all remote operations are idempotent across retries.
  }
}
