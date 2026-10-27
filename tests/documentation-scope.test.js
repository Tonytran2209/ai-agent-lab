import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentationScopeIssues} from '../server/contracts.js';
const edited='.agent-hub/design/flows.md',reference='.agent-hub/backend/api-contracts.md';
const library={documents:[{path:edited},{path:reference}]};
const draft={allowedPaths:['src/App.tsx',edited],documentationReview:{updatesNeeded:true,documents:[edited],referenceDocuments:[reference],reason:'Only the displayed workflow changes; API remains unchanged.'}};
test('MD edit scope and unchanged reference documents are distinct without expanding scope',()=>{
 const before=structuredClone(draft);assert.deepEqual(documentationScopeIssues(draft,library),[]);assert.deepEqual(draft,before);
 const bad=structuredClone(draft);bad.documentationReview.documents.push(reference);
 const issues=documentationScopeIssues(bad,library);assert.equal(issues[0].code,'MD_UPDATE_OUTSIDE_SCOPE');assert.equal(issues[0].path,'draft.documentationReview.documents.1');assert.ok(issues[0].message.includes(reference));assert.deepEqual(bad.allowedPaths,draft.allowedPaths);
 assert.ok(issues.some(v=>v.code==='MD_ROLE_CONFLICT'));
});
test('empty updates and unpinned references fail with exact field diagnostics; old reviews remain compatible',()=>{
 assert.equal(documentationScopeIssues({...draft,documentationReview:{...draft.documentationReview,documents:[]}},library)[0].code,'MD_UPDATE_EMPTY');
 assert.equal(documentationScopeIssues({...draft,documentationReview:{...draft.documentationReview,referenceDocuments:['.agent-hub/backend/unknown.md']}},library)[0].code,'MD_NOT_PINNED');
 assert.deepEqual(documentationScopeIssues({...draft,documentationReview:{updatesNeeded:false,documents:[],reason:'No contract has changed in this bounded display update.'}},library),[]);
});
