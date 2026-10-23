import crypto from 'node:crypto';
import {imageSize} from 'image-size';
import {fail} from './schemas.js';
export const imageLimits={count:4,bytes:3*1024*1024,pixels:32000000,dimension:8192};
const mimeTypes={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
export function normalizeImages(input=[]){
 if(!Array.isArray(input)||input.length>imageLimits.count)fail('Tối đa 4 ảnh cho mỗi feedback.',400);
 const seen=new Set();return input.map(v=>{
  if(!v||typeof v.data!=='string'||!v.data.length||v.data.length>4*Math.ceil(imageLimits.bytes/3)||v.data.length%4!==0||! /^[A-Za-z0-9+/]*={0,2}$/.test(v.data))fail('Dữ liệu ảnh không hợp lệ; tối đa 3 MB/ảnh.',400);
  const bytes=Buffer.from(v.data,'base64');if(!bytes.length||bytes.length>imageLimits.bytes||bytes.toString('base64')!==v.data)fail('Dữ liệu ảnh không hợp lệ.',400);
  const signature=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;if(signature!==v.type)fail('Định dạng ảnh không khớp nội dung.',400);
  let dimensions;try{dimensions=imageSize(bytes);}catch{fail('Không đọc được ảnh. Chọn PNG, JPEG hoặc WebP.',400);}
  const {width,height,type}=dimensions,mime=mimeTypes[type];
  if(!mime||mime!==v.type||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width>imageLimits.dimension||height>imageLimits.dimension||width*height>imageLimits.pixels)fail('Ảnh phải là PNG/JPEG/WebP, tối đa 8192 px mỗi chiều và 32 megapixel.',400);
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex'),name=String(v.name||'image').replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,120);
  return {metadata:{id:sha256,sha256,name,mime,size:bytes.length,width,height},bytes};
 }).filter(v=>{if(seen.has(v.metadata.id))return false;seen.add(v.metadata.id);return true;});
}
export function createFeedbackImages(db){
 db.exec('CREATE TABLE IF NOT EXISTS feedback_images(request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,id TEXT NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(request_id,id))');
 return {put(requestId,images){for(const i of images)db.prepare('INSERT INTO feedback_images VALUES(?,?,?)').run(requestId,i.metadata.id,i.bytes);},get(requestId,id){if(!/^REQ-[A-F0-9]{8}$/.test(requestId)||! /^[a-f0-9]{64}$/.test(id))fail('Không tìm thấy ảnh.',404);const row=db.prepare('SELECT bytes FROM feedback_images WHERE request_id=? AND id=?').get(requestId,id);if(!row)fail('Không tìm thấy ảnh.',404);return Buffer.from(row.bytes);}};
}
