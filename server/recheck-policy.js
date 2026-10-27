export const offlineContractCheck = 'playwright offline Gate3 and Threads contracts';
const legacyOfflineLabels = new Set([
 'node --input-type=module (inline offline contract harness, initial attempt missing label dependency)',
 'node --input-type=module (corrected inline harness executing offlineGate3Contracts and offlineRefineContracts)',
]);
// Explicit compatibility mapping only; never execute model-provided inline JavaScript.
export const offlineContractRequest = r => r.repository==='Tonytran2209/intercom-writer-studio' && r.draft?.allowedPaths?.includes('tests/agent-lab/gate3-channels.spec.mjs');
// Labels are never executed. Only these exact command families can be rechecked.
export const canonicalCheck = command => legacyOfflineLabels.has(command)||command===offlineContractCheck?offlineContractCheck:/^(npm run (?:check|typecheck|build))(?: \([^()\r\n]*\))?$/.exec(command)?.[1] || (command==='git diff --check'?command:null);
export const recoverableArtifact = r => r.status==='failed' && Boolean(r.result?.localArtifact) && r.result.checks.some(c=>!c.passed) && r.result.checks.every(c=>c.passed||canonicalCheck(c.command) && (canonicalCheck(c.command)!==offlineContractCheck||offlineContractRequest(r)));
export const rerunCommands = r => [...new Set(r.result.checks.filter(c=>!c.passed).map(c=>canonicalCheck(c.command)).filter(c=>c&&c!=='git diff --check'&&c!=='npm run check'))];
export const reportedRetryPassed = r => recoverableArtifact(r) && rerunCommands(r).length>0 && r.result.checks.filter(c=>!c.passed).every(c=>r.result.checks.slice(r.result.checks.indexOf(c)+1).some(later=>later.passed&&canonicalCheck(later.command)===canonicalCheck(c.command)));
