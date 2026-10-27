import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {offlineCheck} from '../mac/offline-check.js';
const spec='tests/agent-lab/contracts.spec.mjs',r={result:{commit:'a'.repeat(40),changedPaths:[spec]},draft:{allowedPaths:[spec]}};
for(const mode of ['passed','failed','skipped','empty','invalid'])test('offline suite '+mode+' cannot run a model shell label or launch browser fixtures',async()=>{
 const result=await offlineCheck(r,'/tmp/committed-project',async(exe,args,opts)=>{
 assert.equal(exe,process.execPath);assert.ok(!args.join(' ').includes('heredoc'));const config=await readFile(args[args.indexOf('--config')+1],'utf8');assert.ok(!config.includes('webServer'));assert.ok(config.includes('browser-disabled'));assert.ok(config.includes('"name":"contract"'));
 if(mode==='invalid')return {code:1};await writeFile(opts.env.PLAYWRIGHT_JSON_OUTPUT_FILE,JSON.stringify({errors:[],suites:[{specs:mode==='empty'?[]:[{title:'OFFLINE contract',tests:[{status:mode==='passed'?'expected':mode==='skipped'?'skipped':'unexpected',results:[{status:mode==='passed'?'passed':mode}]}]}]}]}));return {code:mode==='failed'?1:0};
 },{},undefined);assert.equal(result.passed,mode==='passed');assert.equal(result.command,'lab:offline-check');
});
