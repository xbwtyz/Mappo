import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransactionProfiler, requireTransactionPhases, summarizeTransactionProfiles}
  from './helpers/transaction-profile.js';

test('S1-A profiler accounts for nested synchronous calls without double counting', () => {
  let t=0;
  const p=createTransactionProfiler(()=>t);
  const inner=p.wrap('inner',()=>{t+=3;return 7;});
  const outer=p.wrap('outer',function(x){t+=2;const n=inner();t+=5;return this.base+x+n;});
  assert.equal(outer.call({base:1},2),10);
  p.begin('apply');t+=4;
  assert.equal(outer.call({base:1},2),10);
  t+=6;
  const row=p.finish();
  assert.deepEqual(row,{label:'apply',wallMs:20,measuredSelfMs:10,uninstrumentedWallMs:10,
    phases:[{name:'inner',calls:1,inclusiveMs:3,selfMs:3},
      {name:'outer',calls:1,inclusiveMs:10,selfMs:7}]});
  assert.equal(requireTransactionPhases(row,['inner','outer']),row);
  assert.throws(()=>requireTransactionPhases(row,['unobserved']),/not observed/);
});

test('S1-A profiler preserves exception identity, rejects overlapping samples and resets', () => {
  let t=0;const p=createTransactionProfiler(()=>t),err=new Error('original');
  const fail=p.wrap('fail',()=>{t+=2;throw err;});
  p.begin('first');assert.throws(()=>p.begin('overlap'),/already active/);
  assert.throws(fail,e=>e===err);
  assert.equal(p.finish().phases[0].selfMs,2);
  assert.throws(()=>p.finish(),/not settled/);
  p.begin('second');t+=3;assert.deepEqual(p.finish().phases,[]);
  assert.throws(()=>p.wrap('missing',null),/Missing transaction phase/);
});

test('S1-A profile summaries include absent phases as zero and preserve raw call counts', () => {
  let t=0;const p=createTransactionProfiler(()=>t);
  const fn=p.wrap('work',()=>{t+=4;});
  p.begin('a');fn();fn();const a=p.finish();
  p.begin('b');t+=2;const b=p.finish();
  const s=summarizeTransactionProfiles([a,b]);
  assert.deepEqual(s,{samples:2,meanWallMs:5,meanMeasuredSelfMs:4,meanUninstrumentedWallMs:1,
    phases:[{name:'work',totalCalls:2,meanCalls:1,meanInclusiveMs:4,meanSelfMs:4}]});
  assert.throws(()=>summarizeTransactionProfiles([]),/No transaction/);
});
