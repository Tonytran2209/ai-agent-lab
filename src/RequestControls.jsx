import React,{useEffect,useRef,useState} from 'react';
import {Info,Square,Trash2,RotateCcw} from 'lucide-react';
export default function RequestControls({request:r,busy,onAction}){
 const [editing,setEditing]=useState(false),[note,setNote]=useState('');
 const noteRef=useRef(null),stopButtonRef=useRef(null);
 useEffect(()=>{setEditing(false);setNote('');},[r.id]);
 useEffect(()=>{if(editing)noteRef.current?.focus();},[editing]);
 const c=r.controls||{};
 return <div className="request-controls">
  <div className="request-control-buttons" role="group" aria-label="Quản lý task">
   {c.canStop&&!editing&&<button ref={stopButtonRef} className="button task-secondary-action" disabled={busy} onClick={()=>setEditing(true)}><Square size={14} aria-hidden="true"/>Từ chối / dừng task</button>}
   {c.canArchive&&<button className="button task-secondary-action" disabled={busy} onClick={()=>{if(window.confirm('Chuyển task vào thùng rác? Có thể khôi phục, lịch sử và artifact vẫn được giữ.'))onAction('archive',{});}}><Trash2 size={15} aria-hidden="true"/>Xoá task</button>}
   {c.canRestore&&<button className="button task-secondary-action" disabled={busy} onClick={()=>onAction('restore',{})}><RotateCcw size={15} aria-hidden="true"/>Khôi phục từ thùng rác</button>}
  </div>
  {c.canStop&&editing&&<form className="request-stop-form" onSubmit={async e=>{e.preventDefault();if(note.trim().length>=5&&await onAction('stop',{note:note.trim()})){setEditing(false);setNote('');}}}>
   <label htmlFor={'stop-note-'+r.id}>Lý do từ chối / dừng</label>
   <textarea ref={noteRef} id={'stop-note-'+r.id} aria-describedby={'stop-help-'+r.id} value={note} onChange={e=>setNote(e.target.value)} minLength={5} maxLength={1000} required disabled={busy}/>
   <p id={'stop-help-'+r.id}>Task chưa có worker sẽ dừng ngay. Task đang chạy giữ khoá đến khi xác nhận worker đã dừng. Giữ nguyên source, PR và lịch sử.</p>
   <div><button className="button" type="submit" disabled={busy||note.trim().length<5}>Xác nhận dừng task</button><button className="button" type="button" disabled={busy} onClick={()=>{setEditing(false);requestAnimationFrame(()=>stopButtonRef.current?.focus());}}>Huỷ</button></div>
  </form>}
  {c.pending&&<div className="request-pending-stop" role="status"><p>Đã yêu cầu dừng. Chờ heartbeat dừng tiến trình và giữ khoá để tránh chạy chồng.</p><button className="button" disabled={busy||!c.canConfirmStopped} onClick={()=>{if(window.confirm('Chỉ xác nhận nếu bạn đã kiểm tra tiến trình worker của task này đã dừng. Giữ lại worktree và artifact.'))onAction('stop/confirm',{workerStopped:true});}}>Tôi đã xác minh worker dừng</button>{!c.canConfirmStopped&&<small>Chờ claim hết hạn trước khi mở khoá; hết hạn không tự xác nhận worker đã dừng.</small>}</div>}
  {!r.stopControl&&c.stopReason&&<p className="request-control-note"><Info size={15} aria-hidden="true"/><span>{c.stopReason}</span></p>}
 </div>;
}
