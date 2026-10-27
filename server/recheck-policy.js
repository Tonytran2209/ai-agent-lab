// Labels are never executed. Only these exact command families can be rechecked.
export const canonicalCheck = command => /^(npm run (?:check|typecheck|build))(?: \([^()\r\n]*\))?$/.exec(command)?.[1] || (command==='git diff --check'?command:null);
export const recoverableArtifact = r => r.status==='failed' && Boolean(r.result?.localArtifact) && r.result.checks.some(c=>!c.passed) && r.result.checks.every(c=>c.passed||canonicalCheck(c.command));
export const rerunCommands = r => [...new Set(r.result.checks.filter(c=>!c.passed).map(c=>canonicalCheck(c.command)).filter(c=>c&&c!=='git diff --check'&&c!=='npm run check'))];
export const reportedRetryPassed = r => recoverableArtifact(r) && rerunCommands(r).length>0 && r.result.checks.filter(c=>!c.passed).every(c=>r.result.checks.some(later=>later.passed&&canonicalCheck(later.command)===canonicalCheck(c.command)));
