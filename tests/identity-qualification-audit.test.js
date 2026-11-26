import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyCorpus} from '../scripts/verify-identity-qualification.mjs';
const inventory=JSON.parse(readFileSync(new URL('../scripts/identity-qualification-corpus.json',import.meta.url),'utf8'));
const all=Object.values(inventory.cases).flat();
const lines=all.map((name,i)=>'ok '+(i+1)+' - '+name);
const logs=items=>[items.slice(0,100).join('\n'),items.slice(100).join('\n')];
test('IDA qualification inventory meets every minimum with distinct named cases',()=>{
 const r=verifyCorpus(logs(lines));
 assert.equal(r.ok,true,r.errors.join('; '));
 assert.equal(r.totalRegistered,all.length);
 assert.equal(r.totalPassed,all.length);
 assert.ok(all.length>=224);
});
test('IDA qualification audit refuses missing execution evidence',()=>{
 const r=verifyCorpus(logs(lines.slice(1)));
 assert.equal(r.ok,false);assert.equal(r.totalPassed,all.length-1);
 assert.ok(r.errors.some(e=>e.startsWith('Missing execution evidence:')));
});
test('IDA qualification audit refuses skipped, TODO and failed executions',()=>{
 for(const suffix of [' # SKIP blocked',' # TODO later']){
  const r=verifyCorpus(logs([lines[0]+suffix,...lines.slice(1)]));
  assert.equal(r.ok,false);assert.equal(r.totalPassed,all.length-1);
 }
 const r=verifyCorpus(logs(['not '+lines[0],...lines.slice(1)]));
 assert.equal(r.ok,false);assert.equal(r.totalPassed,all.length-1);
});
test('IDA qualification audit refuses duplicate execution or duplicate membership',()=>{
 assert.equal(verifyCorpus(logs([...lines,lines[0]])).ok,false);
 const bad=structuredClone(inventory);bad.cases.copies.push(all[0]);
 assert.equal(verifyCorpus(logs(lines),bad).ok,false);
});
test('IDA qualification audit accepts timestamped Actions TAP but not subtest announcements as proof',()=>{
 const timestamped=lines.map(l=>'2026-11-25T05:30:00.0000000Z '+l);
 assert.equal(verifyCorpus(logs(timestamped)).ok,true);
 const r=verifyCorpus(logs(all.map(n=>'# Subtest: '+n)));
 assert.equal(r.ok,false);assert.equal(r.totalPassed,0);
});
