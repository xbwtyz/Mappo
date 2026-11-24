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
const fullManifest=[{"projectId":"planned-4","fingerprint":"1f8b52960752617603241523c5b2c391777eb2fdb314d02b4b973ad6f8681154","roadIds":["RD-0223","RD-0254"],"offset":{"x":-8,"y":-5},"cooperativePair":["PROP-00300","PROP-00301"],"priorRemoved":["BLD-00325","BLD-00326","BLD-00327","BLD-00328","BLD-00329","BLD-00330","BLD-00331","BLD-00332","BLD-00333","BLD-00334","BLD-00335","BLD-00336","BLD-00337","BLD-00338","BLD-00365","BLD-00366","BLD-00367","BLD-00368","BLD-00369","BLD-00370","BLD-00371","BLD-00372","BLD-00373","BLD-00374","BLD-00375","BLD-00376","BLD-00377","BLD-00378","BLD-00379","BLD-00380","BLD-00381","BLD-00382","BLD-00383"]},{"projectId":"planned-4","fingerprint":"1f8b52960752617603241523c5b2c391777eb2fdb314d02b4b973ad6f8681154","roadIds":["RD-0223","RD-0254","RD-0256"],"offset":{"x":-8,"y":-5},"cooperativePair":["PROP-00300","PROP-00301"],"priorRemoved":["BLD-00325","BLD-00326","BLD-00327","BLD-00328","BLD-00329","BLD-00330","BLD-00331","BLD-00332","BLD-00333","BLD-00334","BLD-00335","BLD-00336","BLD-00337","BLD-00338","BLD-00339","BLD-00340","BLD-00365","BLD-00366","BLD-00367","BLD-00368","BLD-00369","BLD-00370","BLD-00371","BLD-00372","BLD-00373","BLD-00374","BLD-00375","BLD-00376","BLD-00377","BLD-00378","BLD-00379","BLD-00380","BLD-00381","BLD-00382","BLD-00383","BLD-00384","BLD-00385"]},{"projectId":"planned-4","fingerprint":"1f8b52960752617603241523c5b2c391777eb2fdb314d02b4b973ad6f8681154","roadIds":["RD-0223","RD-0226","RD-0256","RD-0341"],"offset":{"x":-8,"y":-5},"cooperativePair":["PROP-00300","PROP-00301"],"priorRemoved":["BLD-00331","BLD-00332","BLD-00333","BLD-00334","BLD-00335","BLD-00336","BLD-00337","BLD-00338","BLD-00339","BLD-00340","BLD-00373","BLD-00374","BLD-00375","BLD-00376","BLD-00377","BLD-00378","BLD-00379","BLD-00380","BLD-00381","BLD-00382","BLD-00383","BLD-00384","BLD-00385"]},{"projectId":"linear-4","fingerprint":"2b50948c2b9a74e536eef56b97e2986f4b815548497007190470efcd5d4abfc0","roadIds":["RD-0256","RD-0381"],"offset":{"x":-8,"y":-5},"cooperativePair":["PROP-00035","PROP-00038"],"priorRemoved":["BLD-00035","BLD-00036","BLD-00037","BLD-00038","BLD-00039","BLD-00040","BLD-00041","BLD-00345","BLD-00346","BLD-00347","BLD-00348","BLD-00349","BLD-00350","BLD-00351","BLD-00352"]},{"projectId":"linear-4","fingerprint":"2b50948c2b9a74e536eef56b97e2986f4b815548497007190470efcd5d4abfc0","roadIds":["RD-0256","RD-0259","RD-0294","RD-0381"],"offset":{"x":-8,"y":-5},"cooperativePair":["PROP-00035","PROP-00038"],"priorRemoved":["BLD-00029","BLD-00030","BLD-00031","BLD-00032","BLD-00033","BLD-00034","BLD-00035","BLD-00036","BLD-00037","BLD-00038","BLD-00039","BLD-00040","BLD-00041","BLD-00345","BLD-00346","BLD-00347","BLD-00348","BLD-00349","BLD-00350","BLD-00351","BLD-00352"]},{"projectId":"linear-4","fingerprint":"2b50948c2b9a74e536eef56b97e2986f4b815548497007190470efcd5d4abfc0","roadIds":["RD-0256","RD-0380"],"offset":{"x":-8,"y":-5},"cooperativePair":["PROP-00035","PROP-00038"],"priorRemoved":["BLD-00035","BLD-00036","BLD-00037","BLD-00038","BLD-00039","BLD-00040","BLD-00041","BLD-00345","BLD-00346","BLD-00347","BLD-00348"]}];
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
 globalThis.__lareCooperativePair=record.cooperativePair;
 globalThis.__lareParcelDiagnostic=[];
 const control=prepareRoadGroupReflowB1(source,row.roadIds,row.offset);
 const controlDiagnostic=globalThis.__lareParcelDiagnostic;
 globalThis.__lareParcelDiagnostic=null;
 let originalResult=null;
 if(control.candidateProject){
   const receipt=validateRoadGroupApplyB1(source,defaultWorkspace(source),{selectedRoadIds:row.roadIds,offset:row.offset},control);
   assert.ok(receipt?.ok,'Original-input candidate failed fresh Apply');
   validateStoredProject(receipt.candidate);
   assert.equal(verifyLareGroupPreservation(source,receipt.candidate,draft,new Map(),createLareBudget({work:1000000,stateExpansions:2048})),null,'Original-input preservation failure');
   assert.deepEqual(receipt.candidate.city.buildings.map(b=>b.id).sort(),source.city.buildings.map(b=>b.id).sort(),'Original-input building identity change');
   originalResult={fingerprint:hash(JSON.stringify(receipt.candidate)),score:control.lare?.score??null};
 }else assert.ok(control.unresolved.some(i=>['lare-search-exhausted','lare-work-limit'].includes(i.code)),'Unexpected original-input refusal');
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
   assert.deepEqual([...ids].sort(),record.priorRemoved,'Exact reduced-input control mismatch');
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
   globalThis.__lareParcelDiagnostic=[];
   const preview=prepareRoadGroupReflowB1(reduced,row.roadIds,row.offset);
   const diagnostic=globalThis.__lareParcelDiagnostic;
   globalThis.__lareParcelDiagnostic=null;
   const trial={removed:[...ids].sort(),area:chosen.reduce((s,b)=>s+b.area,0),work:preview.lare?.stats?.work??0,expansions:preview.lare?.stats?.expansions??0,previewMs:performance.now()-t,accepted:false,issues:preview.unresolved?.map(i=>i.code)??[]};
   trial.diagnostic=diagnostic;trial.lastRejectedCandidate=preview.lare?.lastRejectedCandidate??null;
   if(preview.candidateProject){
     const receipt=validateRoadGroupApplyB1(reduced,defaultWorkspace(reduced),{selectedRoadIds:row.roadIds,offset:row.offset},preview);
     trial.accepted=Boolean(receipt?.ok);trial.issues=receipt?.issues?.map(i=>i.code)??[];
     assert.ok(trial.accepted,'Reduced-input candidate failed fresh Apply');
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
 const payload=JSON.stringify({...record,strategy,eligible:eligible.length,originalResult,controlWork:control.lare?.stats?.work??0,controlExpansions:control.lare?.stats?.expansions??0,controlIssues:control.unresolved.map(i=>i.code),controlDiagnostic,controlLastRejectedCandidate:control.lare?.lastRejectedCandidate??null,best,trials,totalMs:performance.now()-start});
 console.log('LARE_CASE_RESULT '+JSON.stringify({...record,originalResult,controlWork:control.lare?.stats?.work??0,controlExpansions:control.lare?.stats?.expansions??0,controlIssues:control.unresolved.map(i=>i.code),best:best?{fingerprint:best.fingerprint,score:best.score,work:best.work,expansions:best.expansions,removed:best.removed,area:best.area}:null,trialWork:trials[0]?.work,trialExpansions:trials[0]?.expansions,trialIssues:trials[0]?.issues,payloadHash:hash(payload)}));
 const encoded=Buffer.from(payload,'utf8').toString('base64'),size=1000,count=Math.ceil(encoded.length/size);
 for(let i=0;i<count;i++)console.log('LARE_CASE_B64 '+JSON.stringify({caseId:hash(key(record)),i,count,data:encoded.slice(i*size,(i+1)*size)}));
}
assert.equal(summary.attempted,manifest.length);
console.log('LARE_DEMOLITION_SUMMARY '+JSON.stringify(summary));
