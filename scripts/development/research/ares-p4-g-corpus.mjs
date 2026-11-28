import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createProject } from '../../../src/core/city-model.js';
import { buildRoadGraph } from '../../../src/core/road-graph.js';
import { resolveRoadGroupB1 } from '../../../src/core/road-group-b1.js';
import { validateStoredProject } from '../../../src/data/project-validation.js';
import { APP_VERSION,PROJECT_SCHEMA_VERSION } from '../../../src/core/version.js';
import { aresReplayJson } from '../../../src/core/ares-diagnostic-replay.js';
import { riFreeze,riCompare } from '../../../src/core/road-impact-model.js';

// G1 freezes inputs ONLY, with no search, solver outcome or fixture authority.
// A future pass must check these independently recorded identities before
// permitting a new recipe-only detached search. No imported cities.
export const G_MANIFEST=riFreeze(JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4-large-corpus-v1.json',import.meta.url),'utf8')));
function selection(graph,spec){
  const terminal=new Set(graph.terminalRoadIds),cap=G_MANIFEST.selection.maxVisitsPerGroup;
  const safe=new Set([...graph.nodesById.keys()].filter(id=>graph.incidentRoads.get(id).every(r=>!graph.roadClasses.get(r).protected&&!terminal.has(r))));
  const candidates=new Map([...safe].map(id=>[id,graph.incidentRoads.get(id).filter(r=>{
    const road=graph.roadsById.get(r);return safe.has(road.a)&&safe.has(road.b);
  }).sort(riCompare)]));
  const next=(id,r)=>{const e=graph.roadsById.get(r);return e.a===id?e.b:e.a;};
  let visits=0,limited=false,found=null;
  const tick=()=>{if(visits>=cap){limited=true;return false;}visits++;return true;};
  function record(ids){
    const group=resolveRoadGroupB1(graph,ids);
    if(group.eligible){found=[...group.selectedRoadIds];return true;}return false;
  }
  function path(start,id,nodes,edges){
    if(!tick())return;
    if(edges.length===spec.count){
      if(spec.shape==='chain'&&record(edges))return;
      return;
    }
    for(const r of candidates.get(id)??[]){
      if(found||limited)return;
      const other=next(id,r);
      if(edges.includes(r))continue;
      if(spec.shape==='loop'&&edges.length===spec.count-1){
        if(other===start&&record([...edges,r]))return;
        continue;
      }
      if(nodes.has(other))continue;
      const more=new Set(nodes);more.add(other);path(start,other,more,[...edges,r]);
    }
  }
  // Branch grows a tree from a real degree-three junction; no cycles.
  function branch(nodes,edges){
    if(!tick())return;
    if(edges.length===spec.count){record(edges);return;}
    for(const id of [...nodes].sort(riCompare))for(const r of candidates.get(id)??[]){
      if(found||limited)return;
      const other=next(id,r);if(nodes.has(other))continue;
      const more=new Set(nodes);more.add(other);branch(more,[...edges,r]);
    }
  }
  for(const id of [...safe].sort(riCompare)){
    if(found||limited)break;
    if(spec.shape!=='branch'){path(id,id,new Set([id]),[]);continue;}
    const edges=candidates.get(id);
    for(let i=0;i<edges.length&&!found&&!limited;i++)for(let j=i+1;j<edges.length&&!found&&!limited;j++)for(let k=j+1;k<edges.length&&!found&&!limited;k++){
      if(!tick())break;
      const initial=[edges[i],edges[j],edges[k]],nodes=new Set([id,...initial.map(r=>next(id,r))]);
      if(nodes.size===4)branch(nodes,initial);
    }
  }
  if(!found)return {id:spec.id,count:spec.count,shape:spec.shape,status:limited?'selection-limit':'selection-unavailable',visits,selectedRoadIds:[]};
  const degrees=new Map();
  for(const id of found){const r=graph.roadsById.get(id);for(const node of [r.a,r.b])degrees.set(node,(degrees.get(node)??0)+1);}
  return {id:spec.id,count:spec.count,shape:spec.shape,status:'selected',visits,selectedRoadIds:found,nodeCount:degrees.size,degreeSequence:[...degrees.values()].sort((a,b)=>a-b)};
}
export function materializeGCorpusCity(id){
  if(typeof id!=='string')throw Error('Frozen G city recipe ID required.');
  const recipe=G_MANIFEST.cities.find(c=>c.id===id);
  if(!recipe)throw Error('Unknown frozen G city recipe.');
  if(APP_VERSION!==G_MANIFEST.appVersion||PROJECT_SCHEMA_VERSION!==G_MANIFEST.schemaVersion)throw Error('G corpus source version changed.');
  const project=createProject(recipe.options);validateStoredProject(project);
  if(project.options.size!==recipe.options.size||project.options.morphology!==recipe.options.morphology)throw Error('G recipe normalized unexpectedly.');
  return project;
}
export function inventoryGCorpusCity(id){
  const project=materializeGCorpusCity(id),graph=buildRoadGraph(project.city);
  if(!graph.valid)throw Error('G corpus source graph invalid.');
  const before=aresReplayJson(project);
  const groups=G_MANIFEST.groups.map(spec=>selection(graph,spec));
  if(aresReplayJson(project)!==before)throw Error('G inventory mutated source.');
  return riFreeze({id,source:createHash('sha256').update(Buffer.from(before,'utf8')).digest('hex'),
    nodeCount:project.city.nodes.length,roadCount:project.city.roads.length,
    propertyCount:project.city.properties?.length??null,groups});
}
export function enumerateGSlots(){
  const rows=[];
  for(const city of G_MANIFEST.cities)for(const group of G_MANIFEST.groups)for(const magnitude of G_MANIFEST.magnitudes)for(const direction of G_MANIFEST.directions)
    rows.push({id:[city.id,group.id,magnitude,direction.id].join(':'),city:city.id,group:group.id,magnitude,direction:direction.id,offset:{x:magnitude*direction.x,y:magnitude*direction.y}});
  return riFreeze(rows);
}

// Shared input-selection primitive only; no solver, permit or altered G recipe.
export { selection as selectGCorpusGroup };
