import React,{useEffect,useState} from 'react';

export default function RequestControls({request:r,busy,onAction}){
 const [editing,setEditing]=useState(false),[note,setNote]=useState('');
 useEffect(()=>{setEditing(false);setNote('');},[r.id]);
 const c=r.controls||{};
 return <div className="request-controls">
  {c.canStop&&!editing&&<button className="button" disabled={busy} onClick={()=>setEditing(true)}>Từ chối / dừng task</button>}
  {c.canStop&&editing&&<form className="request-stop-form" onSubmit={async e=>{e.preventDefault();if(note.trim().length>=5&&await onAction('stop',{note:note.trim()})){setEditing(false);setNote('');}}}>
   <label htmlFor={'stop-note-'+r.id}>Lý do từ chối / dừng</label>
   <textarea id={'stop-note-'+r.id} value={note} onChange={e=>setNote(e.target.value)} minLength={5} maxLength={1000} required disabled={busy}/>
   <p>Task chưa có worker sẽ dừng ngay. Task đang chạy giữ khoá đến khi xác nhận worker đã dừng. Giữ nguyên source, PR và lịch sử.</p>
   <div><button className="button" type="submit" disabled={busy||note.trim().length<5}>Xác nhận dừng task</button><button className="button" type="button" disabled={busy} onClick={()=>setEditing(false)}>Huỷ</button></div>
  </form>}
  {c.pending&&<div role="status"><p>Đã yêu cầu dừng. Chờ heartbeat dừng tiến trình và giữ khoá để tránh chạy chồng.</p><button className="button" disabled={busy||!c.canConfirmStopped} onClick={()=>{if(window.confirm('Chỉ xác nhận nếu bạn đã kiểm tra tiến trình worker của task này đã dừng. Giữ lại worktree và artifact.'))onAction('stop/confirm',{workerStopped:true});}}>Tôi đã xác minh worker dừng</button>{!c.canConfirmStopped&&<small>Chờ claim hết hạn trước khi mở khoá; hết hạn không tự xác nhận worker đã dừng.</small>}</div>}
  {!r.stopControl&&c.stopReason&&<p className="subtle">{c.stopReason}</p>}
  {c.canArchive&&<button className="button" disabled={busy} onClick={()=>{if(window.confirm('Chuyển task vào thùng rác? Có thể khôi phục, lịch sử và artifact vẫn được giữ.'))onAction('archive',{});}}>Xoá task</button>}
  {c.canRestore&&<button className="button" disabled={busy} onClick={()=>onAction('restore',{})}>Khôi phục từ thùng rác</button>}
 </div>;
}
