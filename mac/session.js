import {readFile} from 'node:fs/promises';
import path from 'node:path';
// Exact request/job binding; never resume --last or another project's conversation.
export async function continuation(config,r,worktree){
 const job=r.ai?.planningJobId;
 if(r.workflowProtocol!=='direct-v1'||!job)return null;
 if(!/^[a-f0-9-]{36}$/.test(job))throw Error('Sai planning job của phiên Codex.');
 let v;try{v=JSON.parse(await readFile(path.join(config.stateDir,'planning',job+'-session.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(v.protocol!=='codex-continuity-v1'||v.requestId!==r.id||v.projectId!==r.projectId||v.repository!==r.repository||v.baseCommit!==r.baseCommit||v.libraryVersionId!==r.libraryVersionId||v.worktree!==worktree||!/^[a-f0-9-]{36}$/.test(v.sessionId)||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(v.model||''))throw Error('Phiên Codex không khớp request/base/worktree.');
 return v;
}
