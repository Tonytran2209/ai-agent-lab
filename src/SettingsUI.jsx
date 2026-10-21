import React from 'react';
export function SettingsHeader({title,children}){return <header className="settings-page-heading"><h1>{title}</h1>{children&&<p>{children}</p>}</header>;}
export function SettingsRow({title,description,children}){return <div className="settings-row"><div className="settings-row-copy"><div className="settings-row-title">{title}</div>{description&&<p>{description}</p>}</div><div className="settings-row-control">{children}</div></div>;}
export function SettingsSwitch({label,checked,disabled,onChange}){return <button type="button" className="settings-switch" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={()=>onChange(!checked)}><span/></button>;}
