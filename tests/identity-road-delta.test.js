import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { prepareNeighborhoodReflowC3 } from '../src/core/neighborhood-reflow.js';
import { prepareRoadTopologyReflowC3 } from '../src/core/road-topology-reflow.js';
import { roadIdentityRequests,allocateRoadCandidate,allocateRoadCandidateForHost } from '../src/core/road-identity-delta.js';
import { SecureIdentityHost } from '../src/core/secure-identity-host.js';
import { classifyRoadProvenance } from '../src/core/road-provenance.js';
import { copyJson,defaultWorkspace,createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../src/data/project-format.js';
import { reconcileRoadWorkspace } from '../src/editor/road-workspace.js';

const cases=[
  {name:'neighborhood building regeneration',seed:'c2-planned',morphology:'planned',
    road:'RD-0113',run:p=>prepareNeighborhoodReflowC3(p,'RD-0113',{x:12,y:0}),types:['building']},
  {name:'crossing topology regeneration',seed:'c2-radial',morphology:'radial',
    road:'RD-0103',run:p=>prepareNeighborhoodReflowC3(p,'RD-0103',{x:0,y:15}),types:['building','plot','property']},
  {name:'road removal topology regeneration',seed:'c2-radial',morphology:'radial',
    road:'RD-0099',run:p=>prepareRoadTopologyReflowC3(p,'RD-0099',null,{kind:'remove'}),types:['building','plot','property']}
];
function setup(f,byte=1){
  const base=createProject({seed:f.seed,size:'small',morphology:f.morphology});
  const host=new SecureIdentityHost({cryptoSource:{getRandomValues(a){a.fill(byte);return a;}}});
  host.adopt(base);
  const view=host.view(),fresh=f.run(copyJson(view.project));
  assert.ok(fresh.candidateProject,JSON.stringify(fresh.unresolved));
  const requests=roadIdentityRequests(view.project,fresh),receipt=host.reserve(requests);
  return {host,view,fresh,requests,receipt};
}
function allocated(s){return allocateRoadCandidate(s.view.project,s.fresh,s.view.context,s.receipt);}
function checkReferences(city){
  const props=new Map(city.properties.map(row=>[row.id,row])),plots=new Map(city.plots.map(row=>[row.id,row]));
  const buildings=new Map(city.buildings.map(row=>[row.id,row]));
  for(const p of props.values()){
    for(const id of p.plotIds)assert.equal(plots.get(id).propertyId,p.id);
    for(const id of p.buildingIds)assert.equal(buildings.get(id).propertyId,p.id);
  }
  for(const b of buildings.values())for(const id of b.plotIds)assert.equal(plots.get(id).propertyId,b.propertyId);
}
for(const f of cases){
  test('IDA road delta allocates only surviving additions: '+f.name,()=>{
    const s=setup(f),before=JSON.stringify(s.fresh),a=allocated(s),b=allocated(s);
    assert.deepEqual(a,b);
    const {receipt,...combined}=allocateRoadCandidateForHost(s.host,s.view,s.fresh);
    assert.deepEqual(receipt,s.receipt);
    assert.deepEqual(combined,a);
    assert.deepEqual([...new Set(s.requests.map(x=>x.type))].sort(),f.types);
    assert.equal(JSON.stringify(s.fresh),before);
    assert.equal(s.host.view(),s.view);
    assert.deepEqual(s.host.view().project.identityAllocation.namespaces,{});
    checkReferences(a.candidate.city);
    const collections={building:'buildings',plot:'plots',property:'properties'};
    for(const r of s.receipt.allocations){
      const temporary=r.key.slice(5),key=collections[r.type];
      assert.ok(a.candidate.city[key].some(row=>row.id===r.id));
      assert.ok(!a.candidate.city[key].some(row=>row.id===temporary));
      assert.ok(a.ledger.some(row=>row.kind===r.type&&row.newId===r.id&&row.oldId===null));
    }
    const oldPlots=new Map(s.fresh.candidateProject.city.plots.map(p=>[p.id,p]));
    const newPlots=new Map(a.candidate.city.plots.map(p=>[p.id,p]));
    const remap=new Map(s.receipt.allocations.map(r=>[r.key.slice(5),r.id]));
    // Allocation already uses JSON detachment. Compare the exact persisted
    // representation, including key order and provenance; JSON maps -0 to 0.
    for(const old of s.fresh.candidateProject.city.properties){
      const next=a.candidate.city.properties.find(row=>row.id===(remap.get(old.id)??old.id));
      assert.equal(classifyRoadProvenance(next,next.plotIds.map(id=>newPlots.get(id))),
        classifyRoadProvenance(old,old.plotIds.map(id=>oldPlots.get(id))));
      if(!remap.has(old.id)&&!old.plotIds.some(id=>remap.has(id)||remap.has(oldPlots.get(id)?.propertyId))&&
          !old.buildingIds.some(id=>remap.has(id)))assert.equal(JSON.stringify(next),JSON.stringify(old));
    }
    for(const old of s.fresh.candidateProject.city.buildings){
      const next=a.candidate.city.buildings.find(row=>row.id===(remap.get(old.id)??old.id));
      assert.equal(classifyRoadProvenance(next),classifyRoadProvenance(old));
      if(!remap.has(old.id)&&!remap.has(old.propertyId)&&!old.plotIds.some(id=>remap.has(id)))
        assert.equal(JSON.stringify(next),JSON.stringify(old));
    }
    for(const r of s.receipt.allocations.filter(row=>row.type==='property')){
      const old=s.fresh.candidateProject.city.properties.find(p=>p.id===r.key.slice(5));
      const next=a.candidate.city.properties.find(p=>p.id===r.id);
      assert.equal(classifyRoadProvenance(next,next.plotIds.map(id=>newPlots.get(id))),
        classifyRoadProvenance(old,old.plotIds.map(id=>oldPlots.get(id))));
    }
    for(const r of s.receipt.allocations.filter(row=>row.type==='building')){
      const old=s.fresh.candidateProject.city.buildings.find(p=>p.id===r.key.slice(5));
      const next=a.candidate.city.buildings.find(p=>p.id===r.id);
      assert.equal(classifyRoadProvenance(next),classifyRoadProvenance(old));
    }
    const w=reconcileRoadWorkspace(defaultWorkspace(s.view.project),s.view.project.city,a.candidate.city);
    const decoded=decodeProjectDocument(encodeProjectDocument(createProjectDocument(a.candidate,w)));
    assert.deepEqual(decoded.project,a.candidate);
    assert.deepEqual(decoded.workspace,w);
  });
}
test('IDA road allocation refuses stale reservation, missing creation ledger and tampered counter',()=>{
  const s=setup(cases[0]);
  assert.throws(()=>allocateRoadCandidate(s.view.project,s.fresh,{...s.view.context,revision:1},s.receipt),/Stale/);
  const missing=copyJson(s.fresh);missing.ledger=missing.ledger.filter(row=>row.oldId!==null);
  assert.throws(()=>roadIdentityRequests(s.view.project,missing),/creation ledger/);
  const forged=copyJson(s.receipt);forged.nextState.namespaces[s.view.context.namespace].building++;
  assert.throws(()=>allocateRoadCandidate(s.view.project,s.fresh,s.view.context,forged),/counter mismatch/);
  assert.equal(s.host.view(),s.view);
});
test('IDA road allocation fails closed for an unhandled live temporary reference',()=>{
  const s=setup(cases[0]),fresh=copyJson(s.fresh);
  fresh.candidateProject.city.buildings.find(b=>b.id===s.requests[0].key.slice(5)).idaTestExtension={target:s.requests[0].key.slice(5)};
  assert.throws(()=>allocateRoadCandidate(s.view.project,fresh,s.view.context,s.receipt),/Unsupported road draft identity reference/);
  assert.equal(s.host.view(),s.view);
});
test('IDA detached road transaction commits only independently rebuilt allocated geometry and never rewinds',()=>{
  const f=cases[0],s=setup(f),a=allocated(s),w=defaultWorkspace(s.view.project);
  const out=s.host.commit({requests:s.requests,receipt:s.receipt,candidateCity:a.candidate.city,
    transaction:{family:'road',operation:'move-road',label:'Move road',targetIds:[f.road]},
    validateDomain:(before,after)=>JSON.stringify(allocateRoadCandidate(before,f.run(copyJson(before)),s.view.context,s.receipt).candidate)===JSON.stringify(after)});
  assert.deepEqual(out.project,a.candidate);
  const undo=s.host.replay({direction:'undo',context:s.host.view().context,workspace:w});
  assert.deepEqual(undo.project.city,s.view.project.city);
  assert.deepEqual(undo.project.identityAllocation,out.project.identityAllocation);
  const redo=s.host.replay({direction:'redo',context:s.host.view().context,workspace:w});
  assert.deepEqual(redo.project,out.project);
});
test('IDA independent adopted copies get disjoint persistent road additions',()=>{
  const a=setup(cases[0],1),b=setup(cases[0],2);
  assert.deepEqual(a.requests,b.requests);
  const ids=new Set(a.receipt.allocations.map(row=>row.id));
  assert.ok(b.receipt.allocations.every(row=>!ids.has(row.id)));
});

test('S3-A combined road allocation owns its candidate and metadata across reservation callbacks',()=>{
  const s=setup(cases[0]),expected=allocated(s),raw=copyJson(s.fresh),reserve=s.host.reserve.bind(s.host);
  s.host.reserve=requests=>{
    raw.candidateProject.city.name='Late mutation';
    raw.ledger.length=0;
    raw.changed.length=0;
    return reserve(requests);
  };
  const {receipt,...actual}=allocateRoadCandidateForHost(s.host,s.view,raw);
  assert.deepEqual(receipt,s.receipt);
  assert.deepEqual(actual,expected);
  assert.equal(s.host.view(),s.view);
});
test('S3-A combined road allocation retains no-addition, stale view and receipt refusals',()=>{
  const s=setup(cases[0]),reserve=s.host.reserve.bind(s.host);
  let called=0;
  s.host.reserve=requests=>{called++;return reserve(requests);};
  assert.throws(()=>allocateRoadCandidateForHost(s.host,s.view,s.fresh,{allowAdditions:false}),/may not allocate/);
  assert.throws(()=>allocateRoadCandidateForHost(s.host,{...s.view},s.fresh),/Stale/);
  assert.equal(called,0);
  s.host.reserve=requests=>{
    const receipt=copyJson(reserve(requests));
    receipt.binding.revision++;
    return receipt;
  };
  assert.throws(()=>allocateRoadCandidateForHost(s.host,s.view,s.fresh),/Stale/);
  assert.equal(s.host.view(),s.view);
  const otherView={...s.view};
  let current=s.view;
  const fakeHost={view:()=>current,reserve:requests=>{current=otherView;return reserve(requests);}};
  assert.throws(()=>allocateRoadCandidateForHost(fakeHost,s.view,s.fresh),/Stale/);
});
