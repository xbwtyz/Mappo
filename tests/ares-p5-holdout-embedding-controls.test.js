import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddingWalks,compareEmbedding,EMBEDDING_CASES,diagnoseHoldoutEmbedding} from '../scripts/development/research/ares-p5-holdout-embedding-diagnostics.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
const budget=()=>createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
test('Four-edge star permutation accounts for every directed edge',()=>{
 const n=[{id:'o',x:0,y:0},{id:'a',x:1,y:0},{id:'b',x:0,y:1},{id:'c',x:-1,y:0},{id:'d',x:0,y:-1}],r=n.slice(1).map(x=>({id:'r'+x.id,a:'o',b:x.id})),b=budget();
 const a=embeddingWalks(n,r,b),same=compareEmbedding(a,embeddingWalks(n,r,b),b);
 assert.equal(a.darts,8);assert.equal(a.walks.reduce((s,w)=>s+w.length,0),8);assert.equal(same.changed.length,0);assert.equal(same.removed.length,0);
 const moved=n.map(x=>x.id==='b'?{...x,x:-1,y:0}:x.id==='c'?{...x,x:0,y:1}:x);
 const c=compareEmbedding(a,embeddingWalks(moved,r,b),b);assert.equal(c.changed.length,1);assert.ok(c.removed.length>0&&c.added.length>0);
});
test('Frozen diagnostic cohort excludes verified recoveries',async()=>{
 assert.equal(EMBEDDING_CASES.length,9);await assert.rejects(()=>diagnoseHoldoutEmbedding('h:linear-09'),/Frozen embedding/);
});
