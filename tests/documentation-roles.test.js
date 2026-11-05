import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentationScopeIssues,documentationReviewSchema,assessContract} from '../server/contracts.js';
import {validateDraft} from '../server/service.js';
const design='.agent-hub/design/design.md',components='.agent-hub/design/components.md',guide='.agent-hub/design/user-guide.md';
const library={documents:[design,components,guide].map(path=>({path,content:'Pinned canonical design contract'})),sourcePaths:[design,components,guide,'src/App.jsx'],scopePolicy:{design:['src/App.jsx',design,components,guide]}};
const review={updatesNeeded:true,documents:[components,guide],referenceDocuments:[design],reason:'Update UI behavior docs; shared design rules remain unchanged.'};
test('separate read-only canonical references do not require edit scope or a changed file',()=>{
 assert.deepEqual(documentationScopeIssues(review,[components,guide],library),[]);
 const r={contractProtocol:'md-trace-v1',draft:{acceptanceCriteria:[],documentationReview:review},result:{changedPaths:[components,guide],documentationReview:review,criterionEvidence:[]}};
 assert.equal(assessContract(r).documentationStatus,'updated');
 assert.equal(documentationReviewSchema.safeParse({...review,referenceDocuments:['../secret']}).success,false);
 assert.equal(documentationReviewSchema.safeParse({...review,referenceDocuments:undefined}).success,true);
});
test('mixed required and reference MD produces exact actionable diagnostics without expanding scope',()=>{
 const paths=[components,guide],mixed={...review,documents:[design,components,guide],referenceDocuments:[]};
 const issues=documentationScopeIssues(mixed,paths,library);
 assert.equal(issues.length,1);assert.equal(issues[0].path,'draft.documentationReview.documents.0');assert.equal(issues[0].code,'DOCUMENT_SCOPE');assert.match(issues[0].message,/design.md/);assert.match(issues[0].message,/referenceDocuments/);
 assert.deepEqual(paths,[components,guide]);assert.deepEqual(mixed.documents,[design,components,guide]);
});
test('unavailable or contradictory references are rejected and do not become edit permission',()=>{
 assert.ok(documentationScopeIssues({...review,referenceDocuments:['.agent-hub/design/missing.md']},[components,guide],library).some(x=>x.code==='DOCUMENT_LIBRARY'));
 assert.ok(documentationScopeIssues({...review,referenceDocuments:[components]},[components,guide],library).some(x=>x.code==='DOCUMENT_ROLE'));
 assert.ok(documentationScopeIssues({...review,documents:[]},[components,guide],library).some(x=>x.code==='DOCUMENT_SCOPE'));
});
test('public draft validation keeps required-document scope authoritative with field-specific errors',()=>{
 const d={title:'Fix preview UI',problem:'Change visual layout while preserving stored data.',layer:'design',module:'Draft',risk:'low',questions:[],allowedPaths:[components,guide],acceptanceCriteria:['The preview layout is consistent.'],documentationReview:{...review,documents:[design,components,guide],referenceDocuments:[]}};
 assert.throws(()=>validateDraft(d,library),e=>e.code==='DOCUMENT_REVIEW'&&e.details[0].path==='draft.documentationReview.documents.0');
});
