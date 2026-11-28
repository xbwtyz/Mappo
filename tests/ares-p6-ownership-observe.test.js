import test from 'node:test';
import assert from 'node:assert/strict';
import {observeP6LandClosure} from '../scripts/development/research/ares-p6-land-closure.mjs';
import {auditP6ExternalContext} from '../scripts/development/research/ares-p6-context-audit.mjs';
import {observeP6GeometricImpact} from '../scripts/development/research/ares-p6-geometric-impact.mjs';
import {auditP6ExplicitInventory} from '../scripts/development/research/ares-p6-inventory-audit.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {observeP6Ownership,P6_A_CASES} from '../scripts/development/research/ares-p6-ownership-observe.mjs';
for(const id of P6_A_CASES)test('P6-A1 detached ownership inventory '+id,async()=>{
 const r=await observeP6Ownership(id);
 const o0=r.observation,classes={};
 for(const row of o0?.objects??[])classes[row.classification]=(classes[row.classification]??0)+1;
 console.log('ARES_P6_OWNERSHIP_SUMMARY '+JSON.stringify({id:r.id,status:r.status,reason:r.reason,roadAudit:r.roadAudit?.stats,stats:r.stats,counts:o0?.counts,roots:o0?.roots.length,objects:o0?.objects.length,external:o0?.external.length,omitted:o0?.omitted.length,relationships:o0?.relationships.length,classes,plaza:o0?.plaza,inventoryAudit:r.inventoryAudit,externalAudit:r.externalAudit,landClosure:r.landClosure&&{status:r.landClosure.status,added:r.landClosure.added,counts:r.landClosure.counts,geometricSeeds:r.landClosure.geometricSeeds,unionSize:r.landClosure.unionSize,objects:r.landClosure.inventory?.objects.length,external:r.landClosure.external?.length,omitted:r.landClosure.inventory?.omitted.length,audit:r.landClosure.audit},opaqueContext:r.opaqueContext&&{status:r.opaqueContext.status,count:r.opaqueContext.rows.length,fields:[...new Set(r.opaqueContext.rows.map(x=>x.field))].slice(0,30)},geometricImpact:r.geometricImpact&&{...r.geometricImpact,rows:undefined,unsupportedCount:r.geometricImpact.unsupported.length,candidates:r.geometricImpact.rows.length,outsideExplicit:r.geometricImpact.rows.filter(x=>x.membership==='outside-explicit').length}}));
 console.log('ARES_P6_OWNERSHIP '+JSON.stringify(r));
 assert.equal(r.authority,'none');assert.equal(r.landVerified,false);assert.equal(r.geometryCoverage,'not-evaluated');
 if(id==='t:t-radial-01'){assert.equal(r.status,'road-refused');assert.equal(r.roadAudit,null);assert.equal(r.observation,undefined);return;}
 assert.equal(r.roadAudit.status,'topology-final-verified');assert.equal(r.status,'observed');
 assert.equal(r.landClosure.status,'closure-observed');assert.equal(r.landClosure.audit.status,'matched');
 assert.equal(r.landClosure.authority,'none');assert.equal(r.landClosure.landVerified,false);
 assert.ok(r.landClosure.inventory.objects.every(x=>x.classification==='observe-only'&&x.depth<=6));
 assert.ok(r.landClosure.added>0);assert.ok(r.landClosure.unionSize<=10000);
 assert.equal(r.externalAudit.status,'matched');assert.equal(r.opaqueContext.authority,'none');
 assert.ok(['review-required','no-known-opaque-flags'].includes(r.opaqueContext.status));
 assert.equal(r.geometricImpact.authority,'none');assert.equal(r.geometricImpact.landVerified,false);
 assert.equal(r.geometricImpact.coverage,'known-source-geometry-bounds-only');
 assert.ok(r.geometricImpact.rows.length>0);assert.equal(r.geometricImpact.roadCount,r.observation.changedParentRoads.length);
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

test('P6 A2b conservative swept bounds find unreferenced land, protected context and unsupported geometry',()=>{
 const p=(x,y)=>({x,y}),ring=(x,y)=>[p(x,y),p(x+1,y),p(x+1,y+1),p(x,y+1)];
 const city={nodes:[{id:'a',...p(0,0)},{id:'b',...p(10,0)},{id:'c',...p(0,50)},{id:'d',...p(10,50)}],
 roads:[{id:'r',a:'a',b:'b',kind:'lane'},{id:'split',a:'c',b:'d',kind:'lane'}],
 blocks:[],plots:[],buildings:[],openSpaces:[],properties:[{id:'sweep',boundary:ring(5,20)},{id:'final',boundary:ring(5,41)},{id:'stationary-split',boundary:ring(5,50)},{id:'far',boundary:ring(100,100)},{id:'unknown'}],
 plaza:{id:'square',vertices:['a','c','d','b']}};
 const w={requested:[{ref:{id:'a'},point:p(0,40)},{ref:{id:'b'},point:p(10,40)}],neighbors:[],lineage:[{parent:'split'}]};
 const before=JSON.stringify(city),r=observeP6GeometricImpact(city,w,{objects:[],external:[]},createSpatialPreservationBudget({work:8000000,stateExpansions:32768}));
 assert.equal(r.status,'unsupported-geometry');assert.equal(r.roadCount,2);assert.equal(r.authority,'none');
 const row=id=>r.rows.find(x=>x.ref.id===id);
 assert.equal(row('sweep').membership,'outside-explicit');assert.deepEqual(row('sweep').hits,[{roadId:'r',before:false,final:false}]);
 assert.equal(row('final').hits[0].final,true);assert.equal(row('stationary-split').hits[0].roadId,'split');
 assert.equal(row('square').protectedContext,true);assert.equal(row('far'),undefined);
 assert.deepEqual(r.unsupported,[{collection:'properties',id:'unknown'}]);assert.equal(JSON.stringify(city),before);
});

test('P6 A2c external context audit rejects missing, duplicate and downgraded protected records',()=>{
 const a={collection:'roads',id:'r'},c={collection:'bridges',id:'b'},d={collection:'nodes',id:'n'};
 const o={objects:[{ref:a}],relationships:[{from:a,to:c},{from:d,to:a}],external:[{ref:c,classification:'protected'},{ref:d,classification:'observe-only'}]};
 const check=x=>auditP6ExternalContext(x,createSpatialPreservationBudget({work:8000000,stateExpansions:32768}));
 assert.equal(check(o).status,'matched');
 const bad=check({...o,external:[{ref:c,classification:'observe-only'},{ref:c,classification:'observe-only'}]});
 assert.equal(bad.status,'context-mismatch');assert.equal(bad.missing.length,1);assert.equal(bad.wrong.length,1);assert.equal(bad.duplicates.length,1);
});
test('P6 A2c protected infrastructure broad phase observes features and unknown crossing geometry without authority',()=>{
 const p=(x,y)=>({x,y}),ring=[p(2,15),p(8,15),p(8,25),p(2,25)];
 const city={nodes:[{id:'a',...p(0,0)},{id:'b',...p(10,0)}],roads:[{id:'r',a:'a',b:'b',kind:'lane'}],
 waterFeatures:[{id:'river',corridor:ring}],bridges:[{id:'unmapped',waterId:'river',width:5}],
 terrainFeatures:[{id:'hill',corridor:ring}],walls:[{id:'wall',path:ring,width:6}],
 towers:[{id:'tower',center:p(5,20),radius:3}]};
 const w={requested:[{ref:{id:'a'},point:p(0,40)},{ref:{id:'b'},point:p(10,40)}],neighbors:[],lineage:[]};
 const r=observeP6GeometricImpact(city,w,{objects:[],external:[]},createSpatialPreservationBudget({work:8000000,stateExpansions:32768}));
 assert.equal(r.status,'unsupported-geometry');assert.equal(r.authority,'none');
 for(const id of ['river','hill','wall','tower'])assert.equal(r.rows.find(x=>x.ref.id===id).protectedContext,true);
 assert.deepEqual(r.unsupported,[{collection:'bridges',id:'unmapped'}]);
});

test('P6 A2d follows geometric land ownership without fanning out across shared districts',()=>{
 const ref=(collection,id)=>({collection,id}),a=ref('blocks','a'),c=ref('blocks','c'),p=ref('properties','p'),q=ref('plots','q'),d=ref('districts','d');
 const city={roads:[],blocks:[{id:'a',vertices:[]},{id:'c',vertices:[]}],properties:[{id:'p',blockId:'a',plotIds:['q']}],plots:[{id:'q',propertyId:'p'}],buildings:[],openSpaces:[]};
 const w={requested:[],neighbors:[],lineage:[]},o={roots:[],objects:[],omitted:[]};
 const geometry={status:'broad-phase-observed',rows:[{ref:p,protectedContext:false},{ref:d,protectedContext:true}]};
 const edges=[{from:p,to:a,relation:'block'},{from:p,to:q,relation:'plot'},{from:q,to:p,relation:'property'},{from:a,to:d,relation:'district'},{from:c,to:d,relation:'district'}];
 const run=e=>observeP6LandClosure(city,w,o,geometry,e,createSpatialPreservationBudget({work:8000000,stateExpansions:32768}));
 const r=run(edges);
 assert.equal(r.status,'closure-observed');assert.equal(r.added,3);assert.equal(r.external.length,1);
 assert.equal(r.external[0].classification,'protected-context');assert.ok(!r.inventory.objects.some(x=>x.ref.id==='c'));
 assert.ok(r.inventory.objects.every(x=>x.classification==='observe-only'));
 const bad=run(edges.filter(e=>e.to.id!=='q'&&e.from.id!=='q'));
 assert.equal(bad.status,'inventory-mismatch');assert.equal(bad.audit.differences.objects.missing.length,1);
});
