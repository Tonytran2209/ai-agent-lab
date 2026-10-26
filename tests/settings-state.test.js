import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectSettingsState,mainModelSavePayload} from '../src/settings-state.js';
const p={enabled:true,runnerEnabled:true,automationMode:'impact-auto',releaseEnabled:true,releaseEnvironment:'app / production',ciReady:true,autoCompleteAfterApproval:true,agentEnabled:true,ciRepairEnabled:true};
const runtime={workflow:{mode:'direct-v1',serializedProjects:true},classifier:{enabled:true,configured:true,model:'test-model',strategy:'classify'}};
test('settings describe effective classification, approval and release instead of stored toggles alone',()=>{
 const active=projectSettingsState(p,runtime);assert.match(active.pipeline,/AI phân loại.*tự merge/);assert.equal(active.automaticWarning,'');assert.match(active.classifierDescription,/test-model/);
 for(const classifier of [{enabled:false,configured:true},{enabled:true,configured:false}])assert.match(projectSettingsState(p,{...runtime,classifier}).pipeline,/Chuyển nguyên feedback/);
 assert.match(projectSettingsState({...p,agentEnabled:false},runtime).pipeline,/Chuyển nguyên feedback/);
 assert.match(projectSettingsState({...p,enabled:false},runtime).pipeline,/tạm dừng/);
 assert.match(projectSettingsState({...p,runnerEnabled:false},runtime).pipeline,/chưa được phép/);
 assert.match(projectSettingsState({...p,automationMode:'review-medium'},runtime).approvalDescription,/Medium và high cần admin/);
 assert.match(projectSettingsState({...p,autoCompleteAfterApproval:false},runtime).releaseLabel,/Admin nghiệm thu/);
 assert.match(projectSettingsState({...p,releaseEnabled:false},runtime).automaticWarning,/chưa bật phát hành/);
 assert.match(projectSettingsState({...p,ciReady:false},runtime).automaticWarning,/CI/);
 assert.equal(projectSettingsState(p,{...runtime,workflow:{mode:'legacy',serializedProjects:false}}).queueLabel,'Không bật hàng đợi tuần tự');
 assert.equal(projectSettingsState(p).workspaceLabel,'Đang tải');
});
test('saving the Codex model retains saved global policies and excludes unrelated unsaved form edits',()=>{
 const saved={mode:'off',strategy:'plan',model:'classifier-model',dailyCalls:0,dailyTokens:200000,autoSync:false,semanticEnabled:false,syncMinutes:60,mainModel:'old',keyConfigured:true};
 assert.deepEqual(mainModelSavePayload(saved,'new'),{mode:'off',strategy:'plan',model:'classifier-model',dailyCalls:0,dailyTokens:200000,autoSync:false,semanticEnabled:false,syncMinutes:60,mainModel:'new'});
});
