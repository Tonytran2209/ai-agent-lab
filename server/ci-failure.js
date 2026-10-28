// Persist categories only. Never expose or retain raw GitHub logs in request diagnostics.
// GitHub prints command source as well as output. Only diagnostic lines are evidence:
// a quoted throw in a successful preflight is not an actual image mismatch.
export function classifyCiLog(log,commit,isBrowser){
 if(typeof log!=='string'||log.length>2000000)return null;
 const lines=log.slice(-500000).replace(/\x1b\[[0-9;]*m/g,'').split('\n').map(line=>line.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s*/, '').trim()).filter(line=>!/^##\[(?:group|endgroup|command|debug)\]/.test(line));
 const diagnostics=lines.map(line=>line.replace(/^##\[error\]\s*/,''));
 const config=/^(?:(?:Error(?: \[[^\]]+\])?|error):\s*)?(?:(?:Could not find|Cannot find module)\b[^\n]*(?:tests\/agent-lab|lab-ci-tools|playwright[^\n]*config|evidence-reporter)|No tests found\b|Playwright image\/package mismatch:\s*\S|CI contract\b[^\n]*(?:missing|invalid|mismatch|not found|thiếu|không hợp lệ))/i;
 if(diagnostics.some(line=>config.test(line)||/^(?:fatal:\s*)?detected dubious ownership\b/i.test(line)))return 'configuration';
 if(diagnostics.some(line=>/^(?:Error:\s*)?(?:browserType\.launch:\s*)?(?:Executable doesn't exist\b|Host system is missing dependencies\b)|^\S+: error while loading shared libraries:|^(?:Error:\s*)?browserType\.launch[^\n]*(?:Permission denied|Operation not permitted)/i.test(line)))return 'infrastructure';
 if(isBrowser){
  for(const line of lines.filter(l=>l.startsWith('LAB_TEST_V1 '))){try{const row=JSON.parse(line.slice(12));if(row.protocol==='lab-test-v1'&&row.commit===commit&&['desktop','mobile'].includes(row.project)&&['failed','timedOut'].includes(row.status)&&/^tests\/(browser|agent-lab)\//.test(row.file))return 'test';}catch{}}
  if(diagnostics.some(line=>/^(?:Error: expect\(|AssertionError\b|ERR_TEST_FAILURE\b|Error: (?:locator\.[A-Za-z]+|page\.[A-Za-z]+):.*(?:timeout|failed)|Test timeout of \d+ms exceeded)/i.test(line)))return 'test';
 }else if(diagnostics.some(line=>/^(?:.*\([0-9]+,[0-9]+\): )?error TS\d+|^TS\d+:|^AssertionError\b|^ERR_TEST_FAILURE\b|^not ok \d+|^(?:error during build:|\[vite:[^\]]+\])/.test(line)))return 'code';
 return null;
}
