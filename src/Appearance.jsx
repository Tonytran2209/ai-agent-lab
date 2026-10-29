import {useEffect,useState} from 'react';

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
  return <label className="appearance-control"><span>Giao diện</span><select aria-label="Giao diện" value={theme} onChange={e=>setTheme(e.target.value)}><option value="system">Hệ thống</option><option value="light">Sáng</option><option value="dark">Tối</option></select></label>;
}
