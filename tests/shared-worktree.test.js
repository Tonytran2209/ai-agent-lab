import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {sharedWorktree} from '../mac/shared-worktree.js';import {command} from '../mac/runner.js';
test('one project worktree survives survey, implementation and next task; dirty work is preserved',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'direct-worktree-')),repo=path.join(root,'repo'),state=path.join(root,'state');await mkdir(repo);
 const git=(args,cwd=repo)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8'}).trim();
 try{git(['init']);git(['config','user.name','Test']);git(['config','user.email','test@example.com']);await writeFile(path.join(repo,'code.txt'),'base\n');git(['add','.']);git(['commit','-m','base']);const base=git(['rev-parse','HEAD']),cfg={repoPath:repo,stateDir:state};
 const first=await sharedWorktree(cfg,base,command);git(['switch','-c','lab/REQ-ABCDEF12-123'],first);await writeFile(path.join(first,'code.txt'),'updated\n');
 await assert.rejects(()=>sharedWorktree(cfg,base,command),/chưa lưu/);assert.equal(await readFile(path.join(first,'code.txt'),'utf8'),'updated\n');git(['add','.'],first);git(['commit','-m','implementation'],first);
 const second=await sharedWorktree(cfg,base,command);assert.equal(second,first);assert.equal(git(['rev-parse','HEAD'],second),base);assert.equal((git(['worktree','list','--porcelain']).match(/^worktree /gm)||[]).length,2);
 const other=path.join(root,'other');await mkdir(other);git(['init'],other);await assert.rejects(()=>sharedWorktree({repoPath:other,stateDir:state},base,command),/repo khác/);
 }finally{await rm(root,{recursive:true,force:true});}
});
