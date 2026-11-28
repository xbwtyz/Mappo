import { createSpatialInventory, createSpatialRef } from './spatial-recovery-contract.js';
import { createAresDiagnosticContext, createAresDiagnostic } from './ares-diagnostic-contract.js';
import { adaptAresGraphIssue, adaptAresGroupIssue } from './ares-diagnostic-adapters.js';
import { aresReplayJson } from './ares-diagnostic-replay.js';
import { hydrateProjectS10 } from './building-project-s10.js';
import { iterateRoadGraph } from './road-graph.js';
import { proposeRoadGroupNodesB1 } from './road-group-b1.js';
import { insideOrOn } from './boundary.js';
import { riFreeze, riCompare } from './road-impact-model.js';
import { APP_VERSION } from './version.js';

// P4-A: exact, detached geometry observation. No candidate city, editable
// neighbor, topology change or Apply authority is returned. Mode is explicit
// research intent, not the current editor's mode or a permission grant.
export const ARES_RTRE_GEOMETRY_VERSION=1;
const ref=(collection,id)=>createSpatialRef({collection,id});
function explicitMode(input){
  if(!input||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input))||
    Reflect.ownKeys(input).length!==1||!Object.hasOwn(input,'mode')||
    !Object.hasOwn(Object.getOwnPropertyDescriptor(input,'mode'),'value')||
    !['strict','adaptive'].includes(input.mode))throw Error('Explicit detached RTRE strict or adaptive mode required.');
  return input.mode;
}
function graphFor(city,budget){
  budget.spend(Math.max(1,city.nodes.length+city.roads.length));
  const iterator=iterateRoadGraph(city);let charged=0;
  try{
    for(;;){
      const step=iterator.next();
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
function fixedAnchors(city,graph,budget){
  const reasons=new Map();
  function add(id,reason){
    budget.spend();
    if(!graph.nodesById.has(id))throw Error('Missing RTRE infrastructure anchor.');
    if(!reasons.has(id))reasons.set(id,new Set());
    reasons.get(id).add(reason);
  }
  for(const [id,road] of graph.roadsById){
    budget.spend();
    if(graph.roadClasses.get(id).protected){
      add(road.a,'protected-road');add(road.b,'protected-road');
    }
  }
  for(const id of graph.terminalRoadIds){
    const road=graph.roadsById.get(id);
    add(road.a,'terminal-corridor');add(road.b,'terminal-corridor');
  }
  for(const gate of city.gates??[]){
    budget.spend();
    if(gate.connection?.cityNodeId!=null)add(gate.connection.cityNodeId,'gate-approach');
  }
  for(const c of ['waterFaces','terrainFaces'])for(const row of city[c]??[]){
    budget.spend();
    for(const id of row.vertices??[])add(id,c==='waterFaces'?'water-face':'terrain-face');
  }
  return reasons;
}
function diagnostic(context,reason,code,message,refs){
  return createAresDiagnostic(context,{reason,code,stage:'rtre-geometry-preflight',message,refs,
    source:{id:'ares-rtre-geometry',version:'1'}});
}
async function fingerprint(text,budget){
  const bytes=new TextEncoder().encode(text);
  budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
  if(!globalThis.crypto?.subtle)throw Error('RTRE source fingerprint unavailable.');
  const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function observeAresRtreGeometry(project,contextInput,options,budget){
  const mode=explicitMode(options),context=createAresDiagnosticContext(contextInput);
  if(context.sourceVersion!==APP_VERSION)throw Error('Unsupported RTRE source version.');
  if(context.operation.permissions.regeneration)throw Error('RTRE regeneration unsupported.');
  if(typeof budget?.spend!=='function')throw Error('Shared RTRE budget required.');
  // Own the entire accepted snapshot and normalized context before any await.
  // Capture signed zero and unknown persisted metadata, but do not return it.
  const persisted=aresReplayJson(project,budget),source=hydrateProjectS10(JSON.parse(persisted));
  createSpatialInventory(source,context.operation,budget);
  const graph=graphFor(source.city,budget);
  const result={version:ARES_RTRE_GEOMETRY_VERSION,context,mode,
    status:'selection-refused',requested:[],junctions:[],affectedRoadRefs:[],diagnostics:[],
    candidateGraphValid:null};
  if(!graph.valid)result.diagnostics=graph.issues.map(i=>adaptAresGraphIssue(context,i));
  else{
    const op=context.operation;
    budget.spend(Math.max(1,graph.roadsById.size+graph.nodesById.size));
    const proposal=proposeRoadGroupNodesB1(graph,op.editedRefs.map(r=>r.id),op.geometry.offset);
    if(!proposal.draftable)result.diagnostics=proposal.issues.map(i=>adaptAresGroupIssue(context,i));
    else{
      const anchors=fixedAnchors(source.city,graph,budget),requested=new Map(proposal.proposedNodes.map(n=>[n.id,n]));
      result.requested=proposal.proposedNodes.map(n=>({ref:ref('nodes',n.id),point:{x:n.x,y:n.y}}));
      result.affectedRoadRefs=proposal.group.affectedRoadIds.map(id=>ref('roads',id));
      const selectedAnchors=[];
      for(const n of [...source.city.nodes].sort((a,b)=>riCompare(a.id,b.id))){
        budget.spend();
        const fixed=anchors.get(n.id),next=requested.get(n.id);
        if(fixed&&next)selectedAnchors.push(ref('nodes',n.id));
        result.junctions.push({ref:ref('nodes',n.id),old:{x:n.x,y:n.y},
          point:next?{x:next.x,y:next.y}:{x:n.x,y:n.y},
          role:fixed?'protected-anchor':next?'exact-requested':'stationary',
          reasons:fixed?[...fixed].sort(riCompare):[]});
      }
      if(selectedAnchors.length)result.diagnostics.push(diagnostic(context,'protected-content','rtre-protected-anchor',
        'Selected movement touches fixed infrastructure anchors.',selectedAnchors));
      else if(!proposal.changed)result.diagnostics.push(diagnostic(context,'domain-violation','rtre-unchanged',
        'The exact requested offset produces no coordinate change.',op.editedRefs));
      else{
        result.status='observed';
        const boundary=source.city.survey?.boundary;
        if(!Array.isArray(boundary)||boundary.length<3)throw Error('Missing RTRE city outline.');
        const outside=[];
        for(const n of proposal.proposedNodes){
          budget.spend(boundary.length);
          if(!insideOrOn(n,boundary))outside.push(ref('nodes',n.id));
        }
        if(outside.length)result.diagnostics.push(diagnostic(context,'domain-violation','boundary-escape',
          'Requested junction leaves the accepted city outline.',outside));
        // Reuse the graph oracle on only the exact translated coordinates;
        // all road identities, endpoints, metadata and nonselected nodes stay.
        const city={...source.city,nodes:source.city.nodes.map(n=>{
          budget.spend();const next=requested.get(n.id);
          return next?{...n,x:next.x,y:next.y}:n;
        })};
        const translated=graphFor(city,budget);
        result.candidateGraphValid=translated.valid;
        result.diagnostics.push(...translated.issues.map(i=>adaptAresGraphIssue(context,i)));
      }
    }
  }
  // A valid graph is NOT a valid city. Faces, road width, water, terrain,
  // defense, ownership, scoped repair and independent verification follow.
  // Capture immutable source-bound evidence, not a proposed write scope.
  aresReplayJson(result,budget);
  const snapshotFingerprint=await fingerprint(persisted,budget);
  return riFreeze({...result,snapshotFingerprint});
}
