import { createSpatialInventory, createSpatialRef, spatialRefKey } from './spatial-recovery-contract.js';
import { createAresDiagnosticContext, createAresDiagnostic } from './ares-diagnostic-contract.js';
import { adaptAresGraphIssue, adaptAresGroupIssue } from './ares-diagnostic-adapters.js';
import { iterateRoadGraph } from './road-graph.js';
import { proposeRoadGroupNodesB1 } from './road-group-b1.js';
import { segmentDistance, STREET_WIDTHS, STREET_EDGE_WIDTH, PROPERTY_SETBACK } from './placement.js';
import { riCompare, riFreeze } from './road-impact-model.js';

// P2-A: detached discovery only. Bounds are conservative broad-phase
// candidates, not swept collisions or a verified candidate city.
export const ARES_ROAD_DISCOVERY_VERSION=1;
const aresRef=(collection,id)=>createSpatialRef({collection,id});
function aresPoint(p){
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('Invalid discovery point.');
  return {x:p.x,y:p.y};
}
function aresBounds(points,budget){
  const box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  for(const point of points){
    budget.spend();const p=aresPoint(point);
    box.minX=Math.min(box.minX,p.x);box.maxX=Math.max(box.maxX,p.x);
    box.minY=Math.min(box.minY,p.y);box.maxY=Math.max(box.maxY,p.y);
  }
  if(!Number.isFinite(box.minX))throw Error('Empty discovery geometry.');
  return box;
}
function aresInflate(box,margin){
  return {minX:box.minX-margin,minY:box.minY-margin,maxX:box.maxX+margin,maxY:box.maxY+margin};
}
function aresOverlap(a,b){
  return a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;
}
function aresDistance(polygon,a,b,budget){
  // Same boundary-edge distance and charges as road-impact-dependencies.
  budget.spend(polygon.length*3);
  let nearest=Infinity;
  for(let i=0;i<polygon.length;i++)
    nearest=Math.min(nearest,segmentDistance(polygon[i],polygon[(i+1)%polygon.length],a,b));
  return nearest;
}
function aresDiscoveryGraph(city,budget){
  // Existing graph validator retains its own fixed domain cap. Charge
  // input inventory and intersection batches on the shared budget too.
  budget.spend(Math.max(1,city.nodes.length+city.roads.length));
  const iterator=iterateRoadGraph(city);
  let charged=0;
  try{
    for(let step=iterator.next();;step=iterator.next()){
      if(step.done){
        const remainder=step.value.work-charged;
        if(remainder>0)budget.spend(remainder);
        return step.value;
      }
      if(step.value.stage==='road-graph-intersections'){budget.spend(64);charged+=64;}
      else budget.spend();
    }
  }finally{iterator.return();}
}
function aresProperties(city,budget){
  const result=[];
  for(const property of city.properties){
    budget.spend();
    if(!Array.isArray(property.boundary)||property.boundary.length<3)
      throw Error('Invalid discovery property boundary.');
    const bounds=aresBounds(property.boundary,budget);
    result.push({ref:aresRef('properties',property.id),blockRef:aresRef('blocks',property.blockId),
      polygon:property.boundary,bounds});
  }
  return result;
}
function aresByRef(a,b){return riCompare(spatialRefKey(a.ref),spatialRefKey(b.ref));}
function aresRowOrder(a,b){return riCompare(spatialRefKey(a.roadRef),spatialRefKey(b.roadRef))||
  riCompare(spatialRefKey(a.propertyRef),spatialRefKey(b.propertyRef));}
