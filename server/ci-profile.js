import crypto from 'node:crypto';
const path=p=>typeof p==='string'&&p.length<180&&/^[A-Za-z0-9_./-]+$/.test(p)&&!p.startsWith('/')&&!p.split('/').includes('..');
// Inspect bounded files at one immutable commit. Repo data cannot grant execution authority.
export async function readCiProfile(tree,github,commit){
 if(!tree.some(v=>v.path==='.agent-hub/ci-contract.json'&&v.type==='blob'))return undefined;
 const read=async p=>{let v;try{v=await github('contents/'+p+'?ref='+commit);}catch{throw Object.assign(Error('GitHub CI profile unavailable'),{ciReadUnavailable:true});}if(v.type!=='file'||v.encoding!=='base64'||v.size>300000)throw Error('Invalid CI profile file');return Buffer.from(v.content,'base64').toString('utf8');};
 try{
  const profile=JSON.parse(await read('.agent-hub/ci-contract.json'));
  if(profile.protocol!=='writer-ci-v1'||!['pinned-base','pinned-target'].includes(profile.toolsMode)||!/^\d+\.\d+\.\d+$/.test(profile.playwrightVersion))throw Error();
  const paths=[...(profile.toolsMode==='pinned-target'?['tests/agent-lab/sync-baseline-specs.mjs','tests/agent-lab/sync-baseline-specs.test.mjs']:[]),profile.workflow,profile.browserConfig,profile.fixtureBootstrap,profile.fixtureIsolation,'package-lock.json','tests/agent-lab/evidence-reporter.cjs','tests/agent-lab/merge-evidence.mjs','tests/agent-lab/merge-evidence.test.mjs','tests/agent-lab/infrastructure-retry.test.mjs'];
  if(paths.some(p=>!path(p)||!tree.some(v=>v.path===p&&v.type==='blob'&&/^[a-f0-9]{40}$/.test(v.sha))))throw Error();
  if(!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(profile.workflow)||!/^playwright(?:\.[\w-]+)?\.config\.[cm]?[jt]s$/.test(profile.browserConfig)||![profile.fixtureBootstrap,profile.fixtureIsolation].every(p=>/^tests\/(browser|agent-lab)\//.test(p)))throw Error();
  const workflow=await read(profile.workflow),lock=JSON.parse(await read('package-lock.json'));
  if(lock.packages?.['node_modules/@playwright/test']?.version!==profile.playwrightVersion||!workflow.includes('mcr.microsoft.com/playwright:v'+profile.playwrightVersion+'-noble')||!(profile.toolsMode==='pinned-target'?workflow.includes('needs.ci-tools.outputs.sha')&&workflow.includes('github.rest.git.getRef')&&workflow.includes("core.setOutput('sha', sha)"):workflow.includes('github.event.pull_request.base.sha || github.sha'))||!workflow.includes('path: .lab-ci-tools')||!workflow.includes('github.event.pull_request.head.sha || github.sha'))throw Error();
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(paths.map(p=>[p,tree.find(v=>v.path===p).sha]))).digest('hex');
  return {protocol:profile.protocol,status:'ready',fingerprint,playwrightVersion:profile.playwrightVersion,toolsMode:profile.toolsMode,workflow:profile.workflow,fixtureBootstrap:profile.fixtureBootstrap,fixtureIsolation:profile.fixtureIsolation};
 }catch(error){if(error.ciReadUnavailable)throw error;return {protocol:'writer-ci-v1',status:'configuration',reason:'CI contract thiếu file, sai đường dẫn hoặc không khớp Playwright/workflow.'};}
}
