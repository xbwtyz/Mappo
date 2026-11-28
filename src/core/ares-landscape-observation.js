import { createAresDependencyObservation } from './ares-dependency-observation.js';
import { createAresConstraintQueryService } from './ares-constraint-query.js';
import { matchesAresDiagnosticContext } from './ares-diagnostic-contract.js';
import { aresReplayJson } from './ares-diagnostic-replay.js';
import { createSpatialRef } from './spatial-recovery-contract.js';
import { waterSetIntervals, waterSetContains, waterSetBoundary } from './water-geometry.js';
import { classifyRoad } from './road-graph.js';
import { riFreeze, riCompare } from './road-impact-model.js';

export const ARES_LANDSCAPE_VERSION=1;
const ref=(collection,id)=>createSpatialRef({collection,id});
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
function box(points){
  return {x:{min:Math.min(...points.map(p=>p.x)),max:Math.max(...points.map(p=>p.x))},
    y:{min:Math.min(...points.map(p=>p.y)),max:Math.max(...points.map(p=>p.y))},z:null};
}
function overlaps(a,b){
  return a.x.min<=b.x.max&&a.x.max>=b.x.min&&a.y.min<=b.y.max&&a.y.max>=b.y.min;
}
const kinds=[
  {id:'ares-water',collection:'waterFeatures',crossings:'bridges',link:'waterId'},
  {id:'ares-terrain',collection:'terrainFeatures',crossings:'terrainPasses',link:'terrainId'}
];
// Use current accepted saved corridors, not inferred elevation surfaces.
// Model is assumed accepted by the host; these observations cannot replace
// validateWaterCity/validateTerrainCity or authoritative candidate validation.
function landscapeData(city,kind,budget){
  const features=(city[kind.collection]??[]).map(f=>{
    budget.spend();
    if(!Array.isArray(f.corridor)||f.corridor.length<3)throw Error('Invalid accepted landscape corridor.');
    const corridor=f.corridor.map(p=>{
      budget.spend();
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('Invalid landscape coordinate.');
      return {x:p.x,y:p.y};
    });
    return {id:f.id,kind:f.kind,corridor,bounds:box(corridor)};
  }).sort((a,b)=>riCompare(a.id,b.id));
  const crossings=(city[kind.crossings]??[]).map(c=>{
    budget.spend();
    const owner=features.find(f=>f.id===c[kind.link]);
    if(!owner)throw Error('Missing landscape crossing owner.');
    return {ref:ref(kind.crossings,c.id),featureRef:ref(kind.collection,owner.id)};
  });
  return riFreeze({features,crossings});
}
function geometryId(road,phase){
  // Exact detached geometry label, bounded because four finite points.
  const points=[road.old.a,road.old.b,road.proposed.a,road.proposed.b];
  const buffer=new ArrayBuffer(64),view=new DataView(buffer);
  let i=0;
  for(const p of points)for(const n of [p.x,p.y]){view.setFloat64(i,n);i+=8;}
  return phase+':'+Array.from(new Uint8Array(buffer),v=>v.toString(16).padStart(2,'0')).join('');
}
export function makeAresRoadConstraintQuery(context,snapshot,road,phase){
  return {version:1,context,snapshotFingerprint:snapshot,
    geometryFingerprint:geometryId(road,phase),capability:'road-corridor-2d',phase,
    frame:{horizontal:'city-map-unit',vertical:null},
    bounds:box(phase==='final'?[road.proposed.a,road.proposed.b]:
      [road.old.a,road.old.b,road.proposed.a,road.proposed.b]),refs:[road.ref]};
}
function landscapeRows(kind,data,road,query,spend){
  const {features}=data;
  const possible=features.filter(f=>{spend();return overlaps(f.bounds,query.bounds);});
  const row=(id,outcome,refs,detail)=>({id,ruleVersion:'1',kind:'hard-domain',outcome,refs,anchorRefs:[],detail});
  if(!possible.length)return [row('corridor-clear','satisfied',[road.ref],'No reserved landscape corridor overlaps the queried centerline bounds.')];
  if(query.phase==='swept'){
    // Conservative envelope only; no claim of continuous collision or a
    // swept protection rule. Unknown is never a verified hard-domain pass.
    return possible.map((f,i)=>row('swept-candidate-'+i,'unknown',
      [road.ref,ref(kind.collection,f.id)],'Swept endpoint envelope overlaps this reserved corridor; exact swept contact is unresolved.'));
  }
  const {a,b}=road.proposed;
  // Existing domain geometry splits the full line at all union boundaries;
  // also check the existing city validator's midpoint semantics. Account
  // conservatively for interval classification and mixed-union boundary tests.
  const n=features.reduce((s,f)=>s+f.corridor.length,0);
  spend(Math.max(1,8*(n+1)*(n+1)));
  const intervals=waterSetIntervals(a,b,features);
  const bad=intervals.filter(s=>s.inside&&!waterSetBoundary(mid(s.a,s.b),features));
  const center=mid(a,b);
  if(waterSetContains(center,features)&&!waterSetBoundary(center,features))bad.push({a:center,b:center});
  if(!bad.length)return [row('corridor-clear','satisfied',[road.ref],'No ordinary centerline interior inside the saved landscape union.')];
  const owners=new Set();
  for(const s of bad){
    const p=mid(s.a,s.b);
    for(const f of features){
      spend(Math.max(1,f.corridor.length*2));
      if(waterSetContains(p,[f])||waterSetBoundary(p,[f]))owners.add(f.id);
    }
  }
  const ids=[...owners].sort(riCompare);
  if(!ids.length)return [row('corridor-owner-unknown','unknown',[road.ref],'Reserved corridor contact found but feature attribution is unresolved.')];
  return ids.map((id,i)=>row('corridor-contact-'+i,'violated',[road.ref,ref(kind.collection,id)],
    'Ordinary road centerline enters the reserved landscape corridor.'));
}
// Both model observation and geometry are captured from the same detached
// persisted snapshot. Expose evidence, not the internal evaluator closure.
// Protected bridges/banks/passes cannot enter ordinary B1 changed-road search;
// their existing ownership is reported separately and never exempted.
export async function discoverAresLandscape(project,context,budget){
  if(typeof budget?.spend!=='function')throw Error('Shared ARES landscape budget required.');
  const snapshot=JSON.parse(aresReplayJson(project,budget));
  const observation=await createAresDependencyObservation(snapshot,context,budget);
  const city=snapshot.city,providers=[],crossings=[],evidence=[];
  for(const kind of kinds){
    const data=landscapeData(city,kind,budget);
    crossings.push(...data.crossings);
    const roadMap=new Map(observation.discovery.changedRoads.map(r=>[r.ref.id,r]));
    const descriptor={id:kind.id,version:1,capabilities:['road-corridor-2d']};
    const service=createAresConstraintQueryService([{descriptor,evaluate(query,spend){
      if(!matchesAresDiagnosticContext({version:1,context:query.context},observation.context)||
        query.snapshotFingerprint!==observation.snapshotFingerprint||query.refs.length!==1)
        throw Error('Stale landscape query.');
      const road=roadMap.get(query.refs[0].id);
      if(!road||query.refs[0].collection!=='roads'||query.geometryFingerprint!==geometryId(road,query.phase))
        throw Error('Invalid landscape road geometry.');
      if(query.frame.vertical!==null||query.bounds.z!==null)
        return [{id:'vertical-unsupported',ruleVersion:'1',kind:'hard-domain',outcome:'unsupported',
          refs:[road.ref],anchorRefs:[],detail:'Schema 11 has no continuous elevation or grade separation.'}];
      return landscapeRows(kind,data,road,query,spend);
    }}]);
    providers.push(...service.descriptors());
    for(const road of observation.discovery.changedRoads){
      budget.spend();
      budget.spend(Math.max(1,city.roads.length));
      const original=city.roads.find(r=>r.id===road.ref.id);
      if(!original||classifyRoad(original).protected)throw Error('Protected road cannot enter ordinary landscape query.');
      for(const phase of ['swept','final'])
        evidence.push(service.query(kind.id,makeAresRoadConstraintQuery(observation.context,observation.snapshotFingerprint,road,phase),budget));
    }
  }
  return riFreeze({version:ARES_LANDSCAPE_VERSION,context:observation.context,snapshotFingerprint:observation.snapshotFingerprint,
    status:observation.status,providers,crossings,evidence,diagnostics:observation.discovery.diagnostics,
    verticalCapability:'unsupported'});
}

// P4-E1 detached geometry query helper. Reuses P2 domain semantics for
// arbitrary proposed ordinary segment geometry. Observation only, not
// authority, proof of source membership, or whole-city verification.
// Caller owns source binding and must reconstruct rows independently.
export function createAresLandscapeSegmentObserver(city,budget){
  const datasets=kinds.map(kind=>({kind,data:landscapeData(city,kind,budget)}));
  return Object.freeze({observe(context,snapshot,road,phase,shared){
    if(shared!==budget)throw Error('Landscape observer requires its original shared budget.');
    const query=makeAresRoadConstraintQuery(context,snapshot,road,phase);
    return riFreeze(datasets.map(({kind,data})=>{
      const descriptor={id:kind.id,version:1,capabilities:['road-corridor-2d']};
      const service=createAresConstraintQueryService([{descriptor,evaluate(q,spend){
        return landscapeRows(kind,data,road,q,spend);
      }}]);
      return service.query(kind.id,query,budget);
    }));
  }});
}
