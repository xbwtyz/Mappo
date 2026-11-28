import {createHash} from 'node:crypto';
import {generateLayout} from '../../../src/generators/layout.js';
import {generateSquarelessLayout} from './squareless-layout.mjs';
import {validateLayout} from '../../../src/core/validate-layout.js';
import {validateSquarelessLayout} from './squareless-layout-validation.mjs';
import {buildRoadGraph} from '../../../src/core/road-graph.js';
import {resolveRoadGroupB1,proposeRoadGroupNodesB1} from '../../../src/core/road-group-b1.js';
import {insideOrOn} from '../../../src/core/boundary.js';
import {riCompare,riFreeze} from '../../../src/core/road-impact-model.js';
import {materializeSquarePilotLayouts} from './square-trial-pilot.mjs';
import {G_MANIFEST} from './ares-p4-g-corpus.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const mean=ps=>({x:ps.reduce((s,p)=>s+p.x,0)/ps.length,y:ps.reduce((s,p)=>s+p.y,0)/ps.length});
// Outcome-blind selection: nearest safe junction, then deterministic nearest
// neighbor depth-first simple chain. Never run a movement while choosing.
export function selectSquareTrialChain(g,target,count){
 const terminal=new Set(g.terminalRoadIds),safe=new Set([...g.nodesById.keys()].filter(id=>g.incidentRoads.get(id).every(r=>!g.roadClasses.get(r).protected&&!terminal.has(r))));
 const cmp=(a,b)=>dist(g.nodesById.get(a),target)-dist(g.nodesById.get(b),target)||riCompare(a,b);
 const starts=[...safe].sort(cmp),cap=G_MANIFEST.selection.maxVisitsPerGroup;let visits=0,found=null,limited=false;
 function walk(id,ids,roads){
  if(visits>=cap){limited=true;return;}visits++;
  if(roads.length===count){if(resolveRoadGroupB1(g,roads).eligible)found={ids,roads};return;}
  const next=g.incidentRoads.get(id).map(r=>{const e=g.roadsById.get(r);return {r,id:e.a===id?e.b:e.a};}).filter(x=>safe.has(x.id)&&!ids.includes(x.id)).sort((a,b)=>cmp(a.id,b.id)||riCompare(a.r,b.r));
  for(const x of next){if(found||limited)return;walk(x.id,[...ids,x.id],[...roads,x.r]);}
 }
 for(const id of starts){if(found||limited)break;walk(id,[id],[]);}
 if(!found)return {status:limited?'selection-limit':'selection-unavailable',visits};
 const centroid=mean(found.ids.map(id=>g.nodesById.get(id))),length=found.roads.reduce((s,id)=>{const r=g.roadsById.get(id);return s+dist(g.nodesById.get(r.a),g.nodesById.get(r.b));},0);
 return {status:'selected',visits,ids:found.roads.slice().sort(riCompare),centroid,distance:dist(centroid,target),length,anchor:found.ids[0]};
}
function order(g,id){
 const p=g.nodesById.get(id);
 return g.incidentRoads.get(id).map(r=>{const e=g.roadsById.get(r),q=g.nodesById.get(e.a===id?e.b:e.a);return {r,angle:Math.atan2(q.y-p.y,q.x-p.x)};}).sort((a,b)=>a.angle-b.angle||riCompare(a.r,b.r)).map(x=>x.r);
}
const same=(a,b)=>a.length===b.length&&(!a.length||b.includes(a[0])&&a.every((v,i)=>v===b[(b.indexOf(a[0])+i)%b.length]));
function direct(l,g,selection,offset,boundary){
 if(selection.status!=='selected')return {status:'not-selected'};
 const intent=proposeRoadGroupNodesB1(g,selection.ids,offset);
 if(!intent.draftable)return {status:'intent-refused',issues:intent.issues.map(x=>x.code)};
 // Raw selected-endpoint reconstruction, independent of B1 intent output.
 const moved=new Set(l.roads.filter(r=>selection.ids.includes(r.id)).flatMap(r=>[r.a,r.b]));
 const nodes=l.nodes.map(n=>moved.has(n.id)?{...n,x:n.x+offset.x,y:n.y+offset.y}:n);
 const expected=new Map(nodes.filter(n=>moved.has(n.id)).map(n=>[n.id,n]));
 if(intent.proposedNodes.length!==expected.size||intent.proposedNodes.some(n=>!expected.has(n.id)||n.x!==expected.get(n.id).x||n.y!==expected.get(n.id).y))throw Error('Independent intent mismatch');
 const protectedMoved=l.roads.filter(r=>g.roadClasses.get(r.id).protected&&(moved.has(r.a)||moved.has(r.b)));
 if(protectedMoved.length)throw Error('Protected junction moved');
 if(nodes.some(n=>moved.has(n.id)&&!insideOrOn(n,boundary)))return {status:'boundary-refused',moved:moved.size};
 const after=buildRoadGraph({nodes,roads:l.roads});
 if(!after.valid)return {status:'graph-refused',moved:moved.size,issues:[...new Set(after.issues.map(x=>x.code))],graphWork:after.work};
 const changed=[...g.nodesById.keys()].filter(id=>!same(order(g,id),order(after,id)));
 return {status:changed.length?'cyclic-refused':'direct-road-valid',moved:moved.size,changed,graphWork:after.work};
}
export function runSquareMovementPilot(id){
 const {recipe,survey}=materializeSquarePilotLayouts(id),{seed,size,morphology}=recipe;
 const control=generateLayout(seed,size,structuredClone(survey),morphology),experimental=generateSquarelessLayout(seed,size,structuredClone(survey),morphology);
 validateLayout(control,survey.boundary);validateSquarelessLayout(experimental,survey.boundary);
 const before=hash([control,experimental,survey]),cg=buildRoadGraph(control),eg=buildRoadGraph(experimental);
 if(!cg.valid||!eg.valid)throw Error('Unqualified pilot source');
 const center=survey.anchors[0],scale=survey.nominalRadius;
 const scenarios=[{id:'central',target:{x:center.x,y:center.y},count:4,offset:{x:35,y:25}},{id:'middle',target:{x:center.x+scale*.38,y:center.y},count:5,offset:{x:-100,y:60}}];
 const rows=scenarios.map(x=>{
  const c=selectSquareTrialChain(cg,x.target,x.count),e=selectSquareTrialChain(eg,x.target,x.count);
  const matched=c.status==='selected'&&e.status==='selected'&&dist(c.centroid,e.centroid)<=scale*.25&&c.distance<=scale*.55&&e.distance<=scale*.55&&Math.max(c.length,e.length)<=2*Math.min(c.length,e.length);
  return {...x,matched,centroidSeparation:c.centroid&&e.centroid?dist(c.centroid,e.centroid):null,
   control:{selection:c,result:direct(control,cg,c,x.offset,survey.boundary)},experimental:{selection:e,result:direct(experimental,eg,e,x.offset,survey.boundary)}};
 });
 if(hash([control,experimental,survey])!==before)throw Error('Movement pilot mutated source');
 return riFreeze({id,authority:'none',qualification:'direct-road-graph-and-cyclic-only',rows});
}
