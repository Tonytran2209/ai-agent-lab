import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,mkdir,symlink,rm,readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {managedMacFiles} from '../mac/install-files.js';
test('installer includes supervisor and complete local module dependencies while excluding config, credentials, state and symlinks',async()=>{
 const root=fileURLToPath(new URL('../mac/',import.meta.url)),files=await managedMacFiles(root);
 for(const file of ['supervisor.js','runner.js','planning.js','source-evidence.js','direct-survey.js','codex-events.js','install-files.js','direct-plan-schema.json'])assert.ok(files.includes(file),file);
 for(const file of files.filter(f=>f.endsWith('.js'))){const text=await readFile(root+'/'+file,'utf8');for(const match of text.matchAll(/from ['"]\.\/([^'"/]+\.js)['"]/g))assert.ok(files.includes(match[1]),file+' imports unpackaged '+match[1]);}
 const tmp=await mkdtemp('/tmp/lab-install-files-');try{await writeFile(tmp+'/config.local.json','secret');await writeFile(tmp+'/runner.js','code');await writeFile(tmp+'/direct-plan-schema.json','{}');await writeFile(tmp+'/mcp-token','secret');await mkdir(tmp+'/state');await symlink(tmp+'/runner.js',tmp+'/linked.js');assert.deepEqual(await managedMacFiles(tmp),['direct-plan-schema.json','runner.js']);}finally{await rm(tmp,{recursive:true,force:true});}
});
