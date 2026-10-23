import {mkdir,lstat,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'},maxBytes=3*1024*1024;
export async function feedbackImageArgs(request,config,token,{fetcher=fetch}={}){
 const images=request.attachments??[];if(!Array.isArray(images)||images.length>4)throw Error("Metadata ảnh không hợp lệ.");if(!images.length)return [];
 if(!/^REQ-[A-F0-9]{8}$/.test(request.id)||!Array.isArray(images)||images.length>4||!token)throw Error('Ảnh feedback thiếu định danh hoặc thông tin xác thực.');
 const origin=new URL(config.mcpUrl);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/mcp')throw Error('MCP URL không hợp lệ.');
 const root=path.join(config.stateDir,'feedback-images'),directory=path.join(root,request.id);await mkdir(directory,{recursive:true,mode:0o700});for(const p of [root,directory])if((await lstat(p)).isSymbolicLink())throw Error('Thư mục ảnh không được là symlink.');
 const args=[];
 for(const a of images){
  if(!/^[a-f0-9]{64}$/.test(a.id)||a.sha256!==a.id||!extensions[a.mime]||!Number.isInteger(a.size)||a.size<=0||a.size>maxBytes)throw Error('Metadata ảnh không hợp lệ.');
  const file=path.join(directory,a.id+'.'+extensions[a.mime]);let bytes;
  try{if((await lstat(file)).isSymbolicLink())throw Error('Cache ảnh không được là symlink.');bytes=await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  const valid=b=>b.length===a.size&&crypto.createHash('sha256').update(b).digest('hex')===a.sha256;
  if(bytes&&!valid(bytes))throw Error('Cache ảnh không khớp hash; chưa gọi Codex.');
  if(!bytes){
   const url=new URL('/runner/requests/'+request.id+'/images/'+a.id,origin);
   const response=await fetcher(url.href,{redirect:'error',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
   if(!response.ok||response.headers.get('content-type')?.split(';')[0]!==a.mime){await response.body?.cancel();throw Error('Không tải được ảnh feedback; chưa gọi Codex.');}
   const parts=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>a.size||size>maxBytes)throw Error('Ảnh tải về vượt giới hạn.');parts.push(Buffer.from(chunk));}bytes=Buffer.concat(parts);if(!valid(bytes))throw Error('Ảnh tải về không khớp hash; chưa gọi Codex.');
   const temporary=file+'.'+crypto.randomUUID()+'.pending';try{await writeFile(temporary,bytes,{mode:0o600,flag:'wx'});await rename(temporary,file);}finally{await unlink(temporary).catch(()=>{});}
  }
  args.push('--image',file);
 }
 return args;
}
