// Repository/branch lanes serialize the whole lifecycle, including CI, deploy and MD sync.
// Decisions and leases remain in SQLite; no process-local lock can grant authority.
export function queueSettled(r,project,currentCommit){
 if(r.stopControl?.pending)return false;
 if(r.planningLease||r.lease||r.ciRepair?.lease||r.verification?.lease||r.recheck?.lease||r.release?.lease||r.preparation?.status==='running')return false;
 if(r.status==='rejected')return true;
 if(r.release?.phase==='deployed'&&r.historicalDeployment)return true;
 if(r.release)return r.release.phase==='deployed'&&(r.release.librarySync==='synced'&&currentCommit!==r.baseCommit||currentCommit===r.release.mergeCommit);
 return r.status==='completed'&&!r.delivery?.approvalHash;
}
export function projectQueueState(r,rows,project,currentCommit){
 const same=v=>v.projectId===r.projectId||v.repository===r.repository&&v.branch===r.branch;
 const pending=rows.filter(v=>same(v)&&!queueSettled(v,project,currentCommit));
 // Drain work that was already prepared before this protocol was installed first.
 pending.sort((a,b)=>(b.queuePriority||0)-(a.queuePriority||0)||(a.queueTicket||0)-(b.queueTicket||0));
 const position=pending.findIndex(v=>v.id===r.id),head=pending[0];
 return {protocol:'project-fifo-v1',position:position<0?0:position+1,blocked:position>0,blockedBy:position>0?head.id:null,blockingStatus:position>0?(head.release?.phase||head.status):null,staleBase:position===0&&r.baseCommit!==currentCommit};
}
