import { materializeAresP3Case } from './ares-p3-fixtures.mjs';
// Observations only, outside measured search. No inferred candidate.
export function reportRtreGeometryProbe(result,elapsedMs){
  const f=materializeAresP3Case(result.caseId),w=result.adjustedWitness,
    nodes=new Map(f.project.city.nodes.map(n=>[n.id,n])),selected=new Set(f.context.operation.editedRefs.map(r=>r.id)),
    selectedNodes=new Set(f.project.city.roads.filter(r=>selected.has(r.id)).flatMap(r=>[r.a,r.b])),
    updates=new Map((w?.updates??[]).map(r=>[r.id,r.point])),
    edges=w?f.project.city.roads.filter(r=>updates.has(r.a)||updates.has(r.b)):[],
    visible=new Set(edges.flatMap(r=>[r.a,r.b]));
  const geometry=w?{nodes:[...visible].sort().map(id=>({id,role:selectedNodes.has(id)?'selected':updates.has(id)?'adjusted':'stationary',
    before:{x:nodes.get(id).x,y:nodes.get(id).y},after:updates.get(id)??{x:nodes.get(id).x,y:nodes.get(id).y}})),
    roads:edges.map(r=>({id:r.id,a:r.a,b:r.b,kind:r.kind,selected:selected.has(r.id)}))}:null;
  console.log('ARES_P4_GEOMETRY '+JSON.stringify({...result,elapsedMs,geometry}));
}
