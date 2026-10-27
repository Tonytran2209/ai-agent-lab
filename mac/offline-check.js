import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import {offlineSpecs} from '../server/recheck-policy.js';
// Execute committed tests, never a model-supplied shell/heredoc or generated extraction.
export async function offlineCheck(r,worktree,run,env,signal){
 const specs=offlineSpecs(r);if(!specs.length||specs.length>3)throw Error('Thiếu offline spec đã được duyệt.');
 const dir=await mkdtemp(path.join(os.tmpdir(),'lab-offline-'));
 try{
 const config=path.join(dir,'playwright.config.mjs'),report=path.join(dir,'report.json');
 const disabledBrowser=path.join(dir,'browser-disabled');
 await writeFile(config,`export default ${JSON.stringify({testDir:path.join(worktree,'tests'),testMatch:specs.map(p=>path.join(worktree,p)),workers:1,retries:0,timeout:30000,globalTimeout:120000,outputDir:path.join(dir,'results'),reporter:'json',projects:[{name:'contract',use:{launchOptions:{executablePath:disabledBrowser},trace:'off',video:'off',screenshot:'off'}}]})};`,{mode:0o600});
 const result=await run(process.execPath,[path.join(worktree,'node_modules/@playwright/test/cli.js'),'test','--config',config,'--grep','[Oo][Ff][Ff][Ll][Ii][Nn][Ee]'],{cwd:worktree,env:{...env,PLAYWRIGHT_JSON_OUTPUT_FILE:report},signal,timeout:150000});
 let data;try{data=JSON.parse(await readFile(report,'utf8'));}catch{return {command:'lab:offline-check',passed:false,output:'Offline suite did not return a valid report on '+r.result.commit};}
 const records=[];function visit(s){for(const spec of s.specs||[])for(const t of spec.tests||[])records.push({title:spec.title,status:t.status,results:t.results||[]});for(const child of s.suites||[])visit(child);}visit(data);
 const passed=result.code===0&&!data.errors?.length&&records.length>0&&records.every(t=>t.status==='expected'&&t.results.length===1&&t.results[0].status==='passed');
 return {command:'lab:offline-check',passed,output:'Independent committed offline suite on '+r.result.commit+'; tests '+records.length+'; no browser executable available; '+(passed?'passed':'failed or skipped')};
 }finally{await rm(dir,{recursive:true,force:true});}
}
