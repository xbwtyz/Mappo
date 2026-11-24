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
const [dir,strategy,expectedArg]=process.argv.slice(2);
assert.ok(['deep-largest','deep-obstructive','clear-all'].includes(strategy));
const fullManifest=[{"projectId":"planned-0","fingerprint":"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647","roadIds":["RD-0154","RD-0155"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-0","fingerprint":"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647","roadIds":["RD-0156","RD-0174","RD-0176"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-0","fingerprint":"9acb40e5cd58d8161a96c7dc267fea946d389391d648e662c4ec96136412a647","roadIds":["RD-0154","RD-0155","RD-0158","RD-0226"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-1","fingerprint":"aa030277e5cd45139198495a9b0bc93fe63277ec0417e8f2b1320fdc05380e60","roadIds":["RD-0162","RD-0163","RD-0226"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-2","fingerprint":"fcff8265263595da5e332a1abf2d0759d52a0c4ddfbb954709be78b16cdfb957","roadIds":["RD-0162","RD-0185"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-3","fingerprint":"07174c48a6ca6d9bb49d310c9247e14d923bf1bfff1641c71bca7563a34f1df4","roadIds":["RD-0153","RD-0156"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-4","fingerprint":"1f8b52960752617603241523c5b2c391777eb2fdb314d02b4b973ad6f8681154","roadIds":["RD-0223","RD-0254"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-4","fingerprint":"1f8b52960752617603241523c5b2c391777eb2fdb314d02b4b973ad6f8681154","roadIds":["RD-0223","RD-0254","RD-0256"],"offset":{"x":-8,"y":-5}},{"projectId":"planned-4","fingerprint":"1f8b52960752617603241523c5b2c391777eb2fdb314d02b4b973ad6f8681154","roadIds":["RD-0223","RD-0226","RD-0256","RD-0341"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-0","fingerprint":"383e9261dc953a6ecc932cf0b186ff5141446dd127856c2e0a72a36b1b6e9e33","roadIds":["RD-0167","RD-0171"],"offset":{"x":4,"y":3}},{"projectId":"organic-0","fingerprint":"383e9261dc953a6ecc932cf0b186ff5141446dd127856c2e0a72a36b1b6e9e33","roadIds":["RD-0167","RD-0171"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-0","fingerprint":"383e9261dc953a6ecc932cf0b186ff5141446dd127856c2e0a72a36b1b6e9e33","roadIds":["RD-0167","RD-0168","RD-0171","RD-0243"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-0","fingerprint":"383e9261dc953a6ecc932cf0b186ff5141446dd127856c2e0a72a36b1b6e9e33","roadIds":["RD-0167","RD-0170"],"offset":{"x":4,"y":3}},{"projectId":"organic-0","fingerprint":"383e9261dc953a6ecc932cf0b186ff5141446dd127856c2e0a72a36b1b6e9e33","roadIds":["RD-0167","RD-0170"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-0","fingerprint":"383e9261dc953a6ecc932cf0b186ff5141446dd127856c2e0a72a36b1b6e9e33","roadIds":["RD-0168","RD-0169"],"offset":{"x":4,"y":3}},{"projectId":"organic-0","fingerprint":"383e9261dc953a6ecc932cf0b186ff5141446dd127856c2e0a72a36b1b6e9e33","roadIds":["RD-0168","RD-0169"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-1","fingerprint":"45424ea2b6d445236925cc4f8b6403c74fb59634b38171ef549647bc61670c86","roadIds":["RD-0162","RD-0165"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-1","fingerprint":"45424ea2b6d445236925cc4f8b6403c74fb59634b38171ef549647bc61670c86","roadIds":["RD-0157","RD-0158","RD-0227"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-1","fingerprint":"45424ea2b6d445236925cc4f8b6403c74fb59634b38171ef549647bc61670c86","roadIds":["RD-0162","RD-0163","RD-0166","RD-0230"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-1","fingerprint":"45424ea2b6d445236925cc4f8b6403c74fb59634b38171ef549647bc61670c86","roadIds":["RD-0159","RD-0162"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-2","fingerprint":"6570e92ab1b2a90067cb189c9081d0fa69f139b60ab1aedc7de24f6e493be0b3","roadIds":["RD-0176","RD-0197"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-2","fingerprint":"6570e92ab1b2a90067cb189c9081d0fa69f139b60ab1aedc7de24f6e493be0b3","roadIds":["RD-0183","RD-0198","RD-0200"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-2","fingerprint":"6570e92ab1b2a90067cb189c9081d0fa69f139b60ab1aedc7de24f6e493be0b3","roadIds":["RD-0176","RD-0196"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-3","fingerprint":"91f521cbc9aeb236372ea024f01a0fd2efa820a0a910c83e3f0448cbeea1170c","roadIds":["RD-0167","RD-0189"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-3","fingerprint":"91f521cbc9aeb236372ea024f01a0fd2efa820a0a910c83e3f0448cbeea1170c","roadIds":["RD-0167","RD-0186","RD-0188"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-3","fingerprint":"91f521cbc9aeb236372ea024f01a0fd2efa820a0a910c83e3f0448cbeea1170c","roadIds":["RD-0167","RD-0170","RD-0188","RD-0232"],"offset":{"x":0,"y":-2}},{"projectId":"organic-4","fingerprint":"fc53feffce8cc1de2e18c956922f4389496e529fc36fcb0b859110c31dd64303","roadIds":["RD-0227","RD-0228","RD-0353"],"offset":{"x":-8,"y":-5}},{"projectId":"organic-4","fingerprint":"fc53feffce8cc1de2e18c956922f4389496e529fc36fcb0b859110c31dd64303","roadIds":["RD-0229","RD-0233"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-0","fingerprint":"56c49977ee66a90a0f8cc3ca77757f40fe422796a12c385711a634b59805497c","roadIds":["RD-0126","RD-0127","RD-0241"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-0","fingerprint":"56c49977ee66a90a0f8cc3ca77757f40fe422796a12c385711a634b59805497c","roadIds":["RD-0141","RD-0251"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-1","fingerprint":"d0ccd9d2f524e60dc7f34a512d807e893d0380250ab0cd8279a965a4cbc3e559","roadIds":["RD-0146","RD-0218"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-1","fingerprint":"d0ccd9d2f524e60dc7f34a512d807e893d0380250ab0cd8279a965a4cbc3e559","roadIds":["RD-0124","RD-0125","RD-0238"],"offset":{"x":4,"y":3}},{"projectId":"radial-1","fingerprint":"d0ccd9d2f524e60dc7f34a512d807e893d0380250ab0cd8279a965a4cbc3e559","roadIds":["RD-0124","RD-0125","RD-0238"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-1","fingerprint":"d0ccd9d2f524e60dc7f34a512d807e893d0380250ab0cd8279a965a4cbc3e559","roadIds":["RD-0119","RD-0124","RD-0200","RD-0201","RD-0202","RD-0236","RD-0237","RD-0238"],"offset":{"x":0,"y":-2}},{"projectId":"radial-1","fingerprint":"d0ccd9d2f524e60dc7f34a512d807e893d0380250ab0cd8279a965a4cbc3e559","roadIds":["RD-0119","RD-0124","RD-0200","RD-0201","RD-0202","RD-0236","RD-0237","RD-0238"],"offset":{"x":4,"y":3}},{"projectId":"radial-1","fingerprint":"d0ccd9d2f524e60dc7f34a512d807e893d0380250ab0cd8279a965a4cbc3e559","roadIds":["RD-0119","RD-0124","RD-0200","RD-0201","RD-0202","RD-0236","RD-0237","RD-0238"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-1","fingerprint":"d0ccd9d2f524e60dc7f34a512d807e893d0380250ab0cd8279a965a4cbc3e559","roadIds":["RD-0139","RD-0211"],"offset":{"x":4,"y":3}},{"projectId":"radial-2","fingerprint":"0fb5ce5e098f4229684589d52411011a81be6486296c47e90d33d50a0adddd2a","roadIds":["RD-0120","RD-0124","RD-0199","RD-0200","RD-0201","RD-0235","RD-0236","RD-0237"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-3","fingerprint":"b42f967670d481e1857a3e0d927f6993385acb445d8411c64fc02cd024fa50ff","roadIds":["RD-0124","RD-0125","RD-0203"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-3","fingerprint":"b42f967670d481e1857a3e0d927f6993385acb445d8411c64fc02cd024fa50ff","roadIds":["RD-0117","RD-0121","RD-0198","RD-0199","RD-0200","RD-0234","RD-0235","RD-0236"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-3","fingerprint":"b42f967670d481e1857a3e0d927f6993385acb445d8411c64fc02cd024fa50ff","roadIds":["RD-0142","RD-0143"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-3","fingerprint":"b42f967670d481e1857a3e0d927f6993385acb445d8411c64fc02cd024fa50ff","roadIds":["RD-0142","RD-0143","RD-0215"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-4","fingerprint":"22644535fe006ab563fa3315d698471e9aaaa3fb5e837d5ae347cec19e0c973d","roadIds":["RD-0199","RD-0251"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-4","fingerprint":"22644535fe006ab563fa3315d698471e9aaaa3fb5e837d5ae347cec19e0c973d","roadIds":["RD-0159","RD-0160","RD-0374"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-4","fingerprint":"22644535fe006ab563fa3315d698471e9aaaa3fb5e837d5ae347cec19e0c973d","roadIds":["RD-0154","RD-0160","RD-0372","RD-0373","RD-0374","RD-0416","RD-0417","RD-0418"],"offset":{"x":4,"y":3}},{"projectId":"radial-4","fingerprint":"22644535fe006ab563fa3315d698471e9aaaa3fb5e837d5ae347cec19e0c973d","roadIds":["RD-0154","RD-0160","RD-0372","RD-0373","RD-0374","RD-0416","RD-0417","RD-0418"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-4","fingerprint":"22644535fe006ab563fa3315d698471e9aaaa3fb5e837d5ae347cec19e0c973d","roadIds":["RD-0188","RD-0189"],"offset":{"x":-8,"y":-5}},{"projectId":"radial-4","fingerprint":"22644535fe006ab563fa3315d698471e9aaaa3fb5e837d5ae347cec19e0c973d","roadIds":["RD-0188","RD-0189","RD-0293"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-0","fingerprint":"5e4ecf8486548ff66a2138ee6ebc770be7bcd26fc13f2365bb06ff0f402be7cf","roadIds":["RD-0178","RD-0199"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-0","fingerprint":"5e4ecf8486548ff66a2138ee6ebc770be7bcd26fc13f2365bb06ff0f402be7cf","roadIds":["RD-0178","RD-0199","RD-0201"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-1","fingerprint":"26c8a9f910c3c531f291b921513f53585fa8067bb4603503fe3a87e7ad8ab75b","roadIds":["RD-0180","RD-0254"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-1","fingerprint":"26c8a9f910c3c531f291b921513f53585fa8067bb4603503fe3a87e7ad8ab75b","roadIds":["RD-0178","RD-0179","RD-0182","RD-0254"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-2","fingerprint":"1e56a262792283ef97f82e28c81826cf2ec4f1fbe5157af66854155cda793e77","roadIds":["RD-0175","RD-0176"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-2","fingerprint":"1e56a262792283ef97f82e28c81826cf2ec4f1fbe5157af66854155cda793e77","roadIds":["RD-0177","RD-0201","RD-0203"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-2","fingerprint":"1e56a262792283ef97f82e28c81826cf2ec4f1fbe5157af66854155cda793e77","roadIds":["RD-0174","RD-0177","RD-0201","RD-0252"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-2","fingerprint":"1e56a262792283ef97f82e28c81826cf2ec4f1fbe5157af66854155cda793e77","roadIds":["RD-0175","RD-0176","RD-0179","RD-0253"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-3","fingerprint":"0c72af89810b379792aeece5b346c67795286bbb88cf9309c922262c22f73372","roadIds":["RD-0169","RD-0173"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-3","fingerprint":"0c72af89810b379792aeece5b346c67795286bbb88cf9309c922262c22f73372","roadIds":["RD-0163","RD-0164","RD-0167","RD-0260"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-3","fingerprint":"0c72af89810b379792aeece5b346c67795286bbb88cf9309c922262c22f73372","roadIds":["RD-0169","RD-0170"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-3","fingerprint":"0c72af89810b379792aeece5b346c67795286bbb88cf9309c922262c22f73372","roadIds":["RD-0169","RD-0170","RD-0173","RD-0262"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-4","fingerprint":"2b50948c2b9a74e536eef56b97e2986f4b815548497007190470efcd5d4abfc0","roadIds":["RD-0256","RD-0381"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-4","fingerprint":"2b50948c2b9a74e536eef56b97e2986f4b815548497007190470efcd5d4abfc0","roadIds":["RD-0258","RD-0259","RD-0381"],"offset":{"x":4,"y":3}},{"projectId":"linear-4","fingerprint":"2b50948c2b9a74e536eef56b97e2986f4b815548497007190470efcd5d4abfc0","roadIds":["RD-0256","RD-0259","RD-0294","RD-0381"],"offset":{"x":4,"y":3}},{"projectId":"linear-4","fingerprint":"2b50948c2b9a74e536eef56b97e2986f4b815548497007190470efcd5d4abfc0","roadIds":["RD-0256","RD-0259","RD-0294","RD-0381"],"offset":{"x":-8,"y":-5}},{"projectId":"linear-4","fingerprint":"2b50948c2b9a74e536eef56b97e2986f4b815548497007190470efcd5d4abfc0","roadIds":["RD-0256","RD-0380"],"offset":{"x":-8,"y":-5}}];
const key=x=>JSON.stringify([x.projectId,x.fingerprint,x.roadIds,x.offset]);
const hash=s=>createHash('sha256').update(s).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
const cmp=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
const corpus=JSON.parse(await readFile(join(dir,'baseline.json'),'utf8'));
assert.equal(corpus.baseline,'e5f1cf83dcdcc75e52911aa717035955b40569d0');
const indexed=new Map(corpus.rows.map(r=>[key(r),r]));
assert.equal(indexed.size,200);
const projects=new Set(corpus.projects.map(p=>p.projectId));
const manifest=fullManifest.filter(r=>projects.has(r.projectId));
assert.equal(manifest.length,Number(expectedArg),'Incomplete frozen refusal shard');
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
 const ranked=eligible.slice().sort((a,b)=>strategy==='deep-largest'?b.area-a.area||cmp(a,b):obstruction(b)-obstruction(a)||b.area-a.area||cmp(a,b));
 const sets=[];
 if(strategy==='clear-all'){
   // Diagnostic counterfactual only: never a proposed production policy.
   if(ranked.length)sets.push(ranked);
 }else for(let n=9;n<=Math.min(16,ranked.length);n++)sets.push(ranked.slice(0,n));
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
