import { R4_CASES } from './ares-p4r-scope-observation.mjs';
import { materializeLockedRtreCase,lockedRtreCase } from './ares-rtre-locked-recipes.mjs';
import { createAresDependencyObservation } from '../../../src/core/ares-dependency-observation.js';
import { discoverAresAdaptationScope } from '../../../src/core/ares-adaptation-scope.js';
import { createSpatialPreservationBudget,spatialRefKey } from '../../../src/core/spatial-recovery-contract.js';
import { aresReplayJson } from '../../../src/core/ares-diagnostic-replay.js';
import { riFreeze } from '../../../src/core/road-impact-model.js';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';

export const P2_AUDIT_CASES=Object.freeze(R4_CASES.map(id=>'g:'+id));
export const P2_AUDIT_HOPS=Object.freeze([1,2,4,6]);
const key=spatialRefKey;
const expandable=row=>['requested-intent','review-candidate'].includes(row.classification);
function ownership(from,to,relation){
  return (from.ref.collection==='properties'&&['plots','buildings'].includes(to.ref.collection)&&
    ['property','plot','building','compound-member'].includes(relation))||
    (from.ref.collection==='buildings'&&to.ref.collection==='buildings'&&relation==='courtyard-occupant');
}
// Independent level-based reference for P2-C's initial isolated scope.
// Observation distance and expansion distance are DIFFERENT quantities.
// A read-only short path never licenses expansion via a longer path.
export function referenceP2Scope(o,maxHops,budget){
  const nodes=new Map(),adj=new Map(),active=new Set(),roots=new Set(o.roots.map(key));
  for(const n of o.nodes){budget.spend();const k=key(n.ref);nodes.set(k,n);adj.set(k,[]);}
  for(const e of o.edges){
    budget.spend();const a=key(e.from),b=key(e.to);
    adj.get(a).push({to:b,relation:e.relation});
    if(a!==b)adj.get(b).push({to:a,relation:e.relation});
  }
  for(const r of o.discovery.changedRoads){
    budget.spend();active.add(key(r.ref));
    for(const [i,s] of [[0,'a'],[1,'b']]){
      budget.spend();if(!Object.is(r.old[s].x,r.proposed[s].x)||!Object.is(r.old[s].y,r.proposed[s].y))active.add(key(r.endpointRefs[i]));
    }
  }
  for(const b of o.discovery.blockers){budget.spend();active.add(key(b.propertyRef));}
  const observed=new Map([...roots].map(k=>[k,0])),expansion=new Map(),omitted=new Set();
  let frontier=[...roots].filter(k=>active.has(k)&&expandable(nodes.get(k)));
  for(const k of frontier)expansion.set(k,0);
  for(let depth=0;depth<=maxHops&&frontier.length;depth++){
    const next=new Set();
    for(const from of frontier){
      budget.spend();
      for(const {to,relation} of adj.get(from)){
        budget.spend();
        if(depth+1>maxHops){if(!observed.has(to))omitted.add(to);continue;}
        if(!observed.has(to)||observed.get(to)>depth+1)observed.set(to,depth+1);
        if(!expansion.has(to)&&expandable(nodes.get(to))&&(active.has(to)||ownership(nodes.get(from),nodes.get(to),relation))){
          expansion.set(to,depth+1);next.add(to);
        }
      }
    }
    frontier=[...next];
  }
  for(const k of observed.keys()){budget.spend();omitted.delete(k);}
  return {observed,expansion,omitted};
}
export async function auditP2Case(caseId){
  if(!P2_AUDIT_CASES.includes(caseId))throw Error('Unapproved P2 audit case.');
  const f=materializeLockedRtreCase(caseId),lock=lockedRtreCase(caseId),before=aresReplayJson(f.project);
  const observationBudget=createSpatialPreservationBudget(G_MANIFEST.audit.root);
  const o=await createAresDependencyObservation(f.project,f.context,observationBudget);
  if(o.snapshotFingerprint!==lock.source)throw Error('P2 audit fixture source changed.');
  const rows=[];
  for(const hops of P2_AUDIT_HOPS){
    const budget=createSpatialPreservationBudget(G_MANIFEST.search.root),t=performance.now();
    const scope=await discoverAresAdaptationScope(f.project,f.context,{maxObjects:G_MANIFEST.search.maxObjects,maxHops:hops},budget);
    if(scope.snapshotFingerprint!==lock.source)throw Error('P2 scope source changed.');
    const auditBudget=createSpatialPreservationBudget(G_MANIFEST.audit.root);
    const mismatches=[];
    let expectedEntries=null,expectedExpansion=null,expectedOmitted=null,comparison='preflight-refused';
    if(o.status==='observed'){
      const expected=referenceP2Scope(o,hops,auditBudget);
      expectedEntries=expected.observed.size;expectedExpansion=expected.expansion.size;expectedOmitted=expected.omitted.size;
      comparison=expectedEntries>G_MANIFEST.search.maxObjects?'object-cap-not-comparable':'compared';
      if(comparison==='compared'){
        const actual=new Map(scope.entries.map(e=>[key(e.ref),e]));
        const omitted=new Set(scope.unresolvedRefs.map(key));
        for(const [k,e] of actual){
          auditBudget.spend();const depth=expected.observed.get(k),expandDepth=expected.expansion.get(k);
          if(depth===undefined)mismatches.push({kind:'outside-observation-depth',key:k,reportedDepth:e.depth});
          else if(e.depth!==depth)mismatches.push({kind:'observation-depth',key:k,reportedDepth:e.depth,expectedDepth:depth});
          if(e.role==='review-candidate'&&expandDepth===undefined)mismatches.push({kind:'out-of-bound-expansion',key:k,reportedDepth:e.depth});
          if(e.role!=='review-candidate'&&expandDepth!==undefined)mismatches.push({kind:'missing-expansion',key:k,expectedExpansionDepth:expandDepth});
        }
        for(const [k,depth] of expected.observed){auditBudget.spend();if(!actual.has(k))mismatches.push({kind:'missing-observation',key:k,depth});}
        for(const k of expected.omitted){auditBudget.spend();if(!omitted.has(k))mismatches.push({kind:'missing-omission',key:k});}
        for(const k of omitted){auditBudget.spend();if(!expected.omitted.has(k))mismatches.push({kind:'unexpected-omission',key:k});}
      }
    }
    rows.push({caseId,hops,source:lock.source,observationStatus:o.status,scopeStatus:scope.status,comparison,
      admitted:scope.entries.length,expanded:scope.entries.filter(e=>e.role==='review-candidate').length,
      omitted:scope.unresolvedRefs.length,reviewRefs:scope.reviewRefs.length,expectedEntries,expectedExpansion,expectedOmitted,mismatches,
      observationStats:observationBudget.snapshot(),scopeStats:budget.snapshot(),auditStats:auditBudget.snapshot(),elapsedMs:performance.now()-t});
  }
  if(aresReplayJson(f.project)!==before)throw Error('P2 audit mutated source.');
  return riFreeze(rows);
}
