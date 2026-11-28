import test from 'node:test';
import assert from 'node:assert/strict';
import {auditAdaptiveHub} from '../scripts/development/research/square-trial-hub-audit.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {SQUARE_TOURNAMENT_CASES,squareTournamentFrozenRow,materializeFrozenSquareTournament} from '../scripts/development/research/square-trial-tournament-lock.mjs';
import {searchSquareTrialRecovery} from '../scripts/development/research/ares-p5-holdout-plaza-recovery.mjs';
const budget=()=>createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
test('Adaptive hub gate accepts valid reshape and rejects collapse, removed edge and through street',()=>{
 const vertices=['a','b','c','d'],nodes=[{id:'a',x:0,y:0},{id:'b',x:20,y:0},{id:'c',x:20,y:20},{id:'d',x:0,y:20}],roads=vertices.map((id,i)=>({id:'r'+i,a:id,b:vertices[(i+1)%4],kind:'primary'}));
 const hub={id:'BLK-TRIAL-HUB',vertices,area:400,roadIds:roads.map(r=>r.id)},city={nodes,roads,blocks:[{id:hub.id,vertices,area:400}]};
 const check=c=>auditAdaptiveHub(city,c,hub,budget());
 const reshaped={...city,nodes:nodes.map(n=>n.id==='c'?{...n,x:25,y:23}:n)};
 assert.equal(check(reshaped).status,'hub-verified');
 assert.equal(check({...city,nodes:nodes.map(n=>({...n,y:0}))}).status,'rejected');
 assert.equal(check({...city,roads:roads.slice(1)}).status,'rejected');
 assert.equal(check({...city,roads:[...roads,{id:'diagonal',a:'a',b:'c',kind:'lane'}]}).reason,'hub-through-road');
 assert.equal(check({...city,nodes:[...nodes,{id:'intruder',x:10,y:10}]}).reason,'hub-interior-junction');
});
test('Frozen inventory covers all 225 arms; unknown cases refused',()=>{
 assert.equal(SQUARE_TOURNAMENT_CASES.length,225);
 assert.equal(SQUARE_TOURNAMENT_CASES.filter(id=>id.endsWith(':adaptive')).length,25);
 assert.throws(()=>squareTournamentFrozenRow('sq:tournament:planned-01:adaptive'));
});
for(const id of ['sq:tournament:radial-01:adaptive','sq:tournament:radial-02:adaptive','sq:tournament:radial-03:adaptive'])test('Real frozen adaptive hub baseline '+id,()=>{
 const r=squareTournamentFrozenRow(id),p=materializeFrozenSquareTournament(id);
 assert.equal(auditAdaptiveHub(p.city,p.city,r.hub,budget()).status,'hub-verified');
});
for(const arm of ['control','experimental','adaptive'])test('Three-arm tournament route qualification '+arm,async()=>{
 const id='sq:tournament:radial-01:'+arm,r=await searchSquareTrialRecovery(id);
 console.log('SQUARE_TOURNAMENT_ROUTE '+JSON.stringify({id,status:r.status,reason:r.reason,source:r.source,stats:r.stats,hub:r.audit?.hub,audit:r.audit?.status}));
 assert.equal(r.authority,'none');assert.equal(r.source,squareTournamentFrozenRow(id).source);
 if(r.status==='verified'&&arm==='adaptive')assert.equal(r.audit.hub.status,'hub-verified');
});
