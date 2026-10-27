import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {continuation} from '../mac/session.js';import {codexEvents} from '../mac/codex-events.js';
import {assessCi} from '../server/ci-evidence.js';
test('session events retain exact ID and continuation rejects cross-request or changed base',async()=>{
 const e=codexEvents(),id='12345678-1234-1234-1234-123456789abc';e.push(JSON.stringify({type:'thread.started',thread_id:id})+'\n');assert.equal(e.threadId(),id);
 const stateDir=await mkdtemp(path.join(os.tmpdir(),'continuity-'));try{
 const config={stateDir},r={id:'REQ-12345678',projectId:'test',repository:'Test/Repo',workflowProtocol:'direct-v1',baseCommit:'a'.repeat(40),libraryVersionId:'lib',ai:{planningJobId:id}},worktree=path.join(stateDir,'workspace');
 assert.equal(await continuation(config,r,worktree),null);await mkdir(path.join(stateDir,'planning'));
 await writeFile(path.join(stateDir,'planning',id+'-session.json'),JSON.stringify({protocol:'codex-continuity-v1',requestId:r.id,projectId:r.projectId,repository:r.repository,baseCommit:r.baseCommit,libraryVersionId:r.libraryVersionId,worktree,sessionId:id,model:'test-model'}));
 assert.equal((await continuation(config,r,worktree)).sessionId,id);
 await assert.rejects(continuation(config,{...r,id:'REQ-FFFFFFFF'},worktree));await assert.rejects(continuation(config,{...r,baseCommit:'b'.repeat(40)},worktree));await assert.rejects(continuation(config,r,worktree+'-other'));
 }finally{await rm(stateDir,{recursive:true,force:true});}
});
test('code-only CI still requires exact-head successful code check and does not claim browser proof',()=>{
 const sha='a'.repeat(40),check={id:1,name:'writer-check',app:{slug:'github-actions'},head_sha:sha,status:'completed',conclusion:'success',details_url:'https://github.com/Test/Repo/actions/runs/1/job/1'},v={total_count:1,check_runs:[check]};
 assert.equal(assessCi(v,{statuses:[]},sha).ready,false);
 const code=assessCi(v,{statuses:[]},sha,{browserRequired:false});assert.equal(code.ready,true);assert.deepEqual(code.jobs.map(j=>j.name),['writer-check']);assert.equal(code.evidenceUrl,check.details_url);
 assert.equal(assessCi(v,{statuses:[]},'b'.repeat(40),{browserRequired:false}).ready,false);
 assert.equal(assessCi({total_count:1,check_runs:[{...check,conclusion:'failure'}]},{statuses:[]},sha,{browserRequired:false}).ready,false);
});
