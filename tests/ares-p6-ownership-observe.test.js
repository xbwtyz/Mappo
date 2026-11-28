import test from 'node:test';
import assert from 'node:assert/strict';
import {auditP6ExplicitInventory} from '../scripts/development/research/ares-p6-inventory-audit.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {observeP6Ownership,P6_A_CASES} from '../scripts/development/research/ares-p6-ownership-observe.mjs';
for(const id of P6_A_CASES)test('P6-A1 detached ownership inventory '+id,async()=>{
 const r=await observeP6Ownership(id);
 const o0=r.observation,classes={};
 for(const row of o0?.objects??[])classes[row.classification]=(classes[row.classification]??0)+1;
 console.log('ARES_P6_OWNERSHIP_SUMMARY '+JSON.stringify({id:r.id,status:r.status,reason:r.reason,roadAudit:r.roadAudit?.stats,stats:r.stats,counts:o0?.counts,roots:o0?.roots.length,objects:o0?.objects.length,external:o0?.external.length,omitted:o0?.omitted.length,relationships:o0?.relationships.length,classes,plaza:o0?.plaza,inventoryAudit:r.inventoryAudit}));
 console.log('ARES_P6_OWNERSHIP '+JSON.stringify(r));
 assert.equal(r.authority,'none');assert.equal(r.landVerified,false);assert.equal(r.geometryCoverage,'not-evaluated');
 if(id==='t:t-radial-01'){assert.equal(r.status,'road-refused');assert.equal(r.roadAudit,null);assert.equal(r.observation,undefined);return;}
 assert.equal(r.roadAudit.status,'topology-final-verified');assert.equal(r.status,'observed');
 assert.equal(r.inventoryAudit.status,'matched');assert.equal(r.inventoryAudit.authority,'none');
 const o=r.observation;assert.equal(o.coverage,'explicit-references-only');assert.ok(o.counts.blocks>0);assert.ok(o.counts.properties>0);assert.ok(o.counts.buildings>0);assert.equal(o.omitted.length,0);
 assert.ok(o.objects.every(x=>x.depth<=6));assert.ok(o.objects.length<=10000);assert.equal(new Set(o.objects.map(x=>JSON.stringify(x.ref))).size,o.objects.length);
 assert.ok(o.objects.every(x=>['observe-only','generated-review-only','protected-or-unsupported'].includes(x.classification)));
 assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);assert.ok(Object.isFrozen(o));assert.equal(o.plaza.classification,'protected');
});
test('P6 A1 refuses arbitrary source and unregistered qualified recipe',async()=>{await assert.rejects(observeP6Ownership('h:radial-06'));await assert.rejects(observeP6Ownership('t:t-planned-14'));});

test('P6 A2a independent raw inventory detects missing, extra, wrong depth and duplicate claims',()=>{
 const city={roads:[{id:'r',a:'a',b:'b'}],blocks:[{id:'x',vertices:['a','b','c']}],properties:[{id:'p',blockId:'x',plotIds:['q']}],plots:[{id:'q',propertyId:'p'}],buildings:[],openSpaces:[]};
 const w={requested:[{ref:{id:'a'}}],neighbors:[],lineage:[]};
 const ref=(collection,id)=>({collection,id});
 const roots=[ref('nodes','a'),ref('roads','r'),ref('blocks','x')];
 const objects=[...roots.map(ref=>({ref,depth:0})),{ref:ref('properties','p'),depth:1},{ref:ref('plots','q'),depth:2}];
 const observed={roots,objects,omitted:[]};
 const check=x=>auditP6ExplicitInventory(city,w,x,createSpatialPreservationBudget({work:8000000,stateExpansions:32768}));
 assert.equal(check(observed).status,'matched');
 const bad=check({...observed,objects:[...objects.slice(0,3),{ref:ref('properties','p'),depth:2},{ref:ref('roads','r'),depth:0},{ref:ref('plots','fake'),depth:1}]});
 assert.equal(bad.status,'inventory-mismatch');
 assert.equal(bad.differences.objects.missing.length,1);assert.equal(bad.differences.objects.extra.length,1);
 assert.equal(bad.differences.objects.wrong.length,1);assert.equal(bad.differences.objects.duplicates.length,1);
});
