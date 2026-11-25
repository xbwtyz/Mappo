import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { prepareNeighborhoodReflowC3 } from '../src/core/neighborhood-reflow.js';
import { prepareRoadTopologyReflowC3 } from '../src/core/road-topology-reflow.js';
import { roadIdentityRequests,allocateRoadCandidate } from '../src/core/road-identity-delta.js';
import { SecureIdentityHost } from '../src/core/secure-identity-host.js';
import { copyJson,defaultWorkspace,createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../src/data/project-format.js';
import { reconcileRoadWorkspace } from '../src/editor/road-workspace.js';
import { buildingAppHarness } from './helpers/building-app.js';

const namespace='12'.repeat(16),other='34'.repeat(16);
const cases=[
 {name:'planned development',seed:'c2-planned',morphology:'planned',road:'RD-0113',offset:{x:12,y:0},
  run:p=>prepareNeighborhoodReflowC3(p,'RD-0113',{x:12,y:0})},
 {name:'radial crossing',seed:'c2-radial',morphology:'radial',road:'RD-0103',offset:{x:0,y:15},
  run:p=>prepareNeighborhoodReflowC3(p,'RD-0103',{x:0,y:15})},
 {name:'radial removal',seed:'c2-radial',morphology:'radial',road:'RD-0099',remove:true,
  run:p=>prepareRoadTopologyReflowC3(p,'RD-0099',null,{kind:'remove'})}
];
const collections={building:'buildings',property:'properties',plot:'plots'};
const json=v=>JSON.parse(JSON.stringify(v));
const bases=new Map();
function base(f){
 if(!bases.has(f.name))bases.set(f.name,createProject({seed:f.seed,morphology:f.morphology,size:'small'}));
 return copyJson(bases.get(f.name));
}
function setup(f,withMarks=false){
 const project=base(f);
 if(withMarks)project.identityAllocation.namespaces[other]={building:93,property:17,plot:41};
 const host=new SecureIdentityHost({cryptoSource:{getRandomValues(a){a.fill(0x12);return a;}}});
 host.adopt(project);
 return {host,view:host.view()};
}
function prepare(f,host){
 const view=host.view(),fresh=f.run(copyJson(view.project));
 assert.ok(fresh.candidateProject,JSON.stringify(fresh.unresolved));
 const requests=roadIdentityRequests(view.project,fresh),receipt=host.reserve(requests);
 assert.ok(requests.length>0);
 const allocated=allocateRoadCandidate(view.project,fresh,view.context,receipt);
 return {view,fresh,requests,receipt,allocated};
}
function commit(f,host,p){
 const out=host.commit({requests:p.requests,receipt:p.receipt,candidateCity:p.allocated.candidate.city,
  transaction:{family:'road',operation:'road-reflow',label:'Qualification '+f.name,targetIds:[f.road]},
  validateDomain:(before,after)=>JSON.stringify(allocateRoadCandidate(before,f.run(copyJson(before)),p.view.context,p.receipt).candidate)===JSON.stringify(after)});
 assert.deepEqual(out.project,p.allocated.candidate);
 return out;
}
function workspace(p){return defaultWorkspace(p);}
function replay(host,direction,w){return host.replay({direction,context:host.view().context,workspace:w});}
for(const f of cases){
 test('IDA B4 regeneration '+f.name+' preserves unrelated retired-only counters on conversion',()=>{
  const {host,view}=setup(f,true),p=prepare(f,host),next=p.allocated.candidate.identityAllocation;
  assert.deepEqual(next.namespaces[other],view.project.identityAllocation.namespaces[other]);
  for(const type of Object.keys(collections)){
   const count=p.requests.filter(r=>r.type===type).length;
   assert.equal(next.namespaces[namespace]?.[type]??0,count);
  }
  assert.equal(host.view(),view);
 });
 test('IDA B4 regeneration '+f.name+' retains every surviving ID and all nonallocated city collections',()=>{
  const {host,view}=setup(f),p=prepare(f,host),candidate=p.allocated.candidate;
  for(const [type,key] of Object.entries(collections)){
   const priorIds=new Set(view.project.city[key].map(r=>r.id));
   const expected=p.fresh.candidateProject.city[key].map(row=>priorIds.has(row.id)?row.id:
    p.receipt.allocations.find(r=>r.type===type&&r.key==='road/'+row.id)?.id);
   assert.ok(expected.every(Boolean));assert.deepEqual(candidate.city[key].map(r=>r.id),expected);
  }
  for(const key of Object.keys(candidate.city))if(!Object.values(collections).includes(key))
   assert.deepEqual(json(candidate.city[key]),json(p.fresh.candidateProject.city[key]),key);
 });
 test('IDA B4 regeneration '+f.name+' rejects duplicated creation ledger independently of candidate geometry',()=>{
  const {host,view}=setup(f),p=prepare(f,host),bad=copyJson(p.fresh);
  const first=p.requests[0],row=bad.ledger.find(x=>x.kind===first.type&&x.newId===first.key.slice(5));
  assert.ok(row);bad.ledger.push(copyJson(row));
  assert.throws(()=>roadIdentityRequests(view.project,bad),/exact creation ledger/);
  assert.equal(host.view(),view);
 });
 test('IDA B4 regeneration '+f.name+' rejects altered accepted root metadata',()=>{
  const {host,view}=setup(f),p=prepare(f,host),bad=copyJson(p.fresh);
  bad.candidateProject.seed+='-changed';
  assert.throws(()=>roadIdentityRequests(view.project,bad),/changed accepted project metadata/);
  assert.equal(host.view(),view);
 });
 test('IDA B4 regeneration '+f.name+' abandons an allocated branch and reissues disjoint IDs in the same namespace',()=>{
  const {host,view}=setup(f),w=workspace(view.project),first=prepare(f,host),out=commit(f,host,first);
  replay(host,'undo',w);
  assert.deepEqual(host.view().project.city,view.project.city);
  assert.deepEqual(host.view().project.identityAllocation,out.project.identityAllocation);
  const second=prepare(f,host),oldIds=new Set(first.receipt.allocations.map(a=>a.id));
  assert.deepEqual(second.requests,first.requests);
  assert.ok(second.receipt.allocations.every(a=>!oldIds.has(a.id)));
  commit(f,host,second);
  assert.equal(host.view().history.entry('redo'),null);
  for(const type of Object.keys(collections)){
   const n=first.requests.filter(a=>a.type===type).length;
   assert.equal(host.view().project.identityAllocation.namespaces[namespace]?.[type]??0,n*2);
  }
 });
 test('IDA B4 regeneration '+f.name+' portable restored copy preserves committed root and allocated ownership',()=>{
  const {host,view}=setup(f,true),p=prepare(f,host);
  const w=reconcileRoadWorkspace(workspace(view.project),view.project.city,p.allocated.candidate.city);
  const doc=decodeProjectDocument(encodeProjectDocument(createProjectDocument(p.allocated.candidate,w)));
  const reopened=new SecureIdentityHost({cryptoSource:{getRandomValues(a){a.fill(0x56);return a;}}});
  reopened.commitAdoption(reopened.stageAdoption(doc).token);
  assert.deepEqual(reopened.view().project,p.allocated.candidate);
  assert.deepEqual(reopened.view().project.identityAllocation.namespaces[other],{building:93,property:17,plot:41});
  assert.notEqual(reopened.view().context.namespace,namespace);
  assert.equal(reopened.view().history.length,0);
 });
}
// Use the actual compiled mounted session, not the detached bridge alone.
// The VM lacks a Blob Worker; ordinary road moves use the synchronous domain
// path. The existing offline browser QA retains the real async worker path.
for(const f of cases.filter(x=>!x.remove)){
 test('IDA B4 regeneration mounted '+f.name+' publishes real allocated IDs, one chronological entry, nonrewinding replay',async()=>{
  const app=await buildingAppHarness(),p=base(f);
  app.applyPortable(encodeProjectDocument(createProjectDocument(p,workspace(p))));
  const before=app.state(),r=before.roadWorkspace,fileRevision=before.files.revision;
  r.start();assert.equal(r.active,true);
  r.session.select({kind:'road',id:f.road});
  assert.ok(r.session.updateRoadIntent(f.offset,{defer:false}));
  assert.ok(r.session.hasApplyCandidate,JSON.stringify(r.session.reconciliation?.unresolved));
  assert.equal(app.state().identityView,before.identityView);
  const applied=await app.applyRoad();
  assert.equal(applied?.ok,true,applied?.message??app.el('roadApplyStatusB4').textContent);
  const accepted=app.state(),ns=accepted.identityView.context.namespace;
  assert.equal(accepted.identityView.context.revision,1);assert.equal(accepted.identityView.history.length,1);
  assert.equal(accepted.project,accepted.identityView.project);
  assert.equal(r.active,false);
  assert.ok(accepted.project.city.buildings.some(b=>b.id.startsWith('BLD-IDA-'+ns)));
  assert.equal(accepted.files.revision,fileRevision+1);
  assert.equal(app.moveRoadHistory('undo'),true);
  assert.deepEqual(json(app.state().project.city),json(before.project.city));
  assert.deepEqual(json(app.state().project.identityAllocation),json(accepted.project.identityAllocation));
  assert.equal(app.moveRoadHistory('redo'),true);
  assert.deepEqual(json(app.state().project),json(accepted.project));
 });
}
