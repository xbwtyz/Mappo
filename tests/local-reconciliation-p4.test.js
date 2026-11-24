import test from 'node:test';
import assert from 'node:assert/strict';
import {createLareBudget} from '../src/core/reconciliation-budget.js';
import {compareLareScore,runLareSearch,iterateLareSearch} from '../src/core/reconciliation-search.js';
import {solveLareArrangement} from '../src/core/reconciliation-arrangement.js';
import {shapesOverlapInterior} from '../src/core/building-validation.js';

const budget=()=>createLareBudget(),score=(m=0,d=0,r=0,p=0,t=0,a=0)=>[m,d,r,p,t,a];
const candidate=(key,s=score())=>({key,score:s});
const request=(overrides={})=>({
  variables:['A','B'],
  choices:()=>[candidate('same'),candidate('alternative',score(0,0,0,1))],
  compatible:(id,c,state)=>!state.assignments.some(r=>r.choice.key===c.key),
  finalize:r=>({score:r.score,key:r.key,assignments:r.assignments}),...overrides
});
test('B1R ranking is lexicographic, not a weighted tradeoff',()=>{
  assert.ok(compareLareScore(score(0,1000000),score(1))<0);
  assert.ok(compareLareScore(score(1,1,100),score(1,2))<0);
  assert.throws(()=>compareLareScore(score(NaN),score()),/Invalid/);
});
test('B1R cooperative search retains alternate arrangements and rejects conflicts',()=>{
  const result=runLareSearch(request(),budget());
  assert.equal(result.status,'candidate');assert.equal(result.best.score[3],1);
  assert.equal(result.best.assignments.length,2);
  assert.notEqual(result.best.assignments[0].choice.key,result.best.assignments[1].choice.key);
  assert.deepEqual(result,runLareSearch(request(),budget()));
});
test('B1R staged and synchronous search return identical candidates',()=>{
  const iterator=iterateLareSearch(request(),budget());let step=iterator.next(),slices=0;
  while(!step.done){slices++;step=iterator.next();}
  assert.ok(slices>1);assert.deepEqual(step.value,runLareSearch(request(),budget()));
});
test('B1R cannot publish an unvalidated or partial candidate',()=>{
  const result=runLareSearch(request({finalize:()=>null}),budget());
  assert.equal(result.status,'search-exhausted');assert.equal(result.best,null);
  const limited=runLareSearch(request(),createLareBudget({work:100,stateExpansions:1}));
  assert.equal(limited.status,'work-limit');assert.equal(limited.best,null);
});
test('B1R retains a verified incumbent on exhaustion, not an unverified one',()=>{
  const incumbent={key:'verified',score:score(1),assignments:[]};
  const limited=()=>createLareBudget({work:100,stateExpansions:1});
  const result=runLareSearch(request({incumbent}),limited());
  assert.equal(result.status,'candidate');assert.equal(result.best.key,'verified');
  assert.equal(result.exhausted,'stateExpansions');
  const refused=runLareSearch(request({incumbent,finalize:()=>null}),limited());
  assert.equal(refused.status,'work-limit');assert.equal(refused.best,null);
});
const rect=(l,f,r,b)=>[{x:l,y:f},{x:r,y:f},{x:r,y:b},{x:l,y:b}];
function arrangementEntries(){
  const block=rect(0,0,100,100),edges=block.map((a,i)=>({a,b:block[(i+1)%4],road:{id:'R'+i,kind:'lane'}}));
  const entry=(id,boundary)=>({property:{id,blockId:'F',frontageRoadId:'R0',boundary,plotIds:[id+'Q'],buildingIds:[]},
    plots:[{id:id+'Q',boundary,propertyId:id}],buildings:[],edge:edges[0],edges,mode:'adaptive'});
  return [entry('A',rect(15,5,35,30)),entry('B',rect(30,5,50,30))];
}
test('B1R real parcel solver coordinates conflicting preferred layouts',()=>{
  const entries=arrangementEntries(),before=JSON.stringify(entries);
  const result=solveLareArrangement({entries,finalize:row=>({score:row.score,key:row.key,parcels:row.parcels,buildings:row.buildings})},budget());
  assert.equal(result.status,'candidate');assert.equal(result.best.parcels.length,2);
  assert.ok(!shapesOverlapInterior(...result.best.parcels.map(p=>p.property.boundary)));
  assert.ok(result.best.score[3]>0);assert.equal(JSON.stringify(entries),before);
});
test('B1R inventory exhaustion keeps only an independently verified incumbent',()=>{
  const incumbent={score:score(1),key:'baseline'};
  const result=solveLareArrangement({entries:arrangementEntries(),incumbent,finalize:(row,old)=>old?row:null},
    createLareBudget({work:2,stateExpansions:1}));
  assert.equal(result.status,'candidate');assert.equal(result.best.key,'baseline');assert.equal(result.exhausted,'work');
});

test('B1R stable tie keys grow linearly across large neighborhoods',()=>{
  const variables=Array.from({length:200},(_,i)=>'P'+i);
  const result=runLareSearch({variables,choices:()=>[candidate('chosen')],
    finalize:r=>({score:r.score,key:r.key,assignments:r.assignments})},budget());
  assert.equal(result.status,'candidate');assert.equal(result.best.assignments.length,200);
  assert.ok(result.best.key.length<6000);
});

test('B1R validates a complete greedy arrangement before bounded beam exhaustion',()=>{
  const entries=arrangementEntries();let validations=0;
  const result=solveLareArrangement({entries,finalize:row=>{validations++;return {score:row.score,key:row.key,parcels:row.parcels};}},
    createLareBudget({work:1000000,stateExpansions:120}));
  assert.equal(result.status,'candidate');assert.ok(validations>0);
  assert.equal(result.best.parcels.length,2);
  assert.ok(!shapesOverlapInterior(...result.best.parcels.map(p=>p.property.boundary)));
});
