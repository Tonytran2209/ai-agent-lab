import {useEffect,useId,useState} from 'react';
import {MonitorSmartphone,Sun,MoonStar} from 'lucide-react';

const choices = ['system','light','dark'];
function initialTheme(){try{const saved=localStorage.getItem('lab-theme');return choices.includes(saved)?saved:'system';}catch{return 'system';}}
export function useAppearance(){
  const [theme,setTheme]=useState(initialTheme);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{document.documentElement.dataset.theme=theme==='system'?(media.matches?'dark':'light'):theme;};
    apply();media.addEventListener('change',apply);
    try{localStorage.setItem('lab-theme',theme);}catch{/* Appearance still works without storage. */}
    return()=>media.removeEventListener('change',apply);
  },[theme]);
  return {theme,setTheme};
}
export function Appearance({theme,setTheme}){
  const name=useId();
  return <fieldset className="appearance-control"><legend className="sr-only">Giao diện</legend><div className="appearance-switch">{[
    {value:'system',label:'Hệ thống',Icon:MonitorSmartphone},
    {value:'light',label:'Sáng',Icon:Sun},
    {value:'dark',label:'Tối',Icon:MoonStar}
  ].map(({value,label,Icon})=><label className="appearance-choice" key={value} title={label}><input className="sr-only" type="radio" name={name} value={value} aria-label={label} checked={theme===value} onChange={()=>setTheme(value)}/><span><Icon size={23} strokeWidth={1.8} aria-hidden="true"/></span></label>)}</div></fieldset>;
}
