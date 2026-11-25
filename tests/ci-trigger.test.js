import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyCIRequest, routeFullCI, routeFastCI } from '../scripts/ci-trigger.mjs';

const draft={pull_request:{draft:true}};
const ready={pull_request:{draft:false}};
const sha='0123456789012345678901234567890123456789';
const pr=(draft,head=sha,state='open')=>({draft,state,head:{sha:head}});
const full=(event,message)=>routeFullCI('pull_request',event,message);
const fast=(message,pulls)=>routeFastCI({sha,message,pulls});

test('CI request markers are explicit, case insensitive, and benchmark takes precedence',()=>{
  for(const [message,mode] of [
    ['', 'normal'],['full-ci','normal'],['[full-ci-other]','normal'],
    ['Change\\n[full-ci]','full'],['[FULL-CI]','full'],
    ['[full-ci-benchmark]','benchmark'],['[full-ci] [FULL-CI-BENCHMARK]','benchmark']
  ]) assert.equal(classifyCIRequest(message),mode,message);
});
test('draft PR normal/full/benchmark routing and matching fast suppression',()=>{
  for(const [message,wanted,benchmark] of [['normal',false,false],['[full-ci]',true,false],['[full-ci-benchmark]',true,true]]) {
    assert.deepEqual(full(draft,message),{full:wanted,benchmark});
    assert.deepEqual(fast(message,[pr(true)]),{run:!wanted});
  }
});
test('ready PR always receives full CI and only explicit heavy benchmark',()=>{
  for(const [message,benchmark] of [['normal',false],['[full-ci]',false],['[full-ci-benchmark]',true]]) {
    assert.deepEqual(full(ready,message),{full:true,benchmark});
    assert.deepEqual(fast(message,[pr(false)]),{run:false});
  }
});
test('no PR, stale head, closed PR and failed lookup retain fast checks',()=>{
  for(const message of ['normal','[full-ci]','[full-ci-benchmark]']) {
    for(const pulls of [[],null,undefined,{},[pr(false,'stale')],[pr(true,'stale')],[pr(false,sha,'closed')],[null]]) {
      assert.deepEqual(fast(message,pulls),{run:true});
    }
  }
});
test('main and merge-group gates stay mandatory; manual benchmark remains opt-in',()=>{
  for(const event of ['push','merge_group']) assert.deepEqual(routeFullCI(event,{},'[full-ci-benchmark]'),{full:true,benchmark:false});
  for(const input of [undefined,false,'false',true,'true']) {
    assert.deepEqual(routeFullCI('workflow_dispatch',{inputs:{run_c7_benchmark:input}}),{full:true,benchmark:input===true||input==='true'});
  }
  assert.throws(()=>full({},'[full-ci]'),/Missing PR state/);
  assert.throws(()=>routeFullCI('unknown',{}),/Unsupported full CI event/);
});
test('full routing remains wired to both matrices, benchmark and fail-closed aggregate',()=>{
  const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
  const quick=readFileSync(new URL('../.github/workflows/ci-fast.yml',import.meta.url),'utf8');
  assert.match(ci,/name: Mappo CI/);
  assert.match(ci,/branches: \[main\]/);
  assert.match(ci,/merge_group:/);
  assert.match(ci,/ready_for_review/);
  assert.match(ci,/run: node scripts\/ci-trigger\.mjs full/);
  assert.equal(ci.split("needs.route.outputs.full == 'true'").length-1,3);
  assert.match(ci,/shard: \[1, 2\]/);
  assert.match(ci,/suite: \[desktop, roads, property, integration\]/);
  assert.match(ci,/matrix.suite == 'integration' && needs.route.outputs.benchmark == 'true'/);
  assert.match(ci,/needs: \[route, node, browser\]/);
  assert.match(ci,/needs.route.result != 'success'/);
  assert.match(ci,/test "\$ROUTE_RESULT" = success/);
  assert.match(ci,/test "\$NODE_RESULT" = success/);
  assert.match(ci,/test "\$BROWSER_RESULT" = success/);
  assert.match(ci,/name: Build, Node tests and browser QA/);
  assert.match(quick,/run: node scripts\/ci-trigger\.mjs fast/);
  assert.match(quick,/tests\/ci-trigger\.test\.js/);
});
