import {test} from 'node:test';import assert from 'node:assert/strict';import {ciStatusSnapshot} from '../src/ci-status.js';
const commit='a'.repeat(40),observed={commit,observedAt:'2026-10-29T01:00:00Z',jobs:[{name:'browser-tests (mobile)',status:'in_progress',stage:'Đang chạy kiểm thử giao diện'}]};
test('terminal exact result replaces stale pending UI for existing saved requests without inventing shard evidence',()=>{
 const r={result:{commit},ciObservation:structuredClone(observed),verification:{phase:'passed',source:'github-actions',at:'2026-10-29T01:01:00Z',evidenceUrl:'https://github.com/o/r/actions/runs/1/job/2'}};
 const snapshot=ciStatusSnapshot(r);assert.equal(snapshot.summary,true);assert.equal(snapshot.jobs.length,1);assert.equal(snapshot.jobs[0].conclusion,'success');assert.equal(r.ciObservation.jobs[0].status,'in_progress');
 r.verification.source='admin-attested';assert.equal(ciStatusSnapshot(r),r.ciObservation);
 r.verification={phase:'failed',at:'2026-10-29T01:01:00Z'};assert.equal(ciStatusSnapshot(r).historical,true);
});
test('actual terminal shard snapshot is retained and wrong-commit pending details are not shown as current',()=>{
 const jobs=[{name:'browser-check',status:'completed',conclusion:'success'}];const r={result:{commit},ciObservation:{...observed,jobs},verification:{phase:'passed',source:'github-actions'}};assert.equal(ciStatusSnapshot(r),r.ciObservation);r.ciObservation.commit='b'.repeat(40);assert.equal(ciStatusSnapshot(r).summary,true);
});
