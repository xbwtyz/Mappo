import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {validateResearchManifest,expandResearchManifest,aggregateResearch,digest,gateNames} from '../scripts/development/research/contract.mjs';
import {runResearch,executeResearchTask} from '../scripts/development/research/runner.mjs';
const fixture=JSON.parse(readFileSync(new URL('../docs/development/research/lare-pilot.json',import.meta.url)));
const m={...fixture,sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),environment:{nodeMajor:Number(process.versions.node.split('.')[0]),platform:process.platform}};
const clone=v=>JSON.parse(JSON.stringify(v));
test('DEV-OPT research manifest bounds scope, concurrency and distinct corpus partitions',()=>{
  assert.equal(expandResearchManifest(m).length,4);
  for(const change of [x=>x.budget.concurrency=5,x=>x.strategies.push('custom-command'),x=>x.cases[1].partition='development',x=>x.cases[1]={...x.cases[0],id:'different',partition:'held-out'},x=>x.cases[0].offset.x=Infinity]){
    const bad=clone(m);change(bad);assert.throws(()=>validateResearchManifest(bad));
  }
});
test('DEV-OPT research aggregator refuses absent, invalid, stale or duplicate results',()=>{
  const tasks=expandResearchManifest(m),rows=tasks.map(t=>({key:t.key,sourceRevision:t.sourceRevision,manifestDigest:t.manifestDigest,inputDigest:digest(t),status:'verified',candidateFingerprint:'a'.repeat(64),retired:0,elapsedMs:1,gates:Object.fromEntries(gateNames.map(g=>[g,true]))}));
  assert.equal(aggregateResearch(m,rows).complete,true);
  assert.equal(aggregateResearch(m,rows.slice(1)).complete,false);
  for(const change of [x=>x.gates.topology=false,x=>x.sourceRevision='b'.repeat(40),x=>x.status='timeout',x=>x.status='cancelled',x=>x.status='failed']){
    const bad=clone(rows);change(bad[0]);assert.equal(aggregateResearch(m,bad).complete,false);
  }
  assert.throws(()=>aggregateResearch(m,[...rows,rows[0]]),/Duplicate/);
});
test('DEV-OPT real LARE pilot: two strategies, held-out fixture, isolated deterministic validation',{timeout:180000},async()=>{
  const result=await runResearch(m);
  console.log('DEV_OPT_RESEARCH_PILOT '+JSON.stringify(result));
  assert.equal(result.complete,true);assert.equal(result.results.length,4);
  // Both existing known-valid fixtures must pass for both strategies.
  // A successful selective strategy cannot conceal a broken production mapping.
  for(const row of result.results)assert.equal(row.status,'verified',JSON.stringify(row));
  for(const c of m.cases){
    const pair=result.results.filter(r=>r.key.startsWith(c.id+':'));
    assert.equal(pair.length,2);assert.equal(pair[0].inputFingerprint,pair[1].inputFingerprint);
  }
  assert.equal(result.productionAdoptionAuthorized,false);
  const stale={...m,sourceRevision:'0'.repeat(40)};await assert.rejects(runResearch(stale),/revision mismatch/);
});
test('DEV-OPT isolated experiment timeout cannot become a successful candidate',{timeout:10000},async()=>{
  const r=await executeResearchTask(expandResearchManifest(m)[0],1);
  assert.equal(r.status,'timeout');assert.equal(r.diagnostic.exitCode,null);
});
