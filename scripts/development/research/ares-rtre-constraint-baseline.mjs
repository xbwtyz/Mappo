import { createHash } from 'node:crypto';
import { materializeAresP3Case } from './ares-p3-fixtures.mjs';
import { inspectFreshRtreNeighborhood } from './ares-rtre-fresh-neighborhood.mjs';
import { aresReplayJson } from '../../../src/core/ares-diagnostic-replay.js';
import { createAresLandscapeSegmentObserver } from '../../../src/core/ares-landscape-observation.js';
import { createAresDefenseSegmentObserver } from '../../../src/core/ares-defense-observation.js';
import { createSpatialRef } from '../../../src/core/spatial-recovery-contract.js';
import { classifyRoad } from '../../../src/core/road-graph.js';
import { riFreeze,riCompare } from '../../../src/core/road-impact-model.js';
const ref=(collection,id)=>createSpatialRef({collection,id});
const equal=(a,b)=>Object.is(a.x,b.x)&&Object.is(a.y,b.y);
const point=n=>({x:n.x,y:n.y});
// Private recipe-bound exact-intent experiment. Not a solver. Later E2
// must generate and evaluate each actual candidate, not trust these rows.
export async function inspectFreshRtreConstraintBaseline(caseId,options,budget){
  const report=await inspectFreshRtreNeighborhood(caseId,options,budget);
  const f=materializeAresP3Case(caseId),source=f.project,before=aresReplayJson(source,budget);
  const bytes=Buffer.from(before,'utf8');budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
  const snapshotFingerprint=createHash('sha256').update(bytes).digest('hex');
  if(snapshotFingerprint!==report.snapshotFingerprint||aresReplayJson(f.context,budget)!==aresReplayJson(report.context,budget))
    throw Error('RTRE constraint source mismatch.');
  const result={version:1,caseId,context:f.context,snapshotFingerprint,eligibilityStatus:report.status,
    status:'preflight-refused',changedRoadRefs:[],landscape:[],defense:[],finalBlockers:[],sweptUnresolved:[]};
  if(report.requested.length===0||report.status==='preflight-refused'||report.status==='required-scope-incomplete')
    return riFreeze(result);
  const city=source.city,requested=new Map(report.requested.map(r=>[r.ref.id,r.point])),nodes=new Map();
  for(const n of city.nodes){budget.spend();nodes.set(n.id,n);}
  const changed=[];
  for(const r of city.roads){
    budget.spend();const a=point(nodes.get(r.a)),b=point(nodes.get(r.b)),p=requested.get(r.a)??a,q=requested.get(r.b)??b;
    if(equal(a,p)&&equal(b,q))continue;
    if(classifyRoad(r).protected)throw Error('Protected road cannot enter RTRE segment observation.');
    changed.push({ref:ref('roads',r.id),endpointRefs:[ref('nodes',r.a),ref('nodes',r.b)],old:{a,b},proposed:{a:p,b:q}});
  }
  budget.spend(Math.max(1,changed.length*Math.ceil(Math.log2(changed.length+1))));
  changed.sort((a,b)=>riCompare(a.ref.id,b.ref.id));
  const landscape=createAresLandscapeSegmentObserver(city,budget),defense=createAresDefenseSegmentObserver(city,budget);
  for(const road of changed){
    budget.spend();result.changedRoadRefs.push(road.ref);
    for(const phase of ['swept','final']){
      budget.spend();
      result.landscape.push(...landscape.observe(f.context,snapshotFingerprint,road,phase,budget));
      result.defense.push(defense.observe(f.context,snapshotFingerprint,road,phase,budget));
    }
  }
  for(const e of [...result.landscape,...result.defense.map(x=>x.constraint)]){
    budget.spend();
    if(e.query.phase==='final'&&e.summary!=='observed-satisfied')result.finalBlockers.push(e);
    if(e.query.phase==='swept'&&e.summary!=='observed-satisfied')result.sweptUnresolved.push(e);
  }
  result.status=result.finalBlockers.length?'final-blocked':changed.length?'final-observed-satisfied':'preflight-refused';
  if(aresReplayJson(source,budget)!==before)throw Error('RTRE constraint observation mutated source.');
  aresReplayJson(result,budget);return riFreeze(result);
}
