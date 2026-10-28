import {z} from 'zod';
import {ciSetupPaths} from './ci-evidence.js';
import {fail} from './schemas.js';
export const adapterProtocol='ci-adapter-v1';
export const adapterSelection=z.enum(['auto','writer-react@1','existing-ci@1']);
export const adapterManifestPath='.agent-hub/ci-adapter.json';
export const writerSourcePaths=['package.json','package-lock.json','backend/package-lock.json','src/main.tsx','src/components/workspace/Step4Draft.tsx','src/lib/i18n.tsx','src/lib/defaultData.ts','src/index.css'];
export const ciAdapters=[{key:'writer-react@1',id:'writer-react',version:1,name:'Writer React/Vite · v1',mode:'generate',description:'Draft/EB V2 thực, npm check, browser desktop/mobile; chỉ thêm file CI.'},{key:'existing-ci@1',id:'existing-ci',version:1,name:'CI hiện có · v1',mode:'verify',description:'Giữ workflow; xác minh writer-check và browser-check trên đúng commit. Không sinh fixture giả.'}];
export function inspectAdapters(paths){const missing=writerSourcePaths.filter(p=>!paths.includes(p)),workflows=paths.filter(p=>/^\.github\/workflows\/[^/]+\.ya?ml$/.test(p));return {recommended:workflows.length?'existing-ci@1':!missing.length?'writer-react@1':null,adapters:ciAdapters.map(a=>({...a,supported:a.mode==='verify'?workflows.length>0:missing.length===0,reason:a.mode==='verify'?(workflows.length?'Cần kiểm tra hai job bắt buộc bằng GitHub.':'Chưa có workflow để xác minh.'):(missing.length?'Thiếu cấu trúc Writer: '+missing.join(', '):'Cấu trúc phù hợp; worker sẽ kiểm tra package và API fixture trước khi ghi file.')}))};}
export function resolveAdapter(selection,paths){const inspection=inspectAdapters(paths),key=selection==='auto'?inspection.recommended:adapterSelection.parse(selection);const adapter=inspection.adapters.find(a=>a.key===key);if(!adapter?.supported)fail(adapter?.reason||'Chưa có adapter phù hợp. Cần adapter riêng; không tạo CI xanh giả.');return {key:adapter.key,id:adapter.id,version:adapter.version};}
export const adapterPaths=job=>job.adapter?.key==='writer-react@1'&&!job.existing?[...ciSetupPaths,adapterManifestPath]:ciSetupPaths;
