import {readFile} from 'node:fs/promises';
import {ciSetupPaths} from '../server/ci-evidence.js';
export async function ciTemplate(read,branch){
 const required=['package.json','package-lock.json','backend/package-lock.json','src/main.tsx','src/components/workspace/Step4Draft.tsx','src/lib/i18n.tsx','src/lib/defaultData.ts','src/index.css'];
 const sources={};for(const p of required){try{sources[p]=await read(p);}catch{throw new Error('Cần adapter CI cho cấu trúc repo này; thiếu '+p+'. Chưa sửa file nào.');}}
 let pkg;try{pkg=JSON.parse(sources['package.json']);}catch{throw new Error('package.json không hợp lệ; chưa tạo file CI.');}if(!pkg.scripts?.check||!pkg.dependencies?.react||!pkg.devDependencies?.vite)throw new Error('Mẫu CI hiện hỗ trợ React/Vite + npm run check; repo cần adapter riêng.');
 const files={};for(const [path,name] of ciSetupPaths.map((p,i)=>[p,['workflow.yml','playwright.config.mjs','server.mjs','fixture.jsx','draft.spec.mjs'][i]]))files[path]=await readFile(new URL('./ci-templates/'+name+'.txt',import.meta.url),'utf8');
 let eb=false,css=false,ebSource=null;try{ebSource=await read('src/components/EbWorkingSpace.tsx');}catch{}
 if(ebSource!==null){if(!ebSource.includes('fetchEbV2Workspace'))throw new Error('EB workspace cần adapter CI cho API hiện tại.');eb=true;}
 try{await read('src/codex-theme.css');css=true;}catch{}
 files[ciSetupPaths[0]]=files[ciSetupPaths[0]].replace('__BRANCH__',JSON.stringify(branch));
 files[ciSetupPaths[3]]=files[ciSetupPaths[3]].replace('/*EXTRA_CSS*/',css?"import '../../src/codex-theme.css';":'').replace('/*EB_IMPORT*/',eb?"import EbWorkingSpace from '../../src/components/EbWorkingSpace';":'').replace('{/*SCREEN*/}',eb?"{screen==='eb'?<EbWorkingSpace config={fixtureConfig}/>:<Fixture/>}":'{<Fixture/>}');
 files[ciSetupPaths[4]]=files[ciSetupPaths[4]].replace('/*EB_TEST*/',eb?`test('EB V2 loads an isolated Brief workspace',async({page},info)=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));const unexpected=await isolate(page);await page.goto('/?screen=eb');await expect(page.getByText('CI_BRIEF_SENTINEL').first()).toBeVisible();await page.screenshot({path:info.outputPath('eb-v2.png'),fullPage:true});expect(errors).toEqual([]);expect(unexpected).toEqual([]);});`:'');
 return files;
}
