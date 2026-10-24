import {test} from 'node:test';import assert from 'node:assert/strict';

test('automatic acceptance does not ask admin for a second review; expired rechecks need attention',async()=>{const {requiresAttention}=await import('../src/workflow.js');assert.equal(requiresAttention({status:'review',delivery:{approvalHash:'approved',phase:'checking'}}),false);assert.equal(requiresAttention({status:'review',delivery:{approvalHash:'approved',phase:'failed'}}),true);assert.equal(requiresAttention({status:'review'}),true);assert.equal(requiresAttention({status:'rechecking',recheck:{lease:{expiresAt:new Date(0).toISOString()}}}),true);});

test('CI failure is shown ahead of incomplete criterion evidence',async()=>{const {taskProgress}=await import('../src/workflow.js');const r={status:'failed',contract:{required:true,complete:false},verification:{phase:'failed',note:'Browser CI failed on desktop and mobile.'}};assert.match(JSON.stringify(taskProgress(r)),/Browser CI failed/);});
