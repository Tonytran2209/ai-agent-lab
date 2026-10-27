// Labels are never executed. Only these exact command families can be rechecked.
export const canonicalCheck = command => /^(npm run (?:check|typecheck|build))(?: \([^()\r\n]*\))?$/.exec(command)?.[1] || (command==='git diff --check'?command:null);
export const recoverableArtifact = r => r.status==='failed' && Boolean(r.result?.localArtifact) && r.result.checks.some(c=>!c.passed) && r.result.checks.every(c=>c.passed||canonicalCheck(c.command)||canRecheckInline(r)&&inlineOfflineHarness(c.command));
export const rerunCommands = r => [...new Set(r.result.checks.filter(c=>!c.passed).map(c=>canonicalCheck(c.command)).filter(c=>c&&c!=='git diff --check'&&c!=='npm run check')), ...(canRecheckInline(r)?['lab:offline-check']:[])];
export const reportedRetryPassed = r => recoverableArtifact(r) && rerunCommands(r).length>0 && r.result.checks.filter(c=>!c.passed).every(c=>inlineOfflineHarness(c.command)?canRecheckInline(r):r.result.checks.some(later=>later.passed&&canonicalCheck(later.command)===canonicalCheck(c.command)));

// This label is never executed. A fresh, isolated offline suite must replace it.
export const inlineOfflineHarness=c=>/^node --input-type=module \(heredoc[^\r\n]*\)$/i.test(c)&&/offline/i.test(c);
export const offlineSpecs=r=>(r.result?.changedPaths||[]).filter(p=>/^tests\/(?:agent-lab|browser)\/[A-Za-z0-9_-]+\.spec\.[cm]?[jt]sx?$/.test(p)&&r.draft?.allowedPaths.includes(p));
export const canRecheckInline=r=>r.workflowProtocol==='direct-v1'&&offlineSpecs(r).length>0&&offlineSpecs(r).length<=3&&r.result.checks.some(c=>!c.passed&&inlineOfflineHarness(c.command))&&r.result.checks.filter(c=>!c.passed&&inlineOfflineHarness(c.command)).every(c=>r.result.checks.some(later=>later.passed&&inlineOfflineHarness(later.command)));
