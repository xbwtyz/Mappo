import { readFileSync } from 'node:fs';
import { P4R_BASELINE } from './ares-p4r-research.mjs';
import { materializeLockedRtreCase } from './ares-rtre-locked-recipes.mjs';
import { inspectFreshRtreNeighborhood } from './ares-rtre-fresh-neighborhood.mjs';
import { observeAresRtreGeometry } from '../../../src/core/ares-rtre-geometry.js';
import { classifyRoad } from '../../../src/core/road-graph.js';
import { createSpatialPreservationBudget,spatialRefKey } from '../../../src/core/spatial-recovery-contract.js';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
import { riFreeze } from '../../../src/core/road-impact-model.js';
const read=name=>JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4-evidence/'+name,import.meta.url),'utf8'));
const capRows=[...read('p4r-r1-46067627895.json').caps,...read('p4r-r2-46067918609-a.json').rows,...read('p4r-r2-46067918609-b.json').rows];
export const R4_CASES=riFreeze(capRows.filter(r=>r.cap===256&&r.category==='search-refused').map(r=>r.id).sort());
export const R4_HOPS=Object.freeze([6,8,10]);
const rootCodes=new Set(['unnormalized-crossing','overlapping-roads','degenerate-road','duplicate-edge','boundary-escape']);
const key=spatialRefKey;
const ref=(collection,id)=>({collection,id});
// Independent typed road/node reachability oracle. No use of the P2
// promotion queue or RTRE neighborhood traversal; protected stops are
// derived from geometry anchors and original road classification.
function auditDepths(city,geometry,report,hops,budget){
  const adj=new Map(),stops=new Set(),roots=new Set();
  function add(r){budget.spend();const k=key(r);if(!adj.has(k))adj.set(k,new Set());return k;}
  for(const n of city.nodes)add(ref('nodes',n.id));
  for(const r of city.roads){
    const k=add(ref('roads',r.id));
    if(classifyRoad(r).protected)stops.add(k);
    for(const id of [r.a,r.b]){
      budget.spend();const n=key(ref('nodes',id));
      adj.get(k).add(n);adj.get(n).add(k);
    }
  }
  for(const n of geometry.junctions){budget.spend();if(n.role==='protected-anchor')stops.add(key(n.ref));}
  for(const r of geometry.context.operation.editedRefs){budget.spend();roots.add(key(r));}
  for(const n of geometry.requested){budget.spend();roots.add(key(n.ref));}
  for(const d of geometry.diagnostics){budget.spend();if(rootCodes.has(d.code))for(const r of d.refs){budget.spend();if(['roads','nodes'].includes(r.collection))roots.add(key(r));}}
  let frontier=[...roots],depths=new Map(frontier.map(k=>[k,0])),omitted=new Set();
  for(let level=0;level<=hops&&frontier.length;level++){
    const next=new Set();
    for(const k of frontier){
      budget.spend();if(stops.has(k))continue;
      for(const other of adj.get(k)){
        budget.spend();if(depths.has(other))continue;
        if(level===hops)omitted.add(other);else{depths.set(other,level+1);next.add(other);}
      }
    }
    frontier=[...next];
  }
  const actual=new Map(report.entries.map(e=>[key(e.ref),e.depth]));
  const mismatches=[];
  for(const [k,v] of depths){budget.spend();if(actual.get(k)!==v)mismatches.push({key:k,expected:v,actual:actual.get(k)??null});}
  for(const [k,v] of actual){budget.spend();if(!depths.has(k))mismatches.push({key:k,expected:null,actual:v});}
  const actualOmitted=new Set(report.omittedRefs.map(key));
  for(const k of omitted){budget.spend();if(!actualOmitted.has(k))mismatches.push({key:k,kind:'missing-omission'});}
  for(const k of actualOmitted){budget.spend();if(!omitted.has(k))mismatches.push({key:k,kind:'unexpected-omission'});}
  return {roots:roots.size,expectedEntries:depths.size,expectedOmitted:omitted.size,mismatches};
}
export async function observeR4Scope(id,hops){
  if(!R4_CASES.includes(id)||!R4_HOPS.includes(hops))throw Error('Unapproved R4 observation arm.');
  return observeScope(id,hops);
}
export async function observeR4SpatialScope(id,hops){
  if(P4R_BASELINE.find(r=>r.id===id)?.category!=='search-refused'||!R4_HOPS.includes(hops))
    throw Error('Unapproved R4 spatial observation arm.');
  return observeScope(id,hops);
}
async function observeScope(id,hops){
  const prior=P4R_BASELINE.find(r=>r.id===id),caseId='g:'+id;
  const budget=createSpatialPreservationBudget(G_MANIFEST.search.root),t=performance.now();
  const report=await inspectFreshRtreNeighborhood(caseId,{mode:'adaptive',maxObjects:G_MANIFEST.search.maxObjects,maxHops:hops},budget);
  if(report.snapshotFingerprint!==prior.source)throw Error('R4 source changed.');
  const observationWork=budget.snapshot(),f=materializeLockedRtreCase(caseId);
  // Separate bounded offline audit, no solver and no wider-scope witness.
  const auditBudget=createSpatialPreservationBudget(G_MANIFEST.audit.root);
  const geometry=await observeAresRtreGeometry(f.project,f.context,{mode:'adaptive'},auditBudget);
  if(geometry.snapshotFingerprint!==report.snapshotFingerprint)throw Error('R4 oracle source changed.');
  const audit=auditDepths(f.project.city,geometry,report,hops,auditBudget);
  const excluded={};
  for(const e of report.excluded){budget.spend();excluded[e.reason]=(excluded[e.reason]??0)+1;}
  const eligible=report.eligibleJunctions.map(e=>({id:e.ref.id,depth:e.depth,incidentCount:e.incidentRefs.length,primaryIncidentCount:e.primaryIncidentCount}));
  const blockers=new Set();
  const roads=new Map(f.project.city.roads.map(r=>[r.id,r]));
  for(const d of geometry.diagnostics){budget.spend();if(rootCodes.has(d.code))for(const ref of d.refs){
    budget.spend();if(ref.collection==='nodes')blockers.add(ref.id);
    if(ref.collection==='roads'){const r=roads.get(ref.id);if(r){blockers.add(r.a);blockers.add(r.b);}}
  }}
  return riFreeze({id,hops,source:prior.source,offset:prior.offset,status:report.status,observationStatus:report.observationStatus,
    admitted:report.entries.length,omitted:report.omittedRefs.length,eligible,excluded,blockerNodes:[...blockers].sort(),
    eligibleBlockerNodes:eligible.filter(e=>blockers.has(e.id)).map(e=>e.id).sort(),
    observationWork,stats:budget.snapshot(),audit,auditStats:auditBudget.snapshot(),elapsedMs:performance.now()-t});
}
