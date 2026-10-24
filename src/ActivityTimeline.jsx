import React,{useState} from 'react';
export default function ActivityTimeline({events,labels,formatDate}){
 const [all,setAll]=useState(false),rows=[...events].reverse(),visible=all?rows:rows.slice(0,8);
 return <><ol className="activity-timeline">{visible.map((v,i)=><li key={`${v.at}-${v.type}-${i}`} className={/failed|stopped/.test(v.type)?'activity-error':''}>{v.detail?<details className="activity-entry" open={i===0&&/failed|stopped/.test(v.type)}><summary><strong>{labels[v.type]||v.type.replaceAll('_',' ')}</strong><time dateTime={v.at}>{formatDate(v.at)}</time></summary><p>{v.detail}</p></details>:<div><strong>{labels[v.type]||v.type.replaceAll('_',' ')}</strong><time dateTime={v.at}>{formatDate(v.at)}</time></div>}</li>)}</ol>{rows.length>8&&<button className="text-button journal-history-toggle" aria-expanded={all} onClick={()=>setAll(!all)}>{all?'Thu gọn lịch sử':`Xem toàn bộ ${rows.length} cập nhật`}</button>}</>;
}
