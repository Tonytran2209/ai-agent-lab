import React from 'react';
import {Check} from 'lucide-react';
import {taskProgress} from './workflow.js';
export default function TaskProgress({request,runner}){
 const p=taskProgress(request,runner);
 return <section className={'task-progress '+(p.failed?'has-error':p.waiting?'is-waiting':'')} aria-label="Tiến trình request"><ol>{p.steps.map((label,i)=><li key={label} className={p.done||i<p.current?'done':i===p.current?'current':''} aria-current={!p.done&&i===p.current?'step':undefined}><span>{p.done||i<p.current?<Check size={12}/>:i+1}</span><small>{label}</small></li>)}</ol><div className="task-progress-message" role={p.failed?'alert':'status'}><strong>{p.title}</strong><p>{p.message}</p></div></section>;
}
