import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import {validateSourceEvidence,sourceGuide} from '../mac/source-evidence.js';
test('citation recovery uses one exact quote, preserves input and refuses blind truncation or ambiguous text',async()=>{
 const root=await mkdtemp('/tmp/lab-evidence-'),file='briefValidation.ts',quote='export const evidence = true;',text='// Source\n'+quote+'\n';await writeFile(path.join(root,file),text);
 const row={path:file,startLine:10,endLine:66,reason:'Validation source for evidence',quote};
 try{const fixed=await validateSourceEvidence([row],{root,sourcePaths:[file]});assert.equal(fixed.evidence[0].startLine,2);assert.equal(fixed.evidence[0].endLine,2);assert.equal(row.endLine,66);assert.equal(fixed.repairs[0].previous.endLine,66);
 await assert.rejects(()=>validateSourceEvidence([{...row,quote:undefined}],{root,sourcePaths:[file]}),e=>e.planningFailureReason==='evidence'&&e.validationDetails[0].code==='SOURCE_RANGE'&&e.message.includes('3 dòng'));
 await writeFile(path.join(root,file),quote+'\n'+quote+'\n');await assert.rejects(()=>validateSourceEvidence([row],{root,sourcePaths:[file]}),e=>e.validationDetails[0].code==='SOURCE_AMBIGUOUS');
 await writeFile(path.join(root,file),text);await assert.rejects(()=>validateSourceEvidence([{...row,quote:'export const different = true;'}],{root,sourcePaths:[file]}),/Cần đoạn trích/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('replay remains pinned to the original hash and refuses missing files, symlinks and unsafe paths',async()=>{
 const root=await mkdtemp('/tmp/lab-evidence-'),file='briefValidation.ts',text='export const evidence = true;\r\n';await writeFile(path.join(root,file),text);const hash=crypto.createHash('sha256').update(text).digest('hex');
 const row={path:file,startLine:1,endLine:1,reason:'Pinned source',quote:text.trimEnd(),contentHash:hash};
 try{assert.equal((await validateSourceEvidence([row],{root,sourcePaths:[file],replay:true})).repairs.length,0);
 await writeFile(path.join(root,file),text+'// Changed\n');await assert.rejects(()=>validateSourceEvidence([row],{root,sourcePaths:[file],replay:true}),e=>e.validationDetails[0].code==='SOURCE_HASH');
 await assert.rejects(()=>validateSourceEvidence([{...row,path:'missing.ts'}],{root,sourcePaths:['missing.ts']}),e=>e.validationDetails[0].code==='SOURCE_MISSING');
 await assert.rejects(()=>validateSourceEvidence([{...row,path:'../secret'}],{root,sourcePaths:['../secret']}),/Đường dẫn/);
 await symlink(path.join(root,file),path.join(root,'linked.ts'));await assert.rejects(()=>validateSourceEvidence([{...row,path:'linked.ts'}],{root,sourcePaths:['linked.ts']}),/symlink/);
 const guide=await sourceGuide(root,[file,'missing.ts','linked.ts'],'Source evidence Gate 1');assert.equal(guide.files.length,1);assert.match(guide.excerpts[0].numbered,/1: export const evidence/);
 }finally{await rm(root,{recursive:true,force:true});}
});
