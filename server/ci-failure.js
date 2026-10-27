// Persist categories only. Never expose or retain raw GitHub logs in request diagnostics.
export function classifyCiLog(log,commit,isBrowser){
 if(typeof log!=='string'||log.length>2000000)return null;
 const text=log.slice(-500000);
 if(/(?:Could not find|Cannot find module)[^\n]*(?:tests\/agent-lab|lab-ci-tools|playwright[^\n]*config|evidence-reporter)|No tests found|Playwright image\/package mismatch|detected dubious ownership|CI contract/i.test(text))return 'configuration';
 if(/Executable doesn't exist|Host system is missing dependencies|error while loading shared libraries|browserType\.launch[^\n]*(?:Permission denied|Operation not permitted)/i.test(text))return 'infrastructure';
 if(isBrowser){
  for(const line of text.split('\n').filter(l=>l.includes('LAB_TEST_V1 '))){try{const row=JSON.parse(line.slice(line.indexOf('LAB_TEST_V1 ')+12));if(row.protocol==='lab-test-v1'&&row.commit===commit&&['desktop','mobile'].includes(row.project)&&['failed','timedOut'].includes(row.status)&&/^tests\/(browser|agent-lab)\//.test(row.file))return 'test';}catch{}}
  if(/Error: expect\(|AssertionError|ERR_TEST_FAILURE/.test(text))return 'test';
 }else if(/error TS\d+|TS\d+:|AssertionError|ERR_TEST_FAILURE|not ok \d+|\[vite:[^\]]+\]/.test(text))return 'code';
 return null;
}
