import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
const NoticeContext=createContext(null);
export function NoticeProvider({notify,title,children}){return <NoticeContext.Provider value={{notify,title}}>{children}</NoticeContext.Provider>;}
// Mirror displayed operation results/errors; empty strings and unchanged polling errors are ignored.
export function useNoticedState(initial='',type='info'){
 const [value,setValue]=useState(initial),context=useContext(NoticeContext),current=useRef(context);current.current=context;
 useEffect(()=>{if(typeof value==='string'&&value.trim())current.current?.notify({title:current.current.title,message:value,type});},[value]);
 return [value,setValue];
}
