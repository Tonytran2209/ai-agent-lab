// Explicit display-only projection. Never return evidence, prompts or claim tokens.
const fields=['id','projectId','repository','branch','title','feedback','author','status','createdAt','updatedAt','archivedAt','baseCommit','workflowProtocol'];
const nested={draft:['risk'],classification:['risk'],preparation:['status','engine','startedAt'],release:['phase','librarySync','mergeCommit','lease.expiresAt'],delivery:['phase','approvalHash'],ciRepair:['phase','lease.expiresAt'],verification:['phase','lease.expiresAt'],recheck:['phase','lease.expiresAt'],lease:['expiresAt'],stopControl:['pending']};
const projection=[...fields.map(k=>`'${k}',json_extract(data,'$.${k}')`),...Object.entries(nested).map(([k,keys])=>`'${k}',CASE WHEN json_type(data,'$.${k}') IS NULL OR json_type(data,'$.${k}')='null' THEN NULL ELSE json_object(${keys.map(v=>`'${v.split('.')[0]}',${v.includes('.')?`CASE WHEN json_type(data,'$.${k}.lease')='object' THEN json_object('expiresAt',json_extract(data,'$.${k}.${v}')) ELSE NULL END`:`json_extract(data,'$.${k}.${v}')`}`).join(',')}) END`),"'approval',CASE WHEN json_type(data,'$.approval')='object' THEN json('{}') ELSE NULL END","'result',CASE WHEN json_type(data,'$.result')='object' THEN json('{}') ELSE NULL END"].join(',');
export function requestIndexRows(db){return db.prepare(`SELECT rowid AS cursor,json_object(${projection}) AS data FROM requests ORDER BY rowid DESC`).all().map(row=>({cursor:row.cursor,request:JSON.parse(row.data)}));}
export function requestIndexPage(rows,user,{before,limit=200,includeArchived=false}={}){
 const visible=rows.filter(({request:r})=>(user.role==='admin'||r.author===user.name)&&(!r.archivedAt||user.role==='admin'&&includeArchived));
 const page=visible.filter(r=>!before||r.cursor<before).slice(0,limit+1),more=page.length>limit;page.length=Math.min(page.length,limit);
 return {requests:page.map(r=>r.request),total:visible.length,nextBefore:more?page.at(-1).cursor:null};
}
