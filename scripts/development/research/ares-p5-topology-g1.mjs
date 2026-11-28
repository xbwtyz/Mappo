import {createHash} from 'node:crypto';
import {materializeLockedRtreCase,lockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {radialRecipe} from './ares-p4x-radial-scope.mjs';
import {residualSeeds} from './ares-p4x-residual.mjs';
import {P5_LIMITS,classifyP5Contact} from './ares-p5-topology-contract.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {iterateRoadGraph,classifyRoad} from '../../../src/core/road-graph.js';
import {segmentCuts,insideOrOn,lerpPoint} from '../../../src/core/boundary.js';
import {createAresLandscapeSegmentObserver} from '../../../src/core/ares-landscape-observation.js';
import {createAresDefenseSegmentObserver} from '../../../src/core/ares-defense-observation.js';
import {createSpatialRef,createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riCompare,riFreeze} from '../../../src/core/road-impact-model.js';

const point=n=>({x:n.x,y:n.y});
const same=(a,c)=>a&&c&&Object.is(a.x,c.x)&&Object.is(a.y,c.y);
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000;
const nodeFields=new Set(['id','x','y']);
const roadFields=new Set('id a b kind boundary plaza bank bridgeId waterBoundary foothill passId terrainBoundary'.split(' '));
const sort=(a,b,cmp=riCompare)=>{b.spend(Math.max(1,a.length*Math.ceil(Math.log2(a.length+1))));return a.sort(cmp);};
const known=(row,fields,b)=>{if(!row)return false;for(const k of Object.keys(row)){b.spend();if(!fields.has(k))return false;}return true;};
const pairCode=c=>c==='unnormalized-crossing'||c==='overlapping-roads';
function graph(city,b){
  b.spend(Math.max(1,city.nodes.length+city.roads.length));
  const it=iterateRoadGraph(city);let charged=0;
  try{for(;;){const s=it.next();if(s.done){if(s.value.work>charged)b.spend(s.value.work-charged);return s.value;}
    if(s.value.stage==='road-graph-intersections'){b.spend(64);charged+=64;}else b.spend();}}
  finally{it.return();}
}
function contained(a,c,outline,b){
  const cuts=[0,1];
  for(let i=0;i<outline.length;i++){b.spend();cuts.push(...segmentCuts(a,c,outline[i],outline[(i+1)%outline.length]));}
  sort(cuts,b,(x,y)=>x-y);
  for(let i=0;i<cuts.length;i++){
    b.spend(outline.length);if(!insideOrOn(lerpPoint(a,c,cuts[i]),outline))return false;
    if(i){b.spend(outline.length);if(!insideOrOn(lerpPoint(a,c,(cuts[i-1]+cuts[i])/2),outline))return false;}
  }
  return true;
}
function pairKeys(rows,b){
  return sort(rows.map(r=>{b.spend(4);return JSON.stringify([r.code,sort([...r.roadIds],b)]);}),b);
}
// G1 is a detached contact-feasibility observation, NOT a constructor,
// independent topology audit, permit, or fallback. Reuse only the twelve
// frozen historical P4X rejected seeds, one shared budget per recipe.
// No supplied coordinates, extra motion, new candidates or search retry.
export async function inspectP5CombinedSeeds(caseId){
  const recipe=radialRecipe(caseId),seeds=residualSeeds(caseId);
  const b=createSpatialPreservationBudget({work:P5_LIMITS.work,stateExpansions:P5_LIMITS.stateExpansions});
  const r={version:1,caseId,source:null,cap:recipe.cap,minimum:recipe.minimum,authority:'none',
    status:'unverified',reason:null,topologyChanged:false,cityRecovery:false,attempts:0,rows:[]};
  const finish=()=>riFreeze({...r,stats:b.snapshot()});
  const need=(v,why)=>{if(!v)throw Error('G1 '+why);};
  try{
    need(seeds.length>=1&&seeds.length<=2,'frozen seed count changed');
    const f=materializeLockedRtreCase(caseId),city=f.project.city,before=aresReplayJson(f.project,b),bytes=Buffer.from(before);
    b.spend(Math.max(1,Math.ceil(bytes.length/64)));r.source=createHash('sha256').update(bytes).digest('hex');
    need(r.source===recipe.source&&r.source===lockedRtreCase(caseId).source,'source mismatch');
    const report=await inspectFreshRtreNeighborhood(caseId,{mode:'adaptive',maxObjects:P5_LIMITS.maxObjects,maxHops:P5_LIMITS.maxHops},b);
    need(report.snapshotFingerprint===r.source&&aresReplayJson(report.context,b)===aresReplayJson(f.context,b),'scope mismatch');
    if(report.status!=='research-eligible'){r.status='scope-refused';r.reason=report.status;return finish();}
    const accepted=graph(city,b);need(accepted.valid,'invalid accepted graph');
    const exact=new Map(),selected=new Set(f.context.operation.editedRefs.map(x=>x.id)),offset=f.context.operation.geometry.offset;
    const fixed=new Set(city.plaza?.vertices??[]),terminal=new Set(accepted.terminalRoadIds);
    for(const road of city.roads){
      b.spend();if(classifyRoad(road).protected||terminal.has(road.id)){fixed.add(road.a);fixed.add(road.b);}
      if(selected.has(road.id))for(const id of [road.a,road.b]){
        b.spend();const n=accepted.nodesById.get(id);
        exact.set(id,{x:offset.x===0?n.x:n.x+offset.x,y:offset.y===0?n.y:n.y+offset.y});
      }
    }
    for(const g of city.gates??[]){b.spend();if(g.connection?.cityNodeId!=null)fixed.add(g.connection.cityNodeId);}
    for(const k of ['waterFaces','terrainFaces'])for(const row of city[k]??[])for(const id of row.vertices??[]){b.spend();fixed.add(id);}
    need(exact.size===report.requested.length&&report.requested.every(x=>same(exact.get(x.ref.id),x.point)),'exact intent mismatch');
    const entries=new Map(report.entries.map(x=>[x.ref.collection+':'+x.ref.id,x]));
    const eligible=new Set(report.eligibleJunctions.map(x=>x.ref.id));
    b.spend(Math.max(1,entries.size+eligible.size+exact.size));
    const inScope=(k,id)=>{const e=entries.get(k+':'+id);return !!e&&e.depth<=P5_LIMITS.maxHops;};
    const nodeWritable=id=>inScope('nodes',id)&&!fixed.has(id)&&entries.get('nodes:'+id)?.role!=='protected-anchor'&&known(accepted.nodesById.get(id),nodeFields,b);
    const ordinary=road=>road&&inScope('roads',road.id)&&!classifyRoad(road).protected&&!terminal.has(road.id)&&known(road,roadFields,b);
    const landscape=createAresLandscapeSegmentObserver(city,b),defense=createAresDefenseSegmentObserver(city,b);
    for(const seed of seeds){
      b.spend();const neighbors=seed.best.neighbors,positions=new Map(exact),seen=new Set();
      need(neighbors.length>=2&&neighbors.length<=recipe.cap&&(!recipe.minimum||neighbors.length===recipe.minimum),'seed neighbor cap');
      for(const n of neighbors){
        b.spend(8);const old=accepted.nodesById.get(n.id);
        need(eligible.has(n.id)&&!exact.has(n.id)&&!seen.has(n.id)&&same(old,n.old)&&finite(n.point)&&!same(old,n.point)&&
          Math.hypot(n.point.x-old.x,n.point.y-old.y)<=Math.hypot(offset.x,offset.y),'seed authority/coordinates');
        seen.add(n.id);positions.set(n.id,n.point);
      }
      const reached=new Set(),queue=[[...seen][0]];
      for(let i=0;i<queue.length;i++){b.spend();const id=queue[i];if(reached.has(id))continue;reached.add(id);
        for(const n of accepted.adjacency.get(id)){b.spend();if(!reached.has(n)&&positions.has(n))queue.push(n);}}
      need([...seen].every(id=>reached.has(id)),'seed disconnected');
      const row={arm:seed.arm,sourceAttempt:seed.best.attempt,neighbors:neighbors.length,
        status:'held',reasons:[],pairs:[],movedRoadIds:[],finalChecks:0,sweptChecks:0,finalBlockers:[],sweptUnresolved:[]};
      for(const id of positions.keys()){b.spend();if(!nodeWritable(id))row.reasons.push('protected-or-unadmitted-motion:'+id);}
      // A replay counts against the shared candidate/expansion allowance.
      // The original invalid graph is never promoted to a valid P4 witness.
      b.expand();r.attempts++;
      const nodes=city.nodes.map(n=>{b.spend();return positions.has(n.id)?{...n,...point(positions.get(n.id))}:n;});
      const byNode=new Map(nodes.map(n=>[n.id,n]));b.spend(nodes.length);
      const replay=graph({...city,nodes},b);
      const actual=replay.issues.filter(i=>pairCode(i.code));
      b.spend(replay.issues.length);
      row.replayMatches=!replay.valid&&replay.issues.every(i=>pairCode(i.code))&&
        aresReplayJson(pairKeys(actual,b),b)===aresReplayJson(pairKeys(seed.best.pairs,b),b);
      if(!row.replayMatches)row.reasons.push('frozen-conflict-replay-mismatch');
      const affected=new Set(),moved=new Set();
      for(const road of city.roads){
        b.spend();if(!positions.has(road.a)&&!positions.has(road.b))continue;
        moved.add(road.id);affected.add(road.id);
        if(!ordinary(road))row.reasons.push('translated-road-closure:'+road.id);
        for(const id of [road.a,road.b]){b.spend();if(!inScope('nodes',id)||!known(accepted.nodesById.get(id),nodeFields,b))row.reasons.push('translated-endpoint-closure:'+id);}
      }
      row.movedRoadIds=sort([...moved],b);
      for(const item of actual){
        b.spend(16);const ids=sort([...item.roadIds],b),[a,c]=ids.map(id=>accepted.roadsById.get(id));
        need(ids.length===2&&a&&c,'invalid oracle pair');
        const contact=classifyP5Contact(byNode.get(a.a),byNode.get(a.b),byNode.get(c.a),byNode.get(c.b));
        const reasons=[];
        if(contact.kind!=='interior-interior')reasons.push('unsupported-contact:'+contact.kind);
        if(!moved.has(a.id)&&!moved.has(c.id))reasons.push('unmoved-pair');
        for(const road of [a,c]){
          b.spend();affected.add(road.id);
          if(!ordinary(road))reasons.push('split-road-closure:'+road.id);
          for(const id of [road.a,road.b]){
            b.spend();if(!nodeWritable(id)||(!exact.has(id)&&!eligible.has(id)))reasons.push('split-endpoint-closure:'+id);
          }
        }
        if(contact.point){
          for(const n of nodes){b.spend();if(Math.hypot(n.x-contact.point.x,n.y-contact.point.y)<=1e-7){reasons.push('coincident-or-near-contact');break;}}
          for(const p of row.pairs){b.spend();if(p.contact.point&&Math.hypot(p.contact.point.x-contact.point.x,p.contact.point.y-contact.point.y)<=1e-7)reasons.push('coincident-or-near-contact-pair');}
        }
        row.pairs.push({roadIds:ids,contact,reasons});
      }
      // Unlike the rejected P4 geometry evaluation, explicitly inspect
      // all moved and prospective split parents, even when nonplanar.
      for(const id of sort([...affected],b)){
        b.spend();const road=accepted.roadsById.get(id),a=point(accepted.nodesById.get(road.a)),c=point(accepted.nodesById.get(road.b)),p=point(byNode.get(road.a)),q=point(byNode.get(road.b));
        if(!contained(p,q,city.survey.boundary,b))row.reasons.push('boundary-escape:'+id);
        const segment={ref:createSpatialRef({collection:'roads',id}),endpointRefs:[road.a,road.b].map(x=>createSpatialRef({collection:'nodes',id:x})),old:{a,b:c},proposed:{a:p,b:q}};
        for(const phase of moved.has(id)?['final','swept']:['final']){
          b.spend();const items=[...landscape.observe(f.context,r.source,segment,phase,b),defense.observe(f.context,r.source,segment,phase,b).constraint];
          need(items.length===3,'provider coverage');
          for(const item of items){b.spend();if(phase==='final')row.finalChecks++;else row.sweptChecks++;
            if(item.summary!=='observed-satisfied')(phase==='final'?row.finalBlockers:row.sweptUnresolved).push(item);}
        }
      }
      if(row.finalBlockers.length)row.reasons.push('final-constraint-blocked');
      if(row.sweptUnresolved.length)row.reasons.push('swept-unresolved');
      row.reasons=sort([...new Set(row.reasons)],b);
      row.status=row.replayMatches&&row.pairs.length>0&&!row.reasons.length&&row.pairs.every(p=>!p.reasons.length)?'split-research-opportunity':'held';
      aresReplayJson(row,b);r.rows.push(row);
    }
    need(aresReplayJson(f.project,b)===before,'source mutated');
    r.status='observed';aresReplayJson(r,b);
  }catch(e){if(e instanceof LareBudgetExceeded){r.status='work-limit';r.reason=e.resource;}else throw e;}
  return finish();
}
