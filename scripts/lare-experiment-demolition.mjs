// Counterfactual demolition study ONLY. Never integrated into live editing.
// Each trial removes an explicitly selected, eligible generated subset in a clone,
// validates that clone, then runs the unchanged selective-clearance solver and Apply.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {prepareRoadGroupReflowB1} from '../src/core/neighborhood-reflow.js';
import {prepareRoadGroupIntentB1} from '../src/core/road-intent-c1.js';
import {createLareContext} from '../src/core/reconciliation-context.js';
import {createLareBudget} from '../src/core/reconciliation-budget.js';
import {classifyRoadProvenance,stampRoadGenerated} from '../src/core/road-provenance.js';
import {buildRoadGraph} from '../src/core/road-graph.js';
import {analyzeRoadImpact} from '../src/core/road-impact.js';
import {validateStoredProject} from '../src/data/project-validation.js';
import {verifyLareGroupPreservation} from '../src/core/reconciliation-preservation.js';
import {validateRoadGroupApplyB1} from '../src/editor/road-application.js';
import {defaultWorkspace} from '../src/data/project-format.js';
const [dir,strategy]=process.argv.slice(2);
assert.ok(['hybrid'].includes(strategy));
const manifest=[{"projectId":"planned-0","fingerprint":"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647","roadIds":["RD-0154","RD-0155"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-0","fingerprint":"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647","roadIds":["RD-0156","RD-0174","RD-0176"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-0","fingerprint":"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647","roadIds":["RD-0153","RD-0156","RD-0174","RD-0225"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-0","fingerprint":"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647","roadIds":["RD-0154","RD-0155","RD-0158","RD-0226"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-0","fingerprint":"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647","roadIds":["RD-0153","RD-0225"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-1","fingerprint":"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60","roadIds":["RD-0159","RD-0226"],"offset":{"x":4,"y":3}},{"projectId":"planned-1","fingerprint":"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60","roadIds":["RD-0159","RD-0226"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-1","fingerprint":"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60","roadIds":["RD-0162","RD-0163","RD-0226"],"offset":{"x":4,"y":3}},{"projectId":"planned-1","fingerprint":"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60","roadIds":["RD-0162","RD-0163","RD-0226"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-1","fingerprint":"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60","roadIds":["RD-0160","RD-0163","RD-0179","RD-0226"],"offset":{"x":0,"y":-2}},{"projectId":"planned-1","fingerprint":"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60","roadIds":["RD-0160","RD-0163","RD-0179","RD-0226"],"offset":{"x":4,"y":3}},{"projectId":"planned-1","fingerprint":"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60","roadIds":["RD-0160","RD-0163","RD-0179","RD-0226"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-1","fingerprint":"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60","roadIds":["RD-0159","RD-0160"],"offset":{"x":4,"y":3}},{"projectId":"planned-1","fingerprint":"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60","roadIds":["RD-0160","RD-0177"],"offset":{"x":4,"y":3}},{"projectId":"planned-1","fingerprint":"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60","roadIds":["RD-0160","RD-0177"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-2","fingerprint":"fcff8265263595da5e332a1abf2d0759d52a0c4ddfbb954709be78b16cdfb957","roadIds":["RD-0162","RD-0185"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-2","fingerprint":"fcff8265263595da5e332a1abf2d0759d52a0c4ddfbb954709be78b16cdfb957","roadIds":["RD-0161","RD-0162","RD-0235"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-2","fingerprint":"fcff8265263595da5e332a1abf2d0759d52a0c4ddfbb954709be78b16cdfb957","roadIds":["RD-0159","RD-0162","RD-0182","RD-0235"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-2","fingerprint":"fcff8265263595da5e332a1abf2d0759d52a0c4ddfbb954709be78b16cdfb957","roadIds":["RD-0162","RD-0182"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-2","fingerprint":"fcff8265263595da5e332a1abf2d0759d52a0c4ddfbb954709be78b16cdfb957","roadIds":["RD-0162","RD-0235"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-3","fingerprint":"07174c48a6ca6d9bb49d310c9247e14d923bf1bfff1641c71bca7563a34f1df4","roadIds":["RD-0154","RD-0220"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-3","fingerprint":"07174c48a6ca6d9bb49d310c9247e14d923bf1bfff1641c71bca7563a34f1df4","roadIds":["RD-0153","RD-0156"],"offset":{"x":4,"y":3}},{"projectId":"planned-3","fingerprint":"07174c48a6ca6d9bb49d310c9247e14d923bf1bfff1641c71bca7563a34f1df4","roadIds":["RD-0153","RD-0156"],"offset":{"x":-8,"y":-5}}];
const hints={"[\"planned-0\",\"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647\",[\"RD-0154\",\"RD-0155\"],{\"x\":-8,\"y\":-5}]":"property:PROP-00114","[\"planned-0\",\"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647\",[\"RD-0156\",\"RD-0174\",\"RD-0176\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00144","[\"planned-0\",\"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647\",[\"RD-0153\",\"RD-0156\",\"RD-0174\",\"RD-0225\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00143","[\"planned-0\",\"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647\",[\"RD-0154\",\"RD-0155\",\"RD-0158\",\"RD-0226\"],{\"x\":-8,\"y\":-5}]":"property:PROP-00114","[\"planned-0\",\"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647\",[\"RD-0153\",\"RD-0225\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00143","[\"planned-1\",\"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60\",[\"RD-0159\",\"RD-0226\"],{\"x\":4,\"y\":3}]":"building:BLD-00136","[\"planned-1\",\"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60\",[\"RD-0159\",\"RD-0226\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00138","[\"planned-1\",\"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60\",[\"RD-0162\",\"RD-0163\",\"RD-0226\"],{\"x\":4,\"y\":3}]":"building:BLD-00136","[\"planned-1\",\"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60\",[\"RD-0162\",\"RD-0163\",\"RD-0226\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00135","[\"planned-1\",\"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60\",[\"RD-0160\",\"RD-0163\",\"RD-0179\",\"RD-0226\"],{\"x\":0,\"y\":-2}]":"building:BLD-00138","[\"planned-1\",\"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60\",[\"RD-0160\",\"RD-0163\",\"RD-0179\",\"RD-0226\"],{\"x\":4,\"y\":3}]":"building:BLD-00167","[\"planned-1\",\"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60\",[\"RD-0160\",\"RD-0163\",\"RD-0179\",\"RD-0226\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00137","[\"planned-1\",\"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60\",[\"RD-0159\",\"RD-0160\"],{\"x\":4,\"y\":3}]":"building:BLD-00136","[\"planned-1\",\"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60\",[\"RD-0160\",\"RD-0177\"],{\"x\":4,\"y\":3}]":"building:BLD-00136","[\"planned-1\",\"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60\",[\"RD-0160\",\"RD-0177\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00046","[\"planned-2\",\"fcff8265263595da5e332a1abf2d0759d52a0c4ddfbb954709be78b16cdfb957\",[\"RD-0162\",\"RD-0185\"],{\"x\":-8,\"y\":-5}]":"property:PROP-00146","[\"planned-2\",\"fcff8265263595da5e332a1abf2d0759d52a0c4ddfbb954709be78b16cdfb957\",[\"RD-0161\",\"RD-0162\",\"RD-0235\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00096","[\"planned-2\",\"fcff8265263595da5e332a1abf2d0759d52a0c4ddfbb954709be78b16cdfb957\",[\"RD-0159\",\"RD-0162\",\"RD-0182\",\"RD-0235\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00138","[\"planned-2\",\"fcff8265263595da5e332a1abf2d0759d52a0c4ddfbb954709be78b16cdfb957\",[\"RD-0162\",\"RD-0182\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00138","[\"planned-2\",\"fcff8265263595da5e332a1abf2d0759d52a0c4ddfbb954709be78b16cdfb957\",[\"RD-0162\",\"RD-0235\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00138","[\"planned-3\",\"07174c48a6ca6d9bb49d310c9247e14d923bf1bfff1641c71bca7563a34f1df4\",[\"RD-0154\",\"RD-0220\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00107","[\"planned-3\",\"07174c48a6ca6d9bb49d310c9247e14d923bf1bfff1641c71bca7563a34f1df4\",[\"RD-0153\",\"RD-0156\"],{\"x\":4,\"y\":3}]":"building:BLD-00109","[\"planned-3\",\"07174c48a6ca6d9bb49d310c9247e14d923bf1bfff1641c71bca7563a34f1df4\",[\"RD-0153\",\"RD-0156\"],{\"x\":-8,\"y\":-5}]":"building:BLD-00029"};
const key=x=>JSON.stringify([x.projectId,x.fingerprint,x.roadIds,x.offset]);
const hash=s=>createHash('sha256').update(s).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
const cmp=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
const corpus=JSON.parse(await readFile(join(dir,'baseline.json'),'utf8'));
assert.equal(corpus.baseline,'e5f1cf83dcdcc75e52911aa717035955b40569d0');
const indexed=new Map(corpus.rows.map(r=>[key(r),r]));
assert.equal(indexed.size,160);
const summary={strategy,attempted:0,recovered:0,refused:0,invalid:0,trialCount:0,removed:0,area:0};
for(const record of manifest){
 const row=indexed.get(key(record));assert.ok(row&&!row.accepted,'Frozen refusal mismatch');
 const raw=(await readFile(join(dir,'projects',row.projectId+'.json'),'utf8')).trimEnd();
 assert.equal(hash(raw),row.fingerprint);
 const source=JSON.parse(raw);validateStoredProject(source);
 const draft=prepareRoadGroupIntentB1(source,row.roadIds,row.offset);
 assert.ok(draft.topologyResolved&&draft.facesResolved);
 const control=prepareRoadGroupReflowB1(source,row.roadIds,row.offset);
 assert.ok(!control.candidateProject&&control.unresolved.some(i=>['lare-search-exhausted','lare-work-limit'].includes(i.code)),'Control outcome changed');
 const context=createLareContext(source,draft,new Map(),createLareBudget({work:1000000,stateExpansions:2048}));
 const properties=new Map(source.city.properties.map(p=>[p.id,p]));
 const plots=new Map(source.city.plots.map(p=>[p.id,p]));
 const buildings=new Map(source.city.buildings.map(b=>[b.id,b]));
 const impact=analyzeRoadImpact(source,{operation:'translate-road',graph:buildRoadGraph(draft.proposedCity)});
 const direct=new Map(),affected=new Set();
 for(const i of impact.issues){
   if(i.kind==='building'){direct.set(i.id,(direct.get(i.id)||0)+1);const b=buildings.get(i.id);if(b)affected.add(b.propertyId);}
   if(i.kind==='property')affected.add(i.id);
   if(i.kind==='plot'){const p=plots.get(i.id);if(p)affected.add(p.propertyId);}
 }
 const frontage=new Set(draft.changedRoadIds);
 // Same affected block scope as the context; only generated, independently
 // movable, nondependent buildings on generated adaptive properties qualify.
 const eligible=context.properties.filter(p=>p.policy.mode==='adaptive'&&p.policy.provenance==='generated').flatMap(p=>p.buildings.filter(b=>b.mode==='rigid'&&b.provenance==='generated').map(b=>buildings.get(b.id)));
 const eligibleIds=new Set(eligible.map(b=>b.id));
 const obstruction=b=>1000*(direct.get(b.id)||0)+100*Number(affected.has(b.propertyId))+10*Number(frontage.has(b.frontageRoadId));
 const hint=hints[key(record)];
 const hintRank=b=>Number(hint==='building:'+b.id)*100000+Number(hint==='property:'+b.propertyId)*10000+obstruction(b);
 const diagnosticRanked=eligible.slice().sort((a,b)=>hintRank(b)-hintRank(a)||a.area-b.area||cmp(a,b));
 const obstructiveRanked=eligible.slice().sort((a,b)=>obstruction(b)-obstruction(a)||b.area-a.area||cmp(a,b));
 const sets=[],seenSets=new Set();
 const add=chosen=>{if(!chosen.length||sets.length>=16)return;const k=chosen.map(b=>b.id).sort().join('|');if(!seenSets.has(k)){seenSets.add(k);sets.push(chosen);}};
 // Diagnostic-first individual candidates, then a few targeted pairs,
 // then progressively remove the most obstructive eligible buildings.
 const pool=diagnosticRanked.slice(0,5);
 for(const b of pool)add([b]);
 const pairs=[];for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++)pairs.push([pool[i],pool[j]]);
 pairs.sort((a,b)=>b.reduce((s,x)=>s+hintRank(x),0)-a.reduce((s,x)=>s+hintRank(x),0)||a.reduce((s,x)=>s+x.area,0)-b.reduce((s,x)=>s+x.area,0)||cmp(a[0],b[0])||cmp(a[1],b[1]));
 for(const pair of pairs.slice(0,3))add(pair);
 for(let n=1;n<=Math.min(8,obstructiveRanked.length);n++)add(obstructiveRanked.slice(0,n));
 const trials=[];let best=null;const start=performance.now();
 for(const chosen of sets){
   const ids=new Set(chosen.map(b=>b.id));assert.equal(ids.size,chosen.length);
   for(const id of ids)assert.ok(eligibleIds.has(id),'Unauthorized demolition');
   const reduced=clone(source);
   reduced.city.buildings=reduced.city.buildings.filter(b=>!ids.has(b.id));
   for(const p of reduced.city.properties){
     if(!p.buildingIds.some(id=>ids.has(id)))continue;
     const original=properties.get(p.id);assert.equal(classifyRoadProvenance(original,original.plotIds.map(id=>plots.get(id))),'generated');
     p.buildingIds=p.buildingIds.filter(id=>!ids.has(id));
     stampRoadGenerated(p,p.plotIds.map(id=>plots.get(id)));
   }
   // The only intentional input deltas are the exact removal set and the
   // generated owner membership/stamp. No topology or other records are changed.
   assert.deepEqual(reduced.city.buildings,source.city.buildings.filter(b=>!ids.has(b.id)));
   validateStoredProject(reduced);
   const reducedRaw=JSON.stringify(reduced),t=performance.now();
   const preview=prepareRoadGroupReflowB1(reduced,row.roadIds,row.offset);
   const trial={removed:[...ids].sort(),area:chosen.reduce((s,b)=>s+b.area,0),work:preview.lare?.stats?.work??0,expansions:preview.lare?.stats?.expansions??0,previewMs:performance.now()-t,accepted:false,issues:preview.unresolved?.map(i=>i.code)??[]};
   if(preview.candidateProject){
     const receipt=validateRoadGroupApplyB1(reduced,defaultWorkspace(reduced),{selectedRoadIds:row.roadIds,offset:row.offset},preview);
     trial.accepted=Boolean(receipt?.ok);trial.issues=receipt?.issues?.map(i=>i.code)??[];
     if(trial.accepted){
       validateStoredProject(receipt.candidate);
       const reducedDraft=prepareRoadGroupIntentB1(reduced,row.roadIds,row.offset);
       assert.equal(verifyLareGroupPreservation(reduced,receipt.candidate,reducedDraft,new Map(),createLareBudget({work:1000000,stateExpansions:2048})),null,'Remaining-record preservation failure');
       assert.deepEqual(receipt.candidate.city.buildings.map(b=>b.id).sort(),source.city.buildings.filter(b=>!ids.has(b.id)).map(b=>b.id).sort(),'Unexpected building identity change');
       trial.score=preview.lare?.score??null;trial.fingerprint=hash(JSON.stringify(receipt.candidate));
       best=trial;
     }
   }
   assert.equal(JSON.stringify(reduced),reducedRaw,'Trial input mutated');
   trials.push(trial);if(best)break;
 }
 assert.equal(JSON.stringify(source),raw,'Original accepted source mutated');
 summary.attempted++;summary.trialCount+=trials.length;
 if(best){summary.recovered++;summary.removed+=best.removed.length;summary.area+=best.area;}else summary.refused++;
 console.log('LARE_DEMOLITION_CASE '+JSON.stringify({...record,strategy,eligible:eligible.length,controlIssues:control.unresolved.map(i=>i.code),best,trials,totalMs:performance.now()-start}));
}
assert.equal(summary.attempted,manifest.length);
console.log('LARE_DEMOLITION_SUMMARY '+JSON.stringify(summary));
