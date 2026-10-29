import {readOutbox,savePending,removePending} from './notification-outbox.js';
import React,{useEffect,useRef,useState} from 'react';
import {Bell,AlertTriangle,Check,Monitor,LoaderCircle} from 'lucide-react';
const views={inbox:'Inbox',projects:'Cài đặt',library:'Tài liệu',memory:'Bộ nhớ project',connection:'Kết nối'};
const sources={library:'Tài liệu',learning:'MD & kinh nghiệm',evaluation:'AI & model',lark:'Thông báo Lark',request:'Request',mac:'Mac',onboarding:'Onboarding', 'ci-setup':'Thiết lập CI','deployment-setup':'Liên kết deploy'};
const phases={syncing:'Đang đồng bộ',passed:'Đạt kiểm tra','needs-review':'Cần xem xét',sent:'Đã gửi',blocked:'Đang bị chặn',ambiguous:'Cần xác minh kết quả gửi',expired:'Đã hết hạn',queued:'Đã xếp hàng',waiting:'Đang chờ',running:'Đang xử lý',failed:'Cần xử lý',ready:'Sẵn sàng',verified:'Đã xác minh',active:'Đã kích hoạt',completed:'Hoàn tất',cancelled:'Đã dừng',surveying:'Đang khảo sát',review:'Chờ xem xét',pr:'Đã tạo PR',ci:'Đang kiểm tra CI'};
export const notificationSource=n=>n.source==='client'?(views[n.view]||'Ứng dụng'):(sources[n.source]||'Ứng dụng');
export const notificationMessage=(n,labels={})=>n.source==='request'?[labels[n.eventType]||n.eventType,n.message].filter(Boolean).join(' · '):[n.phase&&(phases[n.phase]||n.phase),n.message].filter(Boolean).join(' · ');
const syncError=e=>/Failed to fetch|NetworkError|Load failed/i.test(e?.message||'')?'Không kết nối được Lab. Thông báo sẽ tự đồng bộ khi kết nối trở lại.':(e?.message||'Chưa đồng bộ được thông báo.');
const noticeDate=new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'});
const formatNoticeDate=at=>at&&Number.isFinite(Date.parse(at))?noticeDate.format(new Date(at)):'Không rõ thời gian';
const identity=user=>user?JSON.stringify([user.role,user.name]):null;
export function useNotifications({user,api,open,onIncoming,labels}){
 const [state,setState]=useState({items:[],unread:0,total:0,latestId:0,nextBefore:null}),[error,setError]=useState(''),[pending,setPending]=useState(0),[loading,setLoading]=useState(false);
 const session=useRef(null),pollRef=useRef(null),queue=useRef([]),incoming=useRef(onIncoming),openRef=useRef(open),labelsRef=useRef(labels),seenClients=useRef(new Set());
 incoming.current=onIncoming;openRef.current=open;labelsRef.current=labels;
 useEffect(()=>{
  const key=identity(user);setState({items:[],unread:0,total:0,latestId:0,nextBefore:null});setError('');setPending(0);if(!key)return;
  let alive=true,busy=false,latest=null,flushing=false,requestedMore=false;session.current=key;seenClients.current=new Set();
  try{queue.current=readOutbox(localStorage,key);}catch{queue.current=[];}
  setPending(queue.current.length);
  const persist=()=>{setPending(queue.current.length);try{for(const value of queue.current)savePending(localStorage,key,value);}catch{if(alive)setError('Chưa lưu được hàng đợi thông báo trên thiết bị. Giữ tab mở để đồng bộ.');}};
  const flush=async()=>{if(flushing||!alive)return;flushing=true;try{while(alive&&session.current===key&&queue.current.length){await api('/notifications',{method:'POST',body:JSON.stringify(queue.current[0])});if(!alive||session.current!==key)return;const sent=queue.current.shift();try{removePending(localStorage,key,sent.clientId);}catch{/* A duplicate retry is safe on the server. */}setPending(queue.current.length);}}catch{if(alive)setPending(queue.current.length);}finally{flushing=false;}};
  const poll=async()=>{if(busy||!alive)return;busy=true;try{try{queue.current=[...new Map([...readOutbox(localStorage,key),...queue.current].map(n=>[n.clientId,n])).values()];}catch{}await flush();const data=await api('/notifications');if(!alive||session.current!==key)return;setState(old=>({...data,nextBefore:old.items.length>data.items.length?old.nextBefore:data.nextBefore,items:[...new Map([...old.items,...data.items].map(n=>[n.id,n])).values()].sort((a,b)=>b.id-a.id).map(n=>({...n,read:n.id<=data.readId}))}));setError('');
   if(latest!==null&&!openRef.current){const n=data.items.find(n=>n.id>latest&&n.eventType!=='progress'&&!seenClients.current.has(n.clientId));if(n)incoming.current?.({title:n.title,message:notificationMessage(n,labelsRef.current),requestId:n.requestId,type:n.type||(/fail|reject|error/.test(n.eventType||n.phase||'')?'error':'info'),source:notificationSource(n)});}
   latest=data.latestId;
  }catch(e){if(alive)setError(syncError(e));}finally{busy=false;if(requestedMore&&alive){requestedMore=false;void poll();}}};
  pollRef.current={key,poll,record(value){const b={clientId:crypto.randomUUID(),title:String(value.title||'').slice(0,200),message:String(value.message||'').slice(0,2500)||'Đã cập nhật.',type:['info','success','warning','error'].includes(value.type)?value.type:'success',view:views[value.view]?value.view:'inbox',...(value.requestId?{requestId:value.requestId}:{})};seenClients.current.add(b.clientId);queue.current.push(b);persist();if(busy)requestedMore=true;else void poll();}};
  void poll();const interval=setInterval(()=>void poll(),5000);
  return()=>{alive=false;clearInterval(interval);if(session.current===key)session.current=null;pollRef.current=null;};
 },[user?.name,user?.role]);
 const marked=useRef(0);
 useEffect(()=>{marked.current=0;},[user?.name,user?.role]);
 useEffect(()=>{if(!open||!user||!state.latestId||state.latestId<=marked.current)return;const key=identity(user),through=state.latestId;marked.current=through;api('/notifications/read',{method:'POST',body:JSON.stringify({through})}).then(()=>{if(session.current===key)setState(s=>({...s,readId:Math.max(s.readId||0,through),unread:s.latestId<=through?0:s.unread,items:s.items.map(n=>n.id<=through?{...n,read:true}:n)}));}).catch(e=>{if(session.current===key){marked.current=0;setError(syncError(e));}});},[open,state.latestId,state.items,user?.name,user?.role]);
 async function loadMore(){if(!state.nextBefore||loading)return;const key=identity(user);setLoading(true);try{const data=await api('/notifications?before='+state.nextBefore);if(session.current===key)setState(s=>({...s,nextBefore:data.nextBefore,items:[...new Map([...s.items,...data.items].map(n=>[n.id,n])).values()].sort((a,b)=>b.id-a.id)}));}catch(e){if(session.current===key)setError(syncError(e));}finally{setLoading(false);}}
 return {...state,error,pending,loading,loadMore,retry:()=>pollRef.current?.poll(),record:value=>{if(pollRef.current?.key===identity(user))pollRef.current.record(value);}};
}
export function NotificationHistory({center,labels,onChoose,onView}){
 return <div className="notification-history"><div className="notification-history-summary"><span>{center.total} thông báo đã lưu</span><small>Lịch sử theo thời gian</small></div>
 {(center.error||center.pending>0)&&<div className="notification-sync" role="status">{center.error&&<p>{center.error}</p>}{center.pending>0&&<p>{center.pending} thông báo đang chờ đồng bộ; nội dung vẫn được giữ trên thiết bị.</p>}<button className="text-button" onClick={center.retry}>Thử đồng bộ</button></div>}
 {center.items.map(n=>{const message=notificationMessage(n,labels),Icon=n.source==='mac'?Monitor:n.type==='error'||/fail|error/.test(n.eventType||n.phase||'')?AlertTriangle:/deployed|completed/.test(n.eventType||n.phase||'')?Check:Bell;return <button className={'notification-row history-entry '+(!n.read?'unread':'')} key={n.id} onClick={()=>n.requestId?onChoose(n.requestId):onView(n.view||'projects')}><Icon size={17} aria-hidden="true"/><div className="history-entry-content"><div className="history-entry-meta"><span>{notificationSource(n)}</span><time dateTime={n.at}>{formatNoticeDate(n.at)}</time></div><strong>{n.title}</strong><p>{message}</p>{n.requestId&&<small>{n.requestId}</small>}</div></button>;})}
 {!center.items.length&&<div className="empty"><Bell size={24} aria-hidden="true"/><h2>Chưa có thông báo</h2><p>Cập nhật request, tiến trình thiết lập và kết nối Mac sẽ được lưu tại đây.</p></div>}
 {center.nextBefore&&<button className="button notification-more" disabled={center.loading} onClick={center.loadMore}>{center.loading&&<LoaderCircle size={14} className="spin"/>}{center.loading?'Đang tải…':'Xem thông báo trước đó'}</button>}
 </div>;
}
