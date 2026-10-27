import {readdir} from 'node:fs/promises';
// Only top-level regular managed code/schema files; never config, credentials, state or symlinks.
export async function managedMacFiles(directory){return (await readdir(directory,{withFileTypes:true})).filter(f=>f.isFile()&&(f.name.endsWith('.js')||f.name.endsWith('-schema.json')||f.name==='SUPERVISOR.md')).map(f=>f.name).sort();}
