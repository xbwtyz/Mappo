import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {digest,gateNames} from '../scripts/development/research/contract.mjs';
import {shardTasks,makeShardEnvelope,aggregateShards} from '../scripts/development/research/shards.mjs';
const m={...JSON.parse(readFileSync(new URL('../docs/development/research/lare-pilot.json',import.meta.url))),sourceRevision:'a'.repeat(40),environment:{nodeMajor:Number(process.versions.node.split('.')[0]),platform:process.platform}};
const id={runId:'123',attempt:'1'};
const clone=x=>JSON.parse(JSON.stringify(x));
const envelopes=()=>[0,1].map(i=>makeShardEnvelope(m,i,id,shardTasks(m,i).map(t=>({key:t.key,manifestDigest:t.manifestDigest,sourceRevision:t.sourceRevision,inputDigest:digest(t),status:'verified',inputFingerprint:digest(t.case),candidateFingerprint:'c'.repeat(64),retired:0,elapsedMs:1,gates:Object.fromEntries(gateNames.map(g=>[g,true]))}))));
test('DEV-OPT sharded pilot covers every task exactly once and enforces global concurrency',()=>{
  const a=shardTasks(m,0),b=shardTasks(m,1);
  assert.equal(new Set([...a,...b].map(t=>t.key)).size,4);
  assert.deepEqual(a.map(t=>t.strategy),['production','production']);
  assert.deepEqual(b.map(t=>t.strategy),['selective-adaptive','selective-adaptive']);
  assert.throws(()=>shardTasks(m,2));
  assert.throws(()=>shardTasks({...m,budget:{...m.budget,concurrency:4}},0));
});
test('DEV-OPT distributed aggregate requires all matching run/attempt/shard evidence',()=>{
  const ok=aggregateShards(m,envelopes(),id,'success');
  assert.equal(ok.complete,true);assert.equal(ok.productionAdoptionAuthorized,false);
  for(const mutate of [e=>e.pop(),e=>e.push(clone(e[0])),e=>e[0].attempt='2',e=>e[0].rows.pop(),e=>e[0].sourceRevision='b'.repeat(40),e=>e[0].rows[0].inputFingerprint='b'.repeat(64),e=>e[0].nodeVersion='22.0.0-mismatched']){
    const e=envelopes();mutate(e);const r=aggregateShards(m,e,id,'success');
    assert.equal(r.complete,false);assert.ok(r.summary.every(s=>!s.eligibleForComparison));
  }
  for(const state of ['failure','cancelled','skipped'])assert.equal(aggregateShards(m,envelopes(),id,state).complete,false);
});
test('DEV-OPT distributed aggregate keeps failed and timed-out tasks visible',()=>{
  for(const status of ['failed','timeout','cancelled','incomplete']){
    const e=envelopes();e[0].rows[0].status=status;
    const r=aggregateShards(m,e,id,'failure');
    assert.equal(r.complete,false);assert.equal(r.results.find(x=>x.key===e[0].rows[0].key).status,status);
  }
});

// Catch malformed interpolation before Actions attempts to parse the workflow.
test('DEV-OPT pilot workflow uses balanced GitHub expression delimiters',()=>{
  const yaml=readFileSync(new URL('../.github/workflows/research-pilot.yml',import.meta.url),'utf8');
  const open=String.fromCharCode(36)+'{{';
  const expressions=yaml.split(open).slice(1);
  assert.ok(expressions.length>=10);
  for(const part of expressions)assert.match(part,/^\s*[a-zA-Z0-9_.]+\s*\}\}/);
  assert.match(yaml,/contents: read/);
  assert.match(yaml,/max-parallel: 2/);
});
