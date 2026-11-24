import { describeLareRefusal } from './reconciliation-diagnostics.js';
import { createLareBudget,LareBudgetExceeded } from './reconciliation-budget.js';
import { createLareContext, discoverLareParcelScope } from './reconciliation-context.js';
import { iterateLareArrangement } from './reconciliation-arrangement.js';
import { iterateLareGroupPreservation } from './reconciliation-preservation.js';
import { reconcileLareAccess } from './reconciliation-access.js';
import { riEqual,riIndex,riReporter,riBudget } from './road-impact-model.js';
import { LARE_CONSTRAINTS } from './reconciliation-constraints.js';
import { stampRoadGenerated,classifyRoadProvenance } from './road-provenance.js';
import { cloneLareCity, hydrateLareCity } from './reconciliation-city.js';

const lareGroupCodes=new Set(['frontage-geometry','block-containment','road-setback','frame-reference',
  'property-containment','access-connection','road-clearance']);
const lareGroupClone=x=>JSON.parse(JSON.stringify(x));
const lareGroupIssue=(id,code,message,type='search-exhausted',relatedIds=[])=>({
  kind:'road',id,code,message,type,relatedIds,severity:'needs-review'
});
const lareGroupDiff=(a,b)=>Object.keys(b).filter(k=>!riEqual(a[k],b[k]));
const lareGroupCenter=b=>{
  const p=b.geometry.regions.flatMap(r=>r.ring);
  return {x:p.reduce((s,q)=>s+q.x,0)/p.length,y:p.reduce((s,q)=>s+q.y,0)/p.length};
};
const lareGroupRingCost=(a,b)=>a.length===b.length?a.reduce((s,p,i)=>s+Math.hypot(p.x-b[i].x,p.y-b[i].y),0):1e9;
function lareGroupRank(before,after){
  const score=[0,0,0,0,0,0],city=before.city,next=after.city;
  const buildings=riIndex(next.buildings),properties=riIndex(next.properties),plots=riIndex(next.plots);
  for(const a of city.buildings){
    const b=buildings.get(a.id);
    if(!riEqual(a.geometry,b.geometry)||a.orientation!==b.orientation){
      const p=lareGroupCenter(a),q=lareGroupCenter(b);
      score[0]++;score[1]+=Math.hypot(q.x-p.x,q.y-p.y);
      score[2]+=Math.abs(Math.atan2(Math.sin(b.orientation-a.orientation),Math.cos(b.orientation-a.orientation)));
    }
    if(!riEqual(a.entrance,b.entrance)||!riEqual(a.accessPath,b.accessPath))score[5]++;
  }
  for(const a of city.properties)score[3]+=lareGroupRingCost(a.boundary,properties.get(a.id).boundary);
  for(const a of city.plots)score[4]+=lareGroupRingCost(a.boundary,plots.get(a.id).boundary);
  return score;
}
function lareGroupLedger(before,after,draft,changedBlocks){
  const changed=[],ledger=[],old=before.city,next=after.city;
  const add=(kind,id,fields,disposition,provenance='derived')=>{
    ledger.push({kind,oldId:id,newId:id,disposition,provenance});
    if(fields.length)changed.push({kind,id,fields});
  };
  for(const n of draft.proposedNodes)add('junction',n.id,['x','y'],'moved');
  for(const id of draft.changedRoadIds)add('road',id,['effective-geometry'],'moved');
  for(const id of changedBlocks.keys())add('block',id,['area','boundary-geometry'],'reshaped');
  const oldPlots=riIndex(old.plots);
  for(const [collection,kind] of [['properties','property'],['plots','plot'],['buildings','building'],['openSpaces','open-space']]){
    const index=riIndex(next[collection]);
    for(const a of old[collection]){
      if(!changedBlocks.has(a.blockId))continue;
      const b=index.get(a.id),fields=lareGroupDiff(a,b).filter(k=>k!=='roadProvenance');
      const provenance=kind==='property'?classifyRoadProvenance(a,a.plotIds.map(id=>oldPlots.get(id))):
        kind==='building'?classifyRoadProvenance(a):'derived';
      const disposition=!fields.length?'preserved':kind==='building'?
        fields.includes('geometry')?'relocated':fields.includes('accessPath')||fields.includes('entrance')?'access-reconnected':'plot-occupancy-updated':
        kind==='open-space'?'recalculated':'reshaped';
      add(kind,a.id,fields,disposition,provenance);
    }
  }
  return {changed,ledger};
}
// A complete arrangement is checked without trusting its score or ledger.
// This adapter receives the already verified planar graph/face analysis.
export function* iterateLareRoadGroup(project,draft,analysis,baseline,choices=new Map(),budget=createLareBudget(),{enhanced=false}={}){
  const group=draft.selectedRoadIds?.[0]??'group';
  const refused=(issue)=>({...baseline,candidateProject:null,changed:[],ledger:[],status:'needs-review',
    unresolved:[issue],lare:{stats:budget.snapshot()}});
  let incumbent=null;
  try{
    if(baseline?.candidateProject){
      const violation=yield* iterateLareGroupPreservation(project,baseline.candidateProject,draft,choices,budget);
      if(!violation){
        const score=lareGroupRank(project,baseline.candidateProject);
        incumbent={score,key:'baseline',result:baseline};
        // Preserve the verified no-building-motion path without requiring
        // an expensive neighborhood search on every small ordinary edit.
        if(score[0]===0)return {...baseline,lare:{source:'verified-baseline',score,stats:budget.snapshot()}};
      }else baseline=refused(violation);
    }
    const {graph,faces,identity,impact}=analysis;
    if(!graph.valid||!faces.valid||!identity.valid||identity.requiresReview||
      identity.issues.length||identity.added.length||identity.removed.length||
      identity.split.length||identity.merged.length||identity.ambiguous.length||
      !impact.complete||impact.status==='invalid')
      return incumbent?.result??baseline;
    const hard=impact.issues.filter(i=>!(lareGroupCodes.has(i.code)&&['property','plot','building'].includes(i.kind)));
    if(hard.length)return incumbent?.result??baseline;
    const context=createLareContext(project,draft,choices,budget),city=project.city;
    const propertyIndex=riIndex(city.properties),plotIndex=riIndex(city.plots),buildingIndex=riIndex(city.buildings);
    const changedBlocks=new Map(identity.changed.filter(f=>f.kind==='block').map(f=>[f.id,f.record]));
    const roadsChanged=new Set(draft.changedRoadIds);
    const scope=discoverLareParcelScope(context,city,draft,changedBlocks,impact.issues,budget);
    const {primary}=scope;
    if(primary.some(p=>p.policy.mode==='decision-required'||p.policy.mode==='invalid-choice'))
      return incumbent?.result??baseline;
    // Portal/compound repair retains the existing explicit B1 path. The
    // generic adapter must not silently change linked or authored access.
    if(primary.some(p=>p.buildings.some(b=>b.reason==='dependent-structure')))
      return incumbent?.result??baseline;
    const spatial=scope.adapt();
    const active=spatial.authorized;
    if(!active.length)return incumbent?.result??baseline;
    const activeIds=new Set(active.map(p=>p.id));
    const edgeRoads=new Map(city.roads.map(r=>[[r.a,r.b].sort().join(':'),r]));
    const blockEdges=new Map([...changedBlocks].map(([id,b])=>[id,b.vertices.map((v,i)=>({
      a:graph.nodesById.get(v),b:graph.nodesById.get(b.vertices[(i+1)%b.vertices.length]),
      road:edgeRoads.get([v,b.vertices[(i+1)%b.vertices.length]].sort().join(':'))
    }))]));
    const entries=active.map(p=>{
      const source=propertyIndex.get(p.id),edges=blockEdges.get(p.blockId);
      return {property:source,plots:p.plotIds.map(id=>plotIndex.get(id)),mode:p.policy.mode,
        edge:edges.find(e=>e.road?.id===p.frontageRoadId),edges,
        fixedNeighbors:city.properties.filter(q=>q.blockId===p.blockId&&spatial.role(q.id)!=='authorized').map(q=>q.boundary),
        buildings:p.buildings.map(b=>({source:buildingIndex.get(b.id),permission:b}))};
    });
    const permissions=new Map(context.properties.flatMap(p=>p.buildings.map(b=>[b.id,b])));
    const parcelPermissions=new Map(context.properties.map(p=>[p.id,p.policy]));
    let lastIssue=null;
    const finalize = function* (row, old) {
      if(old)return incumbent?.result?incumbent:null;
      try{
        yield { stage: 'candidate-materialization' };
        const next = yield* cloneLareCity(draft.proposedCity, lareGroupClone);
        next.blocks=next.blocks.map(b=>lareGroupClone(changedBlocks.get(b.id)??b));
        const parcels=new Map(row.parcels.map(p=>[p.property.id,p]));
        const plotUpdates=new Map(row.parcels.flatMap(p=>p.plots.map(q=>[q.id,q])));
        const buildingUpdates=new Map(row.buildings.map(b=>[b.id,b]));
        next.properties=next.properties.map(p=>parcels.has(p.id)?lareGroupClone(parcels.get(p.id).property):p);
        next.plots=next.plots.map(p=>plotUpdates.has(p.id)?lareGroupClone(plotUpdates.get(p.id)):p);
        next.buildings=next.buildings.map(b=>buildingUpdates.has(b.id)?lareGroupClone(buildingUpdates.get(b.id)):b);
        yield* hydrateLareCity(next);
        const nextPlots=riIndex(next.plots),nextProperties=riIndex(next.properties);
        for(const id of activeIds){
          const p=nextProperties.get(id),policy=parcelPermissions.get(id);
          if(policy.provenance==='generated')stampRoadGenerated(p,p.plotIds.map(id=>nextPlots.get(id)));
        }
        // Explicit choices retain their complete original snapshots.
        const archive=lareGroupClone(city.roadParcelDecisionHistory028??[]);
        for(const [id,choice] of [...choices].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)){
          const p=propertyIndex.get(id);
          if(!p||!['keep','reshape'].includes(choice.kind)||archive.length>=24)return null;
          archive.push({kind:choice.kind,sourceId:id,targetId:null,source:lareGroupClone({
            property:p,plots:p.plotIds.map(id=>plotIndex.get(id)),buildings:p.buildingIds.map(id=>buildingIndex.get(id))
          })});
        }
        if(archive.length)next.roadParcelDecisionHistory028=archive;
        // Whole arrangement is now available; access checks must not use
        // obsolete locations of movable buildings.
        let accessChanges=0;
        for(let i=0;i<next.buildings.length;i++){
          const b=next.buildings[i],original=buildingIndex.get(b.id),permission=permissions.get(b.id);
          if(!permission||(!activeIds.has(b.propertyId)&&!roadsChanged.has(b.frontageRoadId)))continue;
          if(permission.reason==='dependent-structure')return null;
          yield { stage: 'building-access', id: b.id };
          const repaired=reconcileLareAccess(next,original,b,permission,budget);
          if(!repaired.ok){lastIssue=lareGroupIssue(group,repaired.code,'No authorized route to the existing frontage was found.','geometric-obstruction',[b.id]);return null;}
          const candidate=repaired.building;
          if(permission.provenance==='generated'&&!riEqual(original.plotIds,candidate.plotIds))
            stampRoadGenerated(candidate);
          if(!riEqual(original.entrance,candidate.entrance)||!riEqual(original.accessPath,candidate.accessPath))accessChanges++;
          next.buildings[i]=candidate;
        }
        const areaByBlock=new Map();
        for(const p of next.properties)if(changedBlocks.has(p.blockId))
          areaByBlock.set(p.blockId,(areaByBlock.get(p.blockId)??0)+p.area);
        for(const space of next.openSpaces)if(changedBlocks.has(space.blockId))
          space.area=Math.max(0,changedBlocks.get(space.blockId).area-(areaByBlock.get(space.blockId)??0));
        const candidateProject={...lareGroupClone({...project,city:null}),city:next};
        const violation=yield* iterateLareGroupPreservation(project,candidateProject,draft,choices,budget);
        if(violation){lastIssue=violation;return null;}
        const {emit,items}=riReporter(),impactSpend=riBudget(),spend=(n=1)=>{impactSpend(n);if(n>0)budget.spend(n);};
        const dependencyContext={roadIds:draft.changedRoadIds,junctionIds:draft.proposedNodes.map(n=>n.id),
          changedBlockIds:[...changedBlocks.keys()],acceptedValid:true};
        yield* LARE_CONSTRAINTS.landDependencies.iterate(next,next,dependencyContext,emit,spend,city);
        LARE_CONSTRAINTS.infrastructure.check(city,next,dependencyContext,emit,spend);
        const remaining=items().filter(i=>i.severity!=='info'&&i.code!=='frontage-geometry'&&
          !(i.kind==='plot'&&i.code==='property-containment'));
        if (remaining.length) {
          const issue = remaining[0];
          const outOfScope = issue.kind === 'property' && spatial.role(issue.id) !== 'authorized';
          lastIssue = describeLareRefusal(outOfScope ? { ...issue, type: 'scope-conflict' } : issue);
          return null;
        }
        yield* LARE_CONSTRAINTS.storedProject.iterate(candidateProject);
        const {changed,ledger}=lareGroupLedger(project,candidateProject,draft,changedBlocks);
        const score=row.score.slice();score[5]+=accessChanges;
        return {score,key:row.key,result:{phase:'B1',status:'candidate-only',candidateProject,changed,ledger,unresolved:[],
          validation:{graph:'pass',faces:'pass',parcels:'pass',project:'valid'},parcelReview:baseline.parcelReview??[]}};
      }catch(error){
        if(error instanceof LareBudgetExceeded)throw error;
        lastIssue=lareGroupIssue(group,'lare-candidate-validation',error.message,'invalid-candidate');
        return null;
      }
    };
    // Zero relocation tier first; if it fails, allow only the individually
    // authorized generated rigid transformations under the same budget.
    const fixed=entries.map(e=>({...e,buildings:e.buildings.map(b=>({...b,permission:{...b.permission,mode:'fixed'}}))}));
    let outcome=yield* iterateLareArrangement({entries:fixed,finalize,incumbent,enhanced},budget);
    if(outcome.best)incumbent=outcome.best;
    if(!outcome.exhausted&&(!incumbent||incumbent.score[0]>0)){
      outcome=yield* iterateLareArrangement({entries,finalize,incumbent,enhanced},budget);
      if(outcome.best)incumbent=outcome.best;
    }
    if(incumbent)return {...incumbent.result,lare:{source:incumbent.key==='baseline'?'verified-baseline':'adaptive',
      score:incumbent.score,stats:budget.snapshot(),exhausted:outcome.exhausted??null}};
    const result=refused(lareGroupIssue(group,outcome.exhausted?'lare-work-limit':'lare-search-exhausted',
      outcome.exhausted?'Local reconciliation reached its deterministic work limit; safety is unproven.':
      'No supported local arrangement was found; this does not prove the requested movement is impossible.',
      outcome.exhausted?'work-limit':'search-exhausted',lastIssue?.relatedIds??[...activeIds]));
    result.lare.lastRejectedCandidate=lastIssue;return result;
  }catch(error){
    if(incumbent)return {...incumbent.result,lare:{source:'verified-baseline',score:incumbent.score,stats:budget.snapshot()}};
    return refused(lareGroupIssue(group,error instanceof LareBudgetExceeded?'lare-work-limit':'lare-unproven',
      error.message,error instanceof LareBudgetExceeded?'work-limit':'invalid-candidate'));
  }
}
export function solveLareRoadGroup(...args){
  const it=iterateLareRoadGroup(...args);
  for(;;){const step=it.next();if(step.done)return step.value;}
}
