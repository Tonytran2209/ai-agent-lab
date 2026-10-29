import {test} from 'node:test';import assert from 'node:assert/strict';import {activationMatches} from '../mac/runtime-activation.js';
test('old draining child cannot confirm or clear the candidate rollback identity',()=>{
 const old={commit:'a'.repeat(40),entry:'/runtime/a/mac/runner.js'},candidate={commit:'b'.repeat(40),entry:'/runtime/b/mac/runner.js'};
 assert.equal(activationMatches(old,candidate,true),false);assert.equal(activationMatches(candidate,candidate,false),false);assert.equal(activationMatches(candidate,candidate,true),true);assert.equal(activationMatches({...candidate,entry:old.entry},candidate,true),false);assert.equal(activationMatches(candidate,null,true),false);
});
