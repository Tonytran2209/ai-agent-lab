import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {relativePath} from '../server/schemas.js';
const fault=(field,code,message)=>Object.assign(new Error(message),{planningFailureReason:'evidence',validationDetails:[{path:field,code,message}]});
async function source(root,file){
 if(!relativePath.safeParse(file).success)throw fault('evidence.path','SOURCE_PATH','Đường dẫn dẫn chứng không hợp lệ.');
 let full=root;for(const part of file.split('/')){full=path.join(full,part);let stat;try{stat=await lstat(full);}catch{throw fault(file,'SOURCE_MISSING','Không tìm thấy file dẫn chứng trong checkout đã ghim.');}if(stat.isSymbolicLink())throw fault(file,'SOURCE_SYMLINK','Không đọc dẫn chứng qua symlink.');}
 const stat=await lstat(full);if(!stat.isFile()||stat.size>512*1024)throw fault(file,'SOURCE_SIZE','Dẫn chứng phải là file text không quá 512 KiB.');
 const text=await readFile(full,'utf8');return {text,lines:text.replace(/\r\n/g,'\n').split('\n'),hash:crypto.createHash('sha256').update(text).digest('hex')};
}
export async function sourceGuide(root,paths,feedback=''){
 const files=[],excerpts=[];
 for(const file of [...new Set(paths)].slice(0,240)){
  if(!relativePath.safeParse(file).success)continue;
  let s;try{s=await source(root,file);}catch{continue;}
  files.push({path:file,lineCount:s.lines.length});
  // Small relevant modules only; keep the survey context bounded, never dump all source.
  if(excerpts.length<3&&/source|evidence|gate\s*1|dẫn chứng|nguồn/i.test(feedback)&&/brief|evidence|input/i.test(path.basename(file))&&/\.[cm]?[jt]sx?$/.test(file)&&s.lines.length<=60)excerpts.push({path:file,numbered:s.lines.map((line,i)=>`${i+1}: ${line}`).join('\n')});
 }
 return {protocol:'source-lines-v1',files,excerpts};
}
export async function validateSourceEvidence(evidence,{root,sourcePaths,replay=false}){
 if(!Array.isArray(evidence)||!evidence.length||evidence.length>20)throw fault('evidence','SOURCE_COUNT','Cần 1–20 dẫn chứng source.');
 const repairs=[],validated=[];
 for(const [i,row] of evidence.entries()){
  const field=`evidence.${i}`,e={...row};if(!sourcePaths.includes(e.path))throw fault(field+'.path','SOURCE_PATH','File dẫn chứng không thuộc source đã ghim.');
  const s=await source(root,e.path);
  if(replay&&e.contentHash!==s.hash)throw fault(field+'.contentHash','SOURCE_HASH','Hash dẫn chứng không khớp source đã ghim; không tự sửa.');
  const validRange=Number.isInteger(e.startLine)&&Number.isInteger(e.endLine)&&e.startLine>=1&&e.endLine>=e.startLine&&e.endLine<=s.lines.length;
  const quote=typeof e.quote==='string'?e.quote.replace(/\r\n/g,'\n'):'';
  if(!validRange||quote&&s.lines.slice(e.startLine-1,e.endLine).join('\n')!==quote){
   const q=quote.split('\n'),matches=[];
   if(quote.trim().length>=15&&quote.length<=2000)for(let start=0;start<=s.lines.length-q.length;start++)if(s.lines.slice(start,start+q.length).join('\n')===quote)matches.push(start+1);
   if(matches.length!==1)throw fault(field+'.endLine',matches.length>1?'SOURCE_AMBIGUOUS':validRange?'SOURCE_QUOTE':'SOURCE_RANGE',`${e.path}:${e.startLine}–${e.endLine}; file có ${s.lines.length} dòng. ${matches.length>1?'Đoạn trích xuất hiện nhiều nơi.':'Cần đoạn trích nguyên văn khớp duy nhất; không tự cắt số dòng.'}`.slice(0,300));
   repairs.push({path:e.path,previous:{startLine:e.startLine,endLine:e.endLine},resolved:{startLine:matches[0],endLine:matches[0]+q.length-1},contentHash:s.hash,reason:'Unique exact quote in unchanged pinned file'});
   e.startLine=matches[0];e.endLine=matches[0]+q.length-1;
  }
  e.contentHash=s.hash;validated.push(e);
 }
 return {evidence:validated,repairs};
}
