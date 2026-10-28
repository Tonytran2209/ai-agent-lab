import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readRepositoryLibrary} from '../server/library.js';
import {primaryDesignDocument,supplementalDesignDocuments,designReferencePolicy} from '../server/design-authority.js';
import {compactLibrary,planningLibrary,codingPacket} from '../server/ai-context.js';
import {classificationContext} from '../server/classification-context.js';
import {projectBrief} from '../server/project-brief.js';
import {digest} from '../server/knowledge.js';
const seed=JSON.parse(readFileSync(new URL('../library/writer-studio.json',import.meta.url),'utf8'));
const reference={path:supplementalDesignDocuments[0],content:'---\nstatus: supplemental-reference\n---\n# Supplemental UI ideas\ncomponent spacing suggestion: use a larger panel when the primary design contract permits it.\n'+('More reference patterns.\n'.repeat(220))};

test('same-commit v2 library refresh pins the optional reference without importing arbitrary guides or changing old data',async t=>{
 const old={...seed,libraryFormatVersion:2,ciInspectionVersion:1},before=structuredClone(old),docs=[...seed.documents,reference],calls=[];
 t.mock.method(globalThis,'fetch',async url=>{
  const suffix=String(url).split('/'+seed.repository+'/')[1];calls.push(suffix);
  if(suffix.startsWith('commits/'))return {ok:true,json:async()=>({sha:seed.sourceCommit})};
  if(suffix.startsWith('git/trees/'))return {ok:true,json:async()=>({truncated:false,tree:[...seed.sourcePaths,reference.path,'docs/untrusted-design-guide.md'].map(path=>({path,type:'blob'}))})};
  const doc=docs.find(d=>suffix==='contents/'+d.path+'?ref='+seed.sourceCommit);assert.ok(doc,'only allowlisted exact-commit documents: '+suffix);
  return {ok:true,json:async()=>({type:'file',encoding:'base64',size:Buffer.byteLength(doc.content),content:Buffer.from(doc.content).toString('base64')})};
 });
 const lib=await readRepositoryLibrary(seed.repository,'main',undefined,old);
 assert.equal(lib.libraryFormatVersion,3);assert.equal(lib.documents.find(d=>d.path===primaryDesignDocument).authority,'primary-design');
 const guide=lib.documents.find(d=>d.path===reference.path);assert.equal(guide.authority,'supplemental-reference');assert.equal(guide.primaryDesignDocument,primaryDesignDocument);assert.equal(guide.content,reference.content);
 assert.deepEqual(old,before);assert.ok(!calls.some(p=>p.startsWith('contents/docs/')));
 calls.length=0;assert.equal(await readRepositoryLibrary(seed.repository,'main',undefined,lib),lib);assert.equal(calls.length,1);
});

test('Luna excerpts, project-map facts and Codex packets retain primary/reference roles through compaction',()=>{
 const primary={path:primaryDesignDocument,content:'# Primary design\ncomponent spacing rule: preserve neutral focus and the approved project tokens.'};
 const lib={...seed,id:'pinned-design-library',documents:[primary,reference]};const before=structuredClone(lib);
 const matches=[primary,reference].map(d=>({path:d.path,startLine:1,endLine:6,commit:lib.sourceCommit,contentHash:digest(d.content),content:d.content}));
 const service={project:()=>({}),library:()=>lib,memory:{select:()=>[],selectRiskFeedback:()=>[]}};
 const ctx=classificationContext(service,{search:()=>({matches})},{projectId:lib.projectId,libraryVersionId:lib.id,feedback:'component spacing'});
 assert.deepEqual(ctx.designPolicy,designReferencePolicy);assert.equal(ctx.documents.find(d=>d.path===reference.path).authority,'supplemental-reference');assert.equal(ctx.documents.find(d=>d.path===primary.path).authority,'primary-design');
 const map=projectBrief(lib,'component spacing');const facts=Object.values(map.groups).flat();assert.ok(facts.some(f=>f.path===reference.path&&f.authority==='supplemental-reference'));assert.ok(facts.some(f=>f.path===primary.path&&f.authority==='primary-design'));
 const compact=compactLibrary(lib,'design'),planning=planningLibrary(compact),coding=codingPacket({draft:{layer:'design'}},lib);
 for(const packet of [compact,planning,coding.library]){assert.deepEqual(packet.designPolicy,designReferencePolicy);assert.equal(packet.documents.find(d=>d.path===reference.path).authority,'supplemental-reference');assert.equal(packet.documents.find(d=>d.path===primary.path).authority,'primary-design');}
 assert.equal(planning.documents.find(d=>d.path===reference.path).readFullFromCheckout,true);assert.deepEqual(lib,before);
});
