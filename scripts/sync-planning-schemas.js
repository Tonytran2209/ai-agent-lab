import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {planReport} from '../server/local-planning.js';
// Preserve the CLI's all-required output shape; derive its leaf constraints from server validation.
const source=zodToJsonSchema(planReport,{$refStrategy:'none'});
const limits=['minLength','maxLength','pattern','minimum','maximum','minItems','maxItems','enum'];
const pathPattern='^[A-Za-z0-9_./-]+$';
export function syncConstraints(target,authority,keys=[]){
 const out=structuredClone(target);
 for(const key of limits){delete out[key];if(authority?.[key]!==undefined)out[key]=authority[key];}
 const field=keys.filter(k=>k!=='items').at(-1);
 if(out.type==='string'&&['allowedPaths','dependencies','evidencePaths','files','path'].includes(field)){out.pattern=pathPattern;out.minLength=1;out.maxLength=240;}
 if(out.type==='string'){const min=out.minLength,max=out.maxLength;if(min!==undefined||max!==undefined)out.description='Server-validated string length: '+(min??0)+' to '+(max??'unbounded')+' characters.';delete out.minLength;delete out.maxLength;}
 if(out.properties)for(const [key,value]of Object.entries(out.properties))out.properties[key]=syncConstraints(value,authority?.properties?.[key],[...keys,key]);
 if(out.items)out.items=syncConstraints(out.items,authority?.items,[...keys,'items']);
 return out;
}
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export async function synchronize(check=false){
 for(const name of ['plan-schema.json','direct-plan-schema.json']){
  const url=new URL('../mac/'+name,import.meta.url),raw=await readFile(url,'utf8'),next=JSON.stringify(stable(syncConstraints(JSON.parse(raw),source)),null,2)+'\n';
  if(check){if(raw!==next)throw Error(name+' differs from server schema; run npm run schemas:sync');}else await writeFile(url,next);
 }
}
if(process.argv[1]===fileURLToPath(import.meta.url))await synchronize(process.argv.includes('--check'));
