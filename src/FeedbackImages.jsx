import React,{useState,useRef,useEffect} from 'react';
import {Paperclip,X} from 'lucide-react';
const allowed=['image/png','image/jpeg','image/webp'];
export function useFeedbackImages(){
 const [images,setImages]=useState([]),[loading,setLoading]=useState(false),[imageError,setImageError]=useState('');
 const current=useRef([]),reading=useRef(false),input=useRef(null);
 useEffect(()=>()=>{for(const a of current.current)URL.revokeObjectURL(a.url);},[]);
 function clear(){for(const a of current.current)URL.revokeObjectURL(a.url);current.current=[];setImages([]);setImageError('');}
 function remove(id){const old=current.current.find(v=>v.id===id);if(old)URL.revokeObjectURL(old.url);current.current=current.current.filter(v=>v.id!==id);setImages(current.current);}
 async function addFiles(files){
  if(reading.current)return;const selected=Array.from(files||[]);if(!selected.length)return;
  if(current.current.length+selected.length>4){setImageError('Tối đa 4 ảnh cho một feedback.');return;}
  if(selected.some(f=>!allowed.includes(f.type)||f.size>3*1024*1024||!f.size)){setImageError('Chọn ảnh PNG, JPEG hoặc WebP, tối đa 3 MB/ảnh.');return;}
  reading.current=true;setLoading(true);setImageError('');
  try{const added=[];for(const file of selected){const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('Không đọc được ảnh. Hãy chọn lại.'));r.readAsDataURL(file);});added.push({id:crypto.randomUUID(),name:file.name,type:file.type,data,file});}const entries=added.map(v=>({...v,url:URL.createObjectURL(v.file)}));current.current=[...current.current,...entries];setImages(current.current);}catch(e){setImageError(e.message);}finally{reading.current=false;setLoading(false);if(input.current)input.current.value='';}
 }
 return {images,loading,imageError,input,clear,remove,addFiles,payload:()=>current.current.map(({name,type,data})=>({name,type,data}))};
}
export function ImagePicker({state,disabled}){return <><input ref={state.input} type="file" className="sr-only" tabIndex={-1} accept="image/png,image/jpeg,image/webp" multiple aria-label="Chọn ảnh feedback" disabled={disabled||state.loading} onChange={e=>state.addFiles(e.target.files)}/><button type="button" className="add-project" aria-label="Đính kèm ảnh" title="Chọn, kéo thả hoặc dán ảnh" disabled={disabled||state.loading||state.images.length>=4} onClick={()=>state.input.current?.click()}><Paperclip size={18}/></button></>;}
export function ImagePreviews({state,disabled}){return <>{state.images.length>0&&<div className="composer-images" aria-label="Ảnh đã đính kèm">{state.images.map(a=><div className="composer-image" key={a.id}><img src={a.url} alt={a.name}/><span title={a.name}>{a.name}</span><button type="button" disabled={disabled} aria-label={'Bỏ ảnh '+a.name} onClick={()=>state.remove(a.id)}><X size={12}/></button></div>)}</div>}{state.loading&&<small role="status">Đang đọc ảnh…</small>}{state.imageError&&<p role="alert" className="composer-error">{state.imageError}</p>}</>;}
export function AttachedImages({request}){return request.attachments?.length>0?<div className="feedback-images" aria-label="Ảnh đính kèm feedback">{request.attachments.map((a,i)=>{const url='/api/requests/'+request.id+'/images/'+a.id;return <a key={a.id} href={url} target="_blank" rel="noreferrer" aria-label={'Mở ảnh '+(i+1)+': '+a.name}><img loading="lazy" src={url} alt={a.name}/><small>Ảnh {i+1} · {a.name}</small></a>;})}</div>:null;}
