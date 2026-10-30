import React from 'react';
import {Check,Clock,AlertTriangle,LoaderCircle,Activity,Pause} from 'lucide-react';
import {taskProgress,inboxIndicator} from './workflow.js';
export default function TaskProgress({request,runner}){
 const p=taskProgress(request,runner);
 const stopped=Boolean(request.archivedAt||request.stopControl||request.status==='rejected');
 const active=!p.done&&!p.failed&&!p.waiting&&!stopped&&inboxIndicator(request)==='processing';
 const tone=p.failed?'error':stopped?'neutral':p.done?'success':p.waiting?'warning':active?'processing':'neutral';
 const StateIcon=p.failed?AlertTriangle:stopped?Pause:p.done?Check:active?LoaderCircle:Clock;
 return <section className={'task-progress progress-card '+(p.failed?'has-error':p.waiting?'is-waiting':'')+(active?' is-active':'')} aria-label="Tiến trình request" data-tone={tone}>
  <div className="progress-overview">
   <header className="progress-header"><div><span className="progress-eyebrow">Tiến trình xử lý</span><strong>{!p.done&&<StateIcon size={18} className={active?'spin':''} aria-hidden="true"/>}{p.title}</strong></div><span className="progress-stage" data-tone={tone}>{p.done?'Hoàn tất':stopped?(request.stopControl?.pending?'Đang dừng':'Đã dừng'):`Bước ${p.current+1} / ${p.steps.length}`}</span></header>
   <ol aria-label="Các giai đoạn xử lý">{p.steps.map((label,i)=>{const done=p.done||i<p.current,current=!p.done&&i===p.current;return <li key={label} className={done?'done':current?'current':''} aria-current={current?'step':undefined}>
    <div className="progress-segment" aria-hidden="true"><span/></div><div className="progress-step-label"><span className="progress-step-icon" aria-hidden="true">{current&&active?<LoaderCircle size={13} className="spin"/>:current&&p.failed?<AlertTriangle size={13}/>:i+1}</span><small>{label}</small><span className="sr-only">{done?' · Đã qua giai đoạn':current?' · Giai đoạn hiện tại':' · Chưa đến giai đoạn'}</span></div>
   </li>;})}</ol>
  </div>
  <div className="task-progress-message progress-activity" role={p.failed?'alert':'status'}><Activity size={17} aria-hidden="true"/><div><span className="progress-activity-label">{p.failed?'Chi tiết cần xử lý':p.done?'Kết quả xử lý':'Hoạt động hiện tại'}</span><p>{p.message}</p></div></div>
 </section>;
}
