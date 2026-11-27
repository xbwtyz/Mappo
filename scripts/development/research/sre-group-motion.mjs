// Owner-requested exploratory movement corpus. Isolated research only:
// no production workflow, schema, search budget, geometry or approval changes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createProject} from '../../../src/core/city-model.js';
import {buildRoadGraph} from '../../../src/core/road-graph.js';
import {resolveRoadGroupB1} from '../../../src/core/road-group-b1.js';
import {prepareRoadGroupIntentB1,readRoadGroupTopologyB1} from '../../../src/core/road-intent-c1.js';
import {normalizeSpatialRoadGroup} from '../../../src/core/spatial-recovery-road-adapter.js';
import {createSpatialDestructionBudget} from '../../../src/core/spatial-recovery-contract.js';
import {createSpatialHighQualityBudget} from '../../../src/core/spatial-recovery-quality.js';
import {searchSpatialUnifiedRoadGroup,verifySpatialUnifiedRoadWitness} from '../../../src/core/spatial-recovery-coordinator.js';
import {validateStoredProject} from '../../../src/data/project-validation.js';

const target='f04a447ecd4ae6b1f8d12a28ac68adb3573d265f';
const fixtures=[
 {id:'planned',seed:'sre-owner-motion-planned-01',size:'medium',morphology:'planned',irregularProperties:false},
 {id:'organic',seed:'sre-owner-motion-organic-01',size:'large',morphology:'organic',irregularProperties:true},
 {id:'linear',seed:'sre-owner-motion-linear-01',size:'medium',morphology:'linear',irregularProperties:false},
 {id:'radial',seed:'sre-owner-motion-radial-01',size:'medium',morphology:'radial',irregularProperties:true}
];
const permissions={alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2,destruction:true,regeneration:false};
const offsets=[];
for(const d of [1,10,25,50,75,100])for(const [x,y] of [[d,0],[-d,0],[0,d],[0,-d]])offsets.push({x,y});
for(const d of [25,100])for(const x of [-d,d])for(const y of [-d,d])offsets.push({x,y});
offsets.push({x:100,y:25},{x:-25,y:100},{x:25,y:-100},{x:-100,y:-25});
const groupTypes=['quadrilateral','five-chain','five-branch','pentagon','quad-with-tail','three-junction','eight-chain','two-control'];
const quotas={'quadrilateral':2,'five-chain':2,'five-branch':1,'pentagon':1,'quad-with-tail':1,'three-junction':1,'eight-chain':1,'two-control':1};
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const key=ids=>[...ids].sort().join('|');
const magnitude=o=>Math.max(Math.abs(o.x),Math.abs(o.y));
const compare=(a,b)=>a<b?-1:a>b?1:0;
const counts=(rows,k)=>Object.fromEntries([...new Set(rows.map(r=>r[k]))].sort().map(v=>[v,rows.filter(r=>r[k]===v).length]));
const output='artifacts/sre-group-motion';
function topologyGroupShape(graph,ids){
  const degree=new Map();
  for(const id of ids){
    const r=graph.roadsById.get(id);
    for(const v of [r.a,r.b])degree.set(v,(degree.get(v)??0)+1);
  }
  return {nodes:degree.size,branches:[...degree.values()].filter(d=>d>2).length,
    ends:[...degree.values()].filter(d=>d===1).length,cycleRank:ids.length-degree.size+1};
}
function chooseGroups(project,graph){
  const candidates=Object.fromEntries(groupTypes.map(k=>[k,new Map()]));
  const centers=new Map();
  const allNodes=[...graph.nodesById.values()];
  const center={x:allNodes.reduce((s,p)=>s+p.x,0)/allNodes.length,y:allNodes.reduce((s,p)=>s+p.y,0)/allNodes.length};
  const eligibleCache=new Map();
  function add(type,ids){
    ids=[...new Set(ids)].sort();
    const k=key(ids),targetMap=candidates[type];
    if(targetMap.has(k))return;
    let g=eligibleCache.get(k);
    if(!g){g=resolveRoadGroupB1(graph,ids);eligibleCache.set(k,g);}
    if(!g.eligible)return;
    const shape=topologyGroupShape(graph,ids);
    if(type==='quadrilateral'&&!(ids.length===4&&shape.nodes===4&&shape.ends===0&&shape.cycleRank===1))return;
    if(type==='pentagon'&&!(ids.length===5&&shape.nodes===5&&shape.ends===0&&shape.cycleRank===1))return;
    if(type==='quad-with-tail'&&!(ids.length===5&&shape.nodes===5&&shape.ends===1&&shape.cycleRank===1))return;
    if(type==='five-chain'&&!(ids.length===5&&shape.nodes===6&&shape.branches===0&&shape.ends===2))return;
    if(type==='five-branch'&&!(ids.length===5&&shape.nodes===6&&shape.branches>0&&shape.cycleRank===0))return;
    if(type==='three-junction'&&!(ids.length===3&&shape.branches>0))return;
    if(type==='eight-chain'&&!(ids.length===8&&shape.nodes===9&&shape.branches===0))return;
    const points=g.movedJunctionIds.map(id=>graph.nodesById.get(id));
    const cx=points.reduce((s,p)=>s+p.x,0)/points.length,cy=points.reduce((s,p)=>s+p.y,0)/points.length;
    const distance=(cx-center.x)**2+(cy-center.y)**2;
    targetMap.set(k,{type,roadIds:ids,shape,attachments:g.attachmentRoadIds.length,distance,
      movedJunctionIds:g.movedJunctionIds,stationaryJunctionIds:g.stationaryJunctionIds});
  }
  const edges=new Map([...graph.roadsById.values()].map(r=>[[r.a,r.b].sort().join('|'),r.id]));
  for(const block of project.city.blocks){
    const v=block.vertices;
    if(!Array.isArray(v)||![4,5].includes(v.length)||new Set(v).size!==v.length)continue;
    const ids=v.map((n,i)=>edges.get([n,v[(i+1)%v.length]].sort().join('|')));
    if(ids.some(id=>!id))continue;
    add(v.length===4?'quadrilateral':'pentagon',ids);
    if(v.length===4){
      for(const n of v)for(const id of graph.incidentRoads.get(n)){
        if(ids.includes(id))continue;
        const r=graph.roadsById.get(id),other=r.a===n?r.b:r.a;
        if(!v.includes(other))add('quad-with-tail',[...ids,id]);
      }
    }
  }
  const orderedNodes=allNodes.slice().sort((a,b)=>
    ((a.x-center.x)**2+(a.y-center.y)**2)-((b.x-center.x)**2+(b.y-center.y)**2)||compare(a.id,b.id));
  const eligibleRoad=id=>!graph.roadClasses.get(id)?.protected&&!graph.terminalRoadIds.includes(id);
  for(const n of orderedNodes){
    const ids=graph.incidentRoads.get(n.id).filter(eligibleRoad).sort();
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)for(let k=j+1;k<ids.length;k++)
      add('three-junction',[ids[i],ids[j],ids[k]]);
  }
  // Fixed expansion cap; no search outcome or offset influences selection.
  let expansions=0;
  function walk(node,ids,seen){
    if(++expansions>16000)return;
    if(ids.length===2)add('two-control',ids);
    if(ids.length===4){
      for(const n of seen)for(const edge of graph.incidentRoads.get(n)){
        if(ids.includes(edge)||!eligibleRoad(edge))continue;
        const r=graph.roadsById.get(edge),other=r.a===n?r.b:r.a;
        if(!seen.has(other))add('five-branch',[...ids,edge]);
      }
    }
    if(ids.length===5)add('five-chain',ids);
    if(ids.length===8){add('eight-chain',ids);return;}
    for(const edge of graph.incidentRoads.get(node).slice().sort()){
      if(expansions>=16000)break;
      if(!eligibleRoad(edge))continue;
      const r=graph.roadsById.get(edge),next=r.a===node?r.b:r.a;
      if(!seen.has(next))walk(next,[...ids,edge],new Set([...seen,next]));
    }
  }
  for(const n of orderedNodes){if(expansions>=16000)break;walk(n.id,[],new Set([n.id]));}
  const groups=[],inventory={};
  for(const type of groupTypes){
    const all=[...candidates[type].values()].sort((a,b)=>a.distance-b.distance||compare(key(a.roadIds),key(b.roadIds)));
    inventory[type]={discovered:all.length,requested:quotas[type],selected:Math.min(all.length,quotas[type])};
    for(const [i,g] of all.slice(0,quotas[type]).entries())groups.push({...g,id:type+'-'+i});
  }
  return {groups,inventory,enumerationExpansions:expansions};
}
function preflight(project,group,offset){
  const draft=prepareRoadGroupIntentB1(project,group.roadIds,offset);
  const identity=readRoadGroupTopologyB1(project,draft)?.identity;
  const issues=(draft.issues??[]).filter(i=>i.code!=='neighborhood-reflow-pending');
  let status='eligible';
  if(!draft.draftable||!draft.group?.eligible)status='selection-blocked';
  else if(issues.some(i=>i.code==='topology-analysis-unavailable'))status='analysis-error';
  else if(issues.some(i=>i.code==='boundary-escape'))status='boundary-blocked';
  else if(!draft.topologyResolved)status='graph-blocked';
  else if(!draft.facesResolved||!identity?.valid||identity.requiresReview||
    identity.issues.length||identity.added.length||identity.removed.length||identity.split.length||
    identity.merged.length||identity.ambiguous.length)status='face-blocked';
  assert.notEqual(draft.status,'unchanged');
  assert.equal(draft.applyReady,false);
  return {id:group.id+'/'+offset.x+','+offset.y,groupId:group.id,type:group.type,roadIds:group.roadIds,offset,
    status,issues,changedRoads:draft.changedRoadIds?.length??0,affectedBlocks:identity?.changed?.filter(r=>r.kind==='block').length??null};
}
// At most five distinct full-solver cases per fixture. Fix the strata and
// tie-breaking before evaluating any solver result. Include the largest
// topology-compatible displacements, without excluding blocked 100-unit
// attempts from the preflight denominator.
function sampleSolverCases(rows,fixtureIndex){
  const ok=rows.filter(r=>r.status==='eligible'),selected=[],used=new Set(),strata=[];
  const ordered=(rs,largest)=>rs.slice().sort((a,b)=>(largest?-1:1)*(magnitude(a.offset)-magnitude(b.offset))||
    compare(a.id,b.id));
  const pick=(name,filter,largest=true)=>{
    const row=ordered(ok.filter(r=>filter(r)&&!used.has(r.id)),largest)[0];
    strata.push({name,id:row?.id??null});
    if(row){selected.push(row);used.add(row.id);}
  };
  pick('quad-largest',r=>r.type==='quadrilateral');
  pick('five-chain-largest',r=>r.type==='five-chain');
  pick('five-complex-largest',r=>['five-branch','pentagon','quad-with-tail'].includes(r.type));
  pick('largest-other',r=>['three-junction','eight-chain','two-control'].includes(r.type));
  pick('small-control',r=>r.type===(fixtureIndex%2?'five-chain':'quadrilateral')&&magnitude(r.offset)<=10,false);
  return {selected,strata};
}
async function solve(project,baseline,row,quality){
  const op=normalizeSpatialRoadGroup(project,0,row.roadIds,row.offset,permissions);
  const budget=quality==='high'?createSpatialHighQualityBudget():createSpatialDestructionBudget();
  const t=performance.now();
  const result=await searchSpatialUnifiedRoadGroup(project,op,budget,{quality});
  assert.deepEqual(result.stats,budget.snapshot());
  const limit=quality==='high'?256000000:32000000;
  assert.equal(result.stats.work+result.stats.remainingWork,limit);
  assert.equal(result.stats.expansions+result.stats.remainingExpansions,131072);
  assert.equal(digest(project),baseline,'Accepted source changed during search');
  const common={id:row.id,quality,operation:op,inputFingerprint:baseline,stats:result.stats,
    exhausted:result.exhausted??null,attempts:result.attempts,elapsedMs:Math.round(performance.now()-t)};
  if(result.status==='refused'){
    assert.equal(result.delta,null);assert.equal(result.basisDelta,null);
    return {...common,status:'refused',kind:null,candidateFingerprint:null};
  }
  assert.equal(result.status,'verified-witness');
  const candidate=await verifySpatialUnifiedRoadWitness(project,op,result,createSpatialDestructionBudget());
  validateStoredProject(candidate);
  assert.equal(digest(candidate),result.delta.candidateFingerprint);
  assert.deepEqual(candidate.identityAllocation,project.identityAllocation);
  assert.deepEqual(result.delta.added,[]);
  assert.deepEqual(candidate.city.roads.map(r=>r.id),project.city.roads.map(r=>r.id));
  const graph=buildRoadGraph(project.city),group=resolveRoadGroupB1(graph,row.roadIds),moved=new Set(group.movedJunctionIds);
  const nodes=new Map(candidate.city.nodes.map(r=>[r.id,r]));
  assert.equal(nodes.size,project.city.nodes.length);
  for(const n of project.city.nodes){
    const next=nodes.get(n.id);assert.ok(next);
    assert.equal(next.x,moved.has(n.id)&&row.offset.x!==0?n.x+row.offset.x:n.x);
    assert.equal(next.y,moved.has(n.id)&&row.offset.y!==0?n.y+row.offset.y:n.y);
  }
  const retirements={};
  for(const k of ['properties','plots','buildings']){
    const ids=new Set(candidate.city[k].map(r=>r.id));
    const expected=project.city[k].filter(r=>!ids.has(r.id)).map(r=>r.id).sort();
    assert.deepEqual(expected,result.delta.retired.filter(r=>r.collection===k).map(r=>r.id).sort());
    assert.deepEqual(candidate.city[k].map(r=>r.id),project.city[k].filter(r=>ids.has(r.id)).map(r=>r.id));
    retirements[k]=expected.length;
  }
  assert.equal(digest(project),baseline);
  return {...common,status:'verified',kind:result.kind,candidateFingerprint:digest(candidate),retirements,
    retired:result.delta.retired,demolishedFootprint:result.ledger?.demolishedFootprint??0,
    scaleLoss:result.ledger?.concessions?.footprintLoss??0,independentReplay:true};
}
async function shard(index){
  assert.ok(Number.isInteger(index)&&index>=0&&index<fixtures.length);
  const fixture=fixtures[index],project=createProject(Object.fromEntries(Object.entries(fixture).filter(([k])=>k!=='id')));
  validateStoredProject(project);
  const baseline=digest(project),graph=buildRoadGraph(project.city);
  assert.ok(graph.valid);
  const {groups,inventory,enumerationExpansions}=chooseGroups(project,graph);
  const rows=groups.flatMap(g=>offsets.map(o=>preflight(project,g,o)));
  assert.equal(rows.length,groups.length*offsets.length);
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  assert.equal(digest(project),baseline);
  const {selected,strata}=sampleSolverCases(rows,index);
  const report={version:1,target,source:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,
    fixture,index,baseline,inventory,enumerationExpansions,groups,offsets,rows,strata,selected:selected.map(r=>r.id),solves:[],errors:[]};
  await mkdir(output,{recursive:true});
  const persist=()=>writeFile(output+'/shard-'+index+'.json',JSON.stringify(report,null,2)+'\n');
  await persist();
  console.log('SRE_GROUP_PREFLIGHT '+JSON.stringify({fixture:fixture.id,inventory,preflight:counts(rows,'status'),
    hundred:counts(rows.filter(r=>magnitude(r.offset)===100),'status'),selected:strata}));
  for(const row of selected)for(const quality of ['standard','high']){
    try{
      const result=await solve(project,baseline,row,quality);report.solves.push(result);
      console.log('SRE_GROUP_SOLVE '+JSON.stringify({fixture:fixture.id,type:row.type,offset:row.offset,
        quality,status:result.status,kind:result.kind,retirements:result.retirements,
        stats:result.stats,exhausted:result.exhausted,elapsedMs:result.elapsedMs,
        phases:result.attempts.map(a=>({phase:a.phase,status:a.status,work:a.work,exhausted:a.exhausted}))}));
    }catch(e){report.errors.push({id:row.id,quality,error:e.stack??String(e)});console.error('SRE_GROUP_ERROR '+fixture.id+' '+row.id+' '+quality+' '+e.stack);}
    await persist();
  }
  if(report.errors.length||rows.some(r=>r.status==='analysis-error'))process.exitCode=1;
}
async function aggregate(directory){
  const files=(await readdir(directory,{recursive:true})).filter(p=>/^shard-[0-3]\.json$/.test(p.split('/').at(-1)));
  assert.equal(files.length,fixtures.length,'Missing or duplicate shard report');
  const reports=await Promise.all(files.map(async f=>JSON.parse(await readFile(directory+'/'+f,'utf8'))));
  assert.deepEqual(reports.map(r=>r.index).sort((a,b)=>a-b),[0,1,2,3]);
  for(const r of reports){
    assert.equal(r.target,target);assert.equal(r.source,process.env.GITHUB_SHA);
    assert.equal(r.run,process.env.GITHUB_RUN_ID);assert.equal(r.attempt,process.env.GITHUB_RUN_ATTEMPT);
    assert.deepEqual(r.fixture,fixtures[r.index]);assert.deepEqual(r.offsets,offsets);
    assert.equal(r.rows.length,r.groups.length*offsets.length);
    assert.equal(new Set(r.rows.map(x=>x.id)).size,r.rows.length);
    for(const g of r.groups)for(const o of offsets)assert.ok(r.rows.some(x=>x.groupId===g.id&&x.offset.x===o.x&&x.offset.y===o.y));
    const selected=sampleSolverCases(r.rows,r.index);
    assert.deepEqual(r.selected,selected.selected.map(x=>x.id));assert.deepEqual(r.strata,selected.strata);
    assert.equal(r.errors.length,0);assert.ok(!r.rows.some(x=>x.status==='analysis-error'));
    assert.equal(r.solves.length,r.selected.length*2);
    for(const id of r.selected)for(const quality of ['standard','high']){
      const matches=r.solves.filter(s=>s.id===id&&s.quality===quality);assert.equal(matches.length,1);
      const s=matches[0];assert.equal(s.inputFingerprint,r.baseline);assert.ok(['verified','refused'].includes(s.status));
      if(s.status==='verified')assert.equal(s.independentReplay,true);else assert.equal(s.candidateFingerprint,null);
    }
  }
  const rows=reports.flatMap(r=>r.rows.map(x=>({...x,fixture:r.fixture.id})));
  const solves=reports.flatMap(r=>r.solves.map(s=>({...s,fixture:r.fixture.id,type:r.rows.find(x=>x.id===s.id).type})));
  const summary={target,source:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,
    preflight:counts(rows,'status'),hundred:counts(rows.filter(x=>magnitude(x.offset)===100),'status'),
    types:groupTypes.map(type=>({type,preflight:counts(rows.filter(x=>x.type===type),'status'),
      hundred:counts(rows.filter(x=>x.type===type&&magnitude(x.offset)===100),'status'),
      standard:counts(solves.filter(x=>x.type===type&&x.quality==='standard'),'status'),
      high:counts(solves.filter(x=>x.type===type&&x.quality==='high'),'status')})),
    standard:counts(solves.filter(x=>x.quality==='standard'),'status'),high:counts(solves.filter(x=>x.quality==='high'),'status'),
    largestSolved:solves.filter(x=>x.status==='verified').reduce((m,x)=>Math.max(m,magnitude(x.operation.geometry.offset)),0),
    coverageGaps:reports.flatMap(r=>r.strata.filter(s=>!s.id).map(s=>({fixture:r.fixture.id,stratum:s.name})))};
  await mkdir(output,{recursive:true});await writeFile(output+'/report.json',JSON.stringify({summary,reports},null,2)+'\n');
  console.log('SRE_GROUP_CORPUS '+JSON.stringify(summary));
}
if(process.argv[2]==='aggregate')await aggregate(process.argv[3]);else await shard(Number(process.argv[2]));
