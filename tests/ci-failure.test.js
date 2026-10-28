import {test} from 'node:test';import assert from 'node:assert/strict';import {classifyCiLog} from '../server/ci-failure.js';
const sha='a'.repeat(40);
test('missing CI tools and image mismatches are configuration errors, never coding attempts',()=>{for(const text of ["Could not find 'tests/agent-lab/merge-evidence.test.mjs'",'Cannot find module .lab-ci-tools/tests/agent-lab/evidence-reporter.cjs','Playwright image/package mismatch: 1.65.0','fatal: detected dubious ownership','No tests found'])assert.equal(classifyCiLog(text,sha,true),'configuration');});
test('only matching failed browser records or explicit assertions count as test failures',()=>{const row={protocol:'lab-test-v1',commit:sha,project:'mobile',file:'tests/browser/draft.spec.ts',status:'failed'};assert.equal(classifyCiLog('LAB_TEST_V1 '+JSON.stringify(row),sha,true),'test');assert.equal(classifyCiLog('LAB_TEST_V1 '+JSON.stringify({...row,commit:'b'.repeat(40)}),sha,true),null);assert.equal(classifyCiLog('Error: expect(locator).toHaveCSS(expected) failed',sha,true),'test');assert.equal(classifyCiLog('Process exited with code 1',sha,true),null);});
test('compiler failures are code, missing browser libraries are infrastructure, unknown logs stay unknown',()=>{assert.equal(classifyCiLog('error TS2322: Type mismatch',sha,false),'code');assert.equal(classifyCiLog("Executable doesn't exist at /ms-playwright/chromium",sha,true),'infrastructure');assert.equal(classifyCiLog('provider stream text',sha,false),null);assert.equal(classifyCiLog({},sha,false),null);});

test('successful preflight command source and GitHub group metadata never masquerade as runtime errors',()=>{
 const echo=`2026-10-28T03:08:54.2114955Z ##[group]Run node -e "const v = require('@playwright/test/package.json').version; if (v !== '1.64.1') throw Error('Playwright image/package mismatch: ' + v)"\n2026-10-28T03:08:54.2116230Z \x1b[36;1mnode -e "const v = require('@playwright/test/package.json').version; if (v !== '1.64.1') throw Error('Playwright image/package mismatch: ' + v)"\x1b[0m\n2026-10-28T03:08:54.2116330Z ##[endgroup]`;
 assert.equal(classifyCiLog(echo,sha,true),null);
 const record={protocol:'lab-test-v1',commit:sha,project:'desktop',file:'tests/agent-lab/sidebar-scroll.spec.mjs',status:'timedOut'};
 assert.equal(classifyCiLog(echo+'\n2026-10-28T03:11:40.0355209Z LAB_TEST_V1 '+JSON.stringify(record),sha,true),'test');
 assert.equal(classifyCiLog('##[group]Run echo "No tests found"\necho "No tests found"',sha,true),null);
 assert.equal(classifyCiLog('✓ tests/agent-lab/contract.spec.mjs CI contract handles missing inputs',sha,true),null);
 assert.equal(classifyCiLog('##[command]node -e "throw Error(\"Executable doesn\'t exist\")"',sha,true),null);
});
test('real timestamped and ANSI diagnostics still block incompatible CI without a coding retry',()=>{
 for(const line of ['Error: Playwright image/package mismatch: 1.65.0',"Error [ERR_MODULE_NOT_FOUND]: Cannot find module .lab-ci-tools/tests/agent-lab/evidence-reporter.cjs",'##[error]No tests found','fatal: detected dubious ownership in repository','Error: CI contract missing pinned fixture'])assert.equal(classifyCiLog('2026-10-28T03:08:54.2114955Z \x1b[31m'+line+'\x1b[0m',sha,true),'configuration',line);
 assert.equal(classifyCiLog('Error: browserType.launch: Executable doesn\'t exist at /ms-playwright/chromium',sha,true),'infrastructure');
 assert.equal(classifyCiLog('/ms-playwright/chrome: error while loading shared libraries: libfoo.so',sha,true),'infrastructure');
});
test('failure-looking test titles, quoted source, passing or foreign records cannot grant known failure authority',()=>{
 const row={protocol:'lab-test-v1',commit:sha,project:'mobile',file:'tests/agent-lab/contract.spec.mjs',status:'passed',title:'No tests found, CI contract and Playwright image/package mismatch: fixture cases'};
 assert.equal(classifyCiLog('LAB_TEST_V1 '+JSON.stringify(row),sha,true),null);
 assert.equal(classifyCiLog('console.log("Error: expect(locator).toHaveCSS(expected) failed")',sha,true),null);
 assert.equal(classifyCiLog('##[group]Run echo "AssertionError"',sha,false),null);
 assert.equal(classifyCiLog('src/App.tsx(12,3): error TS2322: incompatible value',sha,false),'code');
});
