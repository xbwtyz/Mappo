// B1: pure, transient connected selection and coordinate intent.
// Graph/face validation, neighborhood reconciliation and Apply remain separate gates.
function b1SortedUnique(ids) {
  return [...new Set(ids)].sort();
}

function b1Issue(code, message, roadIds = [], nodeIds = []) {
  return Object.freeze({code, message, roadIds:Object.freeze(b1SortedUnique(roadIds)),
    nodeIds:Object.freeze(b1SortedUnique(nodeIds))});
}

export function resolveRoadGroupB1(graph, ids) {
  const issues = [];
  const result = (selected=[], nodes=[], affected=[], stationary=[], components=[]) =>
    Object.freeze({eligible:issues.length===0, selectedRoadIds:Object.freeze(selected),
      movedJunctionIds:Object.freeze(nodes), affectedRoadIds:Object.freeze(affected),
      attachmentRoadIds:Object.freeze(affected.filter(id=>!selectedSet.has(id))),
      stationaryJunctionIds:Object.freeze(stationary), components:Object.freeze(components.map(c=>Object.freeze(c))),
      issues:Object.freeze(issues)});
  const selectedSet=new Set();
  if (!graph?.valid) {
    issues.push(b1Issue('invalid-base-road-graph','A valid accepted road graph is required.'));
    return result();
  }
  if (!Array.isArray(ids) || ids.length>graph.roadsById.size ||
      ids.some(id=>typeof id!=='string'||!id)) {
    issues.push(b1Issue('invalid-group-selection','Choose existing road segment IDs.'));
    return result();
  }
  const selected=b1SortedUnique(ids);
  for(const id of selected)selectedSet.add(id);
  const missing=selected.filter(id=>!graph.roadsById.has(id));
  if(missing.length) {
    issues.push(b1Issue('road-not-found','Some selected road segments no longer exist.',missing));
    return result(selected);
  }
  if(selected.length<2) {
    issues.push(b1Issue('group-too-small','Select at least two distinct road segments.',selected));
    return result(selected);
  }
  const moved=new Set(), affected=new Set(), reachedNodes=new Set(), components=[];
  // Walk each junction once, considering only the selected edges for connectivity.
  for(const id of selected) {
    const road=graph.roadsById.get(id);
    moved.add(road.a);moved.add(road.b);
  }
  for(const start of [...moved].sort()) {
    if(reachedNodes.has(start))continue;
    const queue=[start], edges=new Set();
    reachedNodes.add(start);
    for(let i=0;i<queue.length;i++){
      const node=queue[i];
      for(const id of graph.incidentRoads.get(node)){
        affected.add(id);
        if(!selectedSet.has(id))continue;
        edges.add(id);
        const road=graph.roadsById.get(id);
        const next=road.a===node?road.b:road.a;
        if(!reachedNodes.has(next)){reachedNodes.add(next);queue.push(next);}
      }
    }
    components.push([...edges].sort());
  }
  components.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  if(components.length!==1)issues.push(b1Issue('disconnected-road-group',
    'Select road segments connected through shared selected junctions.',selected));
  const stationary=new Set(), protectedRoads=[], terminalRoads=[];
  const terminals=new Set(graph.terminalRoadIds);
  for(const id of affected){
    const road=graph.roadsById.get(id);
    for(const node of [road.a,road.b])if(!moved.has(node))stationary.add(node);
    if(graph.roadClasses.get(id)?.protected)protectedRoads.push(id);
    if(terminals.has(id))terminalRoads.push(id);
  }
  if(protectedRoads.length)issues.push(b1Issue('protected-connection',
    'The selected group touches protected infrastructure.',protectedRoads));
  if(terminalRoads.length)issues.push(b1Issue('terminal-edit-out-of-scope',
    'The selected group affects an existing terminal road corridor.',terminalRoads));
  return result(selected,[...moved].sort(),[...affected].sort(),[...stationary].sort(),components);
}

export function proposeRoadGroupNodesB1(graph, ids, offset) {
  const group=resolveRoadGroupB1(graph,ids);
  const fail=issue=>Object.freeze({group,draftable:false,applyReady:false,
    proposedNodes:Object.freeze([]),issues:Object.freeze(issue?[issue]:group.issues)});
  if(!group.eligible)return fail();
  const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&
    Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000;
  if(!finite(offset))return fail(b1Issue('invalid-offset','Enter finite X/Y offsets within supported bounds.'));
  const proposed=group.movedJunctionIds.map(id=>{
    const node=graph.nodesById.get(id);
    return Object.freeze({id,x:offset.x===0?node.x:node.x+offset.x,
      y:offset.y===0?node.y:node.y+offset.y});
  });
  const invalid=proposed.filter(p=>!finite(p)).map(p=>p.id);
  if(invalid.length)return fail(b1Issue('coordinate-limit','The proposed junctions exceed supported world bounds.',[],invalid));
  const changed=proposed.some(p=>{const n=graph.nodesById.get(p.id);return p.x!==n.x||p.y!==n.y;});
  return Object.freeze({group,draftable:true,applyReady:false,changed,
    offset:Object.freeze({x:offset.x,y:offset.y}),proposedNodes:Object.freeze(proposed),issues:Object.freeze([])});
}
