import crypto from 'node:crypto';
import {transaction} from './db.js';import {fail} from './schemas.js';
export const controlActions=['reconnect','check-codex','restart'];
export function createRunnerControl(db,service){
 db.exec('CREATE TABLE IF NOT EXISTS runner_controls(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
 const all=()=>db.prepare('SELECT data FROM runner_controls ORDER BY rowid DESC LIMIT 20').all().map(v=>JSON.parse(v.data));
 const save=c=>db.prepare('INSERT OR REPLACE INTO runner_controls VALUES(?,?)').run(c.id,JSON.stringify(c));
 const expire=()=>{for(const c of all())if(['queued','running'].includes(c.phase)&&Date.parse(c.expiresAt)<=Date.now()){c.phase='expired';c.note='Mac chưa xác nhận trong thời hạn; không tự gửi lại lệnh.';save(c);}};
 return {
  heartbeat(value){db.prepare("INSERT OR REPLACE INTO settings VALUES('mac_supervisor',?)").run(JSON.stringify({...value,lastSeenAt:new Date().toISOString()}));return {ok:true};},
  status(){const v=JSON.parse(db.prepare("SELECT value FROM settings WHERE key='mac_supervisor'").get()?.value||'{}');return {...v,connected:Date.now()-Date.parse(v.lastSeenAt)<120000};},
  list(){expire();return all();},
  queue(action,actor){return transaction(db,()=>{expire();const r=JSON.parse(db.prepare("SELECT value FROM settings WHERE key='mac_supervisor'").get()?.value||'{}');if(!controlActions.includes(action)||r.controlProtocol!=='runner-control-v1'||!r.workerId)fail('Mac chưa nạp supervisor hỗ trợ điều khiển.');const pending=all().find(c=>['queued','running'].includes(c.phase));if(pending){if(pending.action===action&&pending.workerId===r.workerId)return pending;fail('Đang có lệnh chờ Mac xác nhận.');}const c={id:crypto.randomUUID(),action,actor,workerId:r.workerId,phase:'queued',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+10*60000).toISOString(),note:'Chờ Mac xử lý khi rảnh.'};save(c);return c;});},
  next(workerId){expire();return all().find(c=>c.workerId===workerId&&['queued','running'].includes(c.phase))||null;},
  claim(id,workerId){return transaction(db,()=>{expire();const c=all().find(c=>c.id===id);if(!c||c.workerId!==workerId||!['queued','running'].includes(c.phase))fail('Lệnh không còn hợp lệ.');c.phase='running';save(c);return c;});},
  finish(id,workerId,phase,note){return transaction(db,()=>{expire();const c=all().find(c=>c.id===id);if(c?.workerId===workerId&&c.phase===phase)return c;if(!c||c.workerId!==workerId||!['queued','running'].includes(c.phase)||!['completed','failed'].includes(phase))fail('Không thể xác nhận lệnh.');c.phase=phase;c.note=note;c.finishedAt=new Date().toISOString();save(c);return c;});}
 };
}