function aresRoadSegments(graph,proposal,budget){
  const moved=new Map(proposal.proposedNodes.map(n=>[n.id,n]));
  const rows=[];
  for(const id of proposal.group.affectedRoadIds){
    budget.spend();
    const road=graph.roadsById.get(id),a=aresPoint(graph.nodesById.get(road.a)),b=aresPoint(graph.nodesById.get(road.b));
    const p=aresPoint(moved.get(road.a)??a),q=aresPoint(moved.get(road.b)??b);
    if(a.x===p.x&&a.y===p.y&&b.x===q.x&&b.y===q.y)continue;
    const margin=(STREET_WIDTHS[road.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK;
    if(!Number.isFinite(margin))throw Error('Unsupported road setback width.');
    rows.push({ref:aresRef('roads',id),endpointRefs:[aresRef('nodes',road.a),aresRef('nodes',road.b)],
      selected:proposal.group.selectedRoadIds.includes(id),old:{a,b},proposed:{a:p,b:q},
      requiredDistance:margin,finalBounds:aresInflate(aresBounds([p,q],budget),margin),
      sweptBounds:aresInflate(aresBounds([a,b,p,q],budget),margin)});
  }
  return rows.sort(aresByRef);
}
// Caller supplies an accepted Schema 11 snapshot and existing operation budget.
// No cross-revision index cache, no inferred write rights, no graph repair.
// The reference path tests all road/property pairs without broad pruning for
// final edge distance, so it can detect an indexed narrow-phase omission.
export function discoverAresRoadSetbacks(project,contextInput,budget,{algorithm='indexed'}={}){
  if(!['indexed','reference'].includes(algorithm))throw Error('Unsupported ARES discovery algorithm.');
  const context=createAresDiagnosticContext(contextInput);
  const inventory=createSpatialInventory(project,context.operation,budget);
  const city=project.city,graph=aresDiscoveryGraph(city,budget);
  const empty=diagnostics=>riFreeze({version:ARES_ROAD_DISCOVERY_VERSION,context,status:'preflight-refused',
    changedRoads:[],sweptCandidates:[],finalCandidates:[],blockers:[],diagnostics});
  if(!graph.valid)return empty(graph.issues.map(i=>adaptAresGraphIssue(context,i)));
  budget.spend(Math.max(1,graph.roadsById.size+graph.nodesById.size));
  const proposal=proposeRoadGroupNodesB1(graph,context.operation.editedRefs.map(r=>r.id),context.operation.geometry.offset);
  if(!proposal.draftable)return empty(proposal.issues.map(i=>adaptAresGroupIssue(context,i)));
  const changedRoads=aresRoadSegments(graph,proposal,budget),properties=aresProperties(city,budget);
  const known=new Set(inventory.refs.map(spatialRefKey));
  for(const item of properties){
    budget.spend();
    if(!known.has(spatialRefKey(item.blockRef)))throw Error('Missing discovery property block.');
  }
  if(algorithm==='indexed'){
    budget.spend(Math.max(1,properties.length*Math.ceil(Math.log2(properties.length+1))));
    properties.sort((a,b)=>a.bounds.minX-b.bounds.minX||aresByRef(a,b));
  }
  const sweptCandidates=[],finalCandidates=[],blockers=[];
  for(const road of changedRoads){
    for(const property of properties){
      budget.spend();
      if(algorithm==='indexed'&&property.bounds.minX>road.sweptBounds.maxX)break;
      const swept=aresOverlap(property.bounds,road.sweptBounds);
      const final=aresOverlap(property.bounds,road.finalBounds);
      const pair={roadRef:road.ref,propertyRef:property.ref,blockRef:property.blockRef};
      if(swept)sweptCandidates.push(pair);
      if(final)finalCandidates.push(pair);
      if(algorithm==='indexed'&&!final)continue;
      const distance=aresDistance(property.polygon,road.proposed.a,road.proposed.b,budget);
      if(distance>=road.requiredDistance-1e-5)continue;
      const metrics={unit:'map-unit',newDistance:distance,requiredDistance:road.requiredDistance,
        oldDistance:aresDistance(property.polygon,road.old.a,road.old.b,budget),oldRequiredDistance:road.requiredDistance};
      blockers.push({...pair,diagnostic:createAresDiagnostic(context,{
        reason:'domain-violation',code:'road-setback',stage:'changed-road-final-clearance',
        message:'Proposed street conflicts with the existing property setback.',
        refs:[road.ref,property.ref,property.blockRef],source:{id:'ares-road-discovery',version:'1'},
        measurements:metrics})});
    }
  }
  sweptCandidates.sort(aresRowOrder);finalCandidates.sort(aresRowOrder);blockers.sort(aresRowOrder);
  return riFreeze({version:ARES_ROAD_DISCOVERY_VERSION,context,status:'observed',changedRoads,
    sweptCandidates,finalCandidates,blockers,diagnostics:[]});
}
