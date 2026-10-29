import {test} from 'node:test';import assert from 'node:assert/strict';import {activationMatches,candidateFresh} from '../mac/runtime-activation.js';
test('old draining child cannot confirm or clear the candidate rollback identity',()=>{
 const old={commit:'a'.repeat(40),entry:'/runtime/a/mac/runner.js'},candidate={commit:'b'.repeat(40),entry:'/runtime/b/mac/runner.js'};
 assert.equal(activationMatches(old,candidate,true),false);assert.equal(activationMatches(candidate,candidate,false),false);assert.equal(activationMatches(candidate,candidate,true),true);assert.equal(activationMatches({...candidate,entry:old.entry},candidate,true),false);assert.equal(activationMatches(candidate,null,true),false);
});

test('runtime evidence expires before a delayed drain can activate it',()=>{assert.equal(candidateFresh({verifiedAt:1000},1001),true);assert.equal(candidateFresh({verifiedAt:1000},61000),false);assert.equal(candidateFresh({verifiedAt:1000},999),false);assert.equal(candidateFresh({},1000),false);});
