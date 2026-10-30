import {z} from 'zod';
import {transaction} from './db.js';
import {fail} from './schemas.js';
export const notificationInput=z.object({clientId:z.string().uuid(),title:z.string().max(200).default(''),message:z.string().min(1).max(2500),type:z.enum(['info','success','warning','error']).default('info'),view:z.enum(['inbox','projects','library','memory','connection']).default('inbox'),requestId:z.string().regex(/^REQ-[A-F0-9]{8}$/).optional()}).strict();
const principal=user=>JSON.stringify([user.role,user.name]);
export function createNotificationCenter(db,{clock=()=>Date.now()}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS notification_log(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER UNIQUE,request_id TEXT,audience TEXT NOT NULL,owner TEXT,dedupe TEXT UNIQUE,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS notification_request ON notification_log(request_id,id);
 CREATE INDEX IF NOT EXISTS notification_owner ON notification_log(owner,id);
 CREATE TABLE IF NOT EXISTS notification_reads(owner TEXT PRIMARY KEY,read_id INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS notification_hidden(owner TEXT NOT NULL,notification_id INTEGER NOT NULL,PRIMARY KEY(owner,notification_id));
 CREATE TABLE IF NOT EXISTS notification_observers(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 DROP TRIGGER IF EXISTS notification_request_event;
 CREATE TRIGGER notification_request_event AFTER INSERT ON events BEGIN
 INSERT OR IGNORE INTO notification_log(event_id,request_id,audience,data) VALUES(NEW.id,NEW.request_id,'request',json_object('source','request','title',(SELECT substr(json_extract(data,'$.title'),1,200) FROM requests WHERE id=NEW.request_id),'eventType',json_extract(NEW.data,'$.type'),'actor',json_extract(NEW.data,'$.actor'),'message',substr(COALESCE(json_extract(NEW.data,'$.detail'),''),1,2500),'at',json_extract(NEW.data,'$.at'))); END;
 INSERT OR IGNORE INTO notification_log(event_id,request_id,audience,data)
 SELECT id,request_id,'request',json_object('source','request','title',(SELECT substr(json_extract(r.data,'$.title'),1,200) FROM requests r WHERE r.id=events.request_id),'eventType',json_extract(data,'$.type'),'actor',json_extract(data,'$.actor'),'message',substr(COALESCE(json_extract(data,'$.detail'),''),1,2500),'at',json_extract(data,'$.at')) FROM events WHERE id>COALESCE((SELECT MAX(event_id) FROM notification_log),0) ORDER BY id;`);
 // Whitelisted metadata only: no claim, provider credential, raw result or token fields.
 for(const [table,source,title] of [['project_onboarding','onboarding','Onboarding project'],['ci_setup_jobs','ci-setup','Thiết lập CI'],['deployment_onboarding','deployment-setup','Liên kết deploy']]){
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
  const project='NEW.project_id';
  const insert=`INSERT INTO notification_log(audience,data) VALUES('admin',json_object('source','${source}','view','projects','projectId',${project},'title','${title}','phase',json_extract(NEW.data,'$.phase'),'message',substr(COALESCE(json_extract(NEW.data,'$.note'),''),1,2500),'at',COALESCE(json_extract(NEW.data,'$.updatedAt'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))));`;
  db.exec(`CREATE TRIGGER IF NOT EXISTS notification_${table}_insert AFTER INSERT ON ${table} BEGIN ${insert} END;
  CREATE TRIGGER IF NOT EXISTS notification_${table}_update AFTER UPDATE ON ${table} WHEN COALESCE(json_extract(OLD.data,'$.phase'),'')!=COALESCE(json_extract(NEW.data,'$.phase'),'') OR COALESCE(json_extract(OLD.data,'$.note'),'')!=COALESCE(json_extract(NEW.data,'$.note'),'') BEGIN ${insert} END;`);
 }
 // Other settings screens use INSERT OR REPLACE. Inspect the previous row before replacement,
 // and only record phase changes, never evaluation cases, Lark payloads or provider responses.
 for(const [table,key,source,title,phase,project,note] of [
  ['library_maintenance','project_id','library','Đồng bộ MD',"json_extract(NEW.data,'$.phase')",'NEW.project_id',"json_extract(NEW.data,'$.note')"],
  ['learning_runs','id','learning','Đánh giá cải thiện',"json_extract(NEW.data,'$.phase')",'NEW.project_id',"''"],
  ['agent_evaluations','id','evaluation','Đánh giá model',"CASE WHEN json_extract(NEW.data,'$.error') IS NOT NULL THEN 'failed' WHEN json_extract(NEW.data,'$.passed')=1 THEN 'passed' ELSE 'needs-review' END","json_extract(NEW.data,'$.projectId')","''"],
  ['runner_controls','id','mac','Điều khiển Mac',"json_extract(NEW.data,'$.phase')","NULL","json_extract(NEW.data,'$.note')"],
  ['notification_outbox','id','lark','Thông báo Lark',"json_extract(NEW.data,'$.state')","NULL","''"]
 ]){
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
  const oldPhase=phase.replaceAll('NEW.data','prior.data'),oldNote=note.replaceAll('NEW.data','prior.data');
  db.exec(`CREATE TRIGGER IF NOT EXISTS notification_${table}_replace BEFORE INSERT ON ${table}
   WHEN NOT EXISTS(SELECT 1 FROM ${table} prior WHERE prior.${key}=NEW.${key} AND COALESCE(${oldPhase},'')=COALESCE(${phase},'') AND COALESCE(${oldNote},'')=COALESCE(${note},'')) BEGIN
   INSERT INTO notification_log(audience,data) VALUES('admin',json_object('source','${source}','view','${source==='library'?'library':'projects'}','projectId',${project},'title','${title}','phase',${phase},'message',substr(COALESCE(${note},''),1,2500),'at',strftime('%Y-%m-%dT%H:%M:%fZ','now'))); END;`);
 }
 const visibility=user=>({sql:`NOT EXISTS(SELECT 1 FROM notification_hidden h WHERE h.owner=? AND h.notification_id=n.id) AND ((n.audience='request' AND r.id IS NOT NULL AND (?=1 OR json_extract(r.data,'$.author')=?)) OR (n.audience='admin' AND ?=1) OR (n.audience='user' AND n.owner=?))`,args:[principal(user),Number(user.role==='admin'),user.name,Number(user.role==='admin'),principal(user)]});
 const add=(data,{audience='admin',owner=null,requestId=null,dedupe=null}={})=>db.prepare('INSERT OR IGNORE INTO notification_log(request_id,audience,owner,dedupe,data) VALUES(?,?,?,?,?)').run(requestId,audience,owner,dedupe,JSON.stringify(data));
 const from=' FROM notification_log n LEFT JOIN requests r ON r.id=n.request_id ';
 const maxVisible=user=>{const v=visibility(user);return db.prepare('SELECT COALESCE(MAX(n.id),0) AS id'+from+'WHERE '+v.sql).get(...v.args).id;};
 const readId=user=>{const owner=principal(user);db.prepare('INSERT OR IGNORE INTO notification_reads VALUES(?,?)').run(owner,maxVisible(user));return db.prepare('SELECT read_id FROM notification_reads WHERE owner=?').get(owner).read_id;};
 function observe(){
  const check=(key,value,data)=>{const old=db.prepare('SELECT value FROM notification_observers WHERE key=?').get(key)?.value,next=JSON.stringify(value);if(old===next)return;db.prepare('INSERT OR REPLACE INTO notification_observers VALUES(?,?)').run(key,next);add({...data,at:new Date(clock()).toISOString()});};
  const runner=JSON.parse(db.prepare("SELECT value FROM settings WHERE key='mac_runner'").get()?.value||'null');
  if(runner){const connected=runner.phase!=='error'&&clock()-Date.parse(runner.lastSeenAt)<120000;check('mac-connection',connected,{source:'mac',view:'projects',title:'Kết nối Mac',message:connected?'Mac đã kết nối Lab.':'Mac chưa có tín hiệu hoặc đã mất kết nối.',type:connected?'success':'warning'});
   if(connected){for(const status of runner.projects||[]){const row=db.prepare('SELECT data FROM projects WHERE id=? AND repository=? COLLATE NOCASE').get(status.projectId,status.repository);if(!row)continue;const project=JSON.parse(row.data);check('mac-project:'+project.id,{ready:status.repoReady},{source:'mac',view:'projects',projectId:project.id,title:'Mac · '+project.name,message:status.repoReady?'Checkout project đã sẵn sàng.':'Checkout project chưa sẵn sàng.'+(status.note?' '+status.note:''),type:status.repoReady?'info':'warning'});}}
  }
  const supervisor=JSON.parse(db.prepare("SELECT value FROM settings WHERE key='mac_supervisor'").get()?.value||'null');
  if(supervisor){const connected=clock()-Date.parse(supervisor.lastSeenAt)<120000;const state=connected?(['idle','busy'].includes(supervisor.state)?'ready':supervisor.state):'disconnected',codex=supervisor.codex?.state||'unknown';check('mac-supervisor',{state,codex},{source:'mac',view:'projects',title:'Kết nối & phục hồi Mac',message:!connected?'Supervisor Mac chưa có tín hiệu.':codex==='login-required'?'Codex cần đăng nhập lại trên Mac.':({idle:'Supervisor sẵn sàng.',busy:'Mac đang làm việc.',starting:'Runner đang khởi động.',restarting:'Runner đang khởi động lại.',stalled:'Cần kiểm tra heartbeat của runner.',backoff:'Runner đang chờ phục hồi.'})[state]||'Supervisor đã kết nối.',type:!connected||codex==='login-required'||state==='stalled'?'warning':'info'});}
 }
 let timer;
 return {
  observe,
  list(user,{before,limit=50}={}){return transaction(db,()=>{observe();const v=visibility(user),read=readId(user),rows=db.prepare("SELECT n.id,n.request_id,n.data,json_extract(r.data,'$.title') AS request_title,json_extract(r.data,'$.projectId') AS project_id,json_extract(r.data,'$.repository') AS repository"+from+'WHERE '+v.sql+(before?' AND n.id<?':'')+' ORDER BY n.id DESC LIMIT ?').all(...v.args,...(before?[before]:[]),limit);
   const items=rows.map(row=>{const d=JSON.parse(row.data);return {...d,id:row.id,requestId:row.request_id||undefined,title:d.title||row.request_title||(d.source==='client'?'Cập nhật ứng dụng':'Cập nhật request'),projectId:d.projectId||row.project_id||undefined,repository:row.repository||undefined,read:row.id<=read};});
   return {items,hiddenIds:db.prepare('SELECT notification_id AS id FROM notification_hidden WHERE owner=?').all(principal(user)).map(r=>r.id),readId:read,latestId:maxVisible(user),unread:db.prepare('SELECT COUNT(*) AS count'+from+'WHERE '+v.sql+' AND n.id>?').get(...v.args,read).count,total:db.prepare('SELECT COUNT(*) AS count'+from+'WHERE '+v.sql).get(...v.args).count,nextBefore:rows.length===limit?rows.at(-1).id:null};});},
  remove(user,id){return transaction(db,()=>{const v=visibility(user);if(id!==undefined&&!db.prepare('SELECT n.id'+from+'WHERE '+v.sql+' AND n.id=?').get(...v.args,id))fail('Không tìm thấy thông báo.',404);db.prepare('INSERT OR IGNORE INTO notification_hidden(owner,notification_id) SELECT ?,n.id'+from+'WHERE '+v.sql+(id!==undefined?' AND n.id=?':'')).run(principal(user),...v.args,...(id!==undefined?[id]:[]));return {ok:true};});},
  markRead(user,id){return transaction(db,()=>{const max=maxVisible(user);if(id>max)fail('Mốc thông báo không hợp lệ.',409);const old=readId(user);db.prepare('UPDATE notification_reads SET read_id=? WHERE owner=?').run(Math.max(old,id),principal(user));return {ok:true};});},
  record(user,input){return transaction(db,()=>{const b=notificationInput.parse(input);if(b.requestId){const row=db.prepare("SELECT json_extract(data,'$.author') AS author FROM requests WHERE id=?").get(b.requestId);if(!row||user.role!=='admin'&&row.author!==user.name)fail('Không có quyền với thông báo request.',403);}
   // Establish the first read cursor before inserting this user's first toast.
   readId(user);add({...b,source:'client',at:new Date(clock()).toISOString()},{audience:'user',owner:principal(user),requestId:b.requestId,dedupe:principal(user)+':'+b.clientId});return {ok:true};});},
  start(){if(!timer){observe();timer=setInterval(()=>{try{transaction(db,observe);}catch{/* Observation must not interrupt request processing. */}},15000);timer.unref();}},stop(){clearInterval(timer);timer=null;}
 };
}
