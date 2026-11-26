import test from 'node:test';
import assert from 'node:assert/strict';
import {formatAllocatedIdentity,parseAllocatedIdentity,createIdentityAllocationState} from '../src/core/identity-allocation.js';
import {reserveAllocatedIdentities,MAX_IDENTITY_RESERVATION_REQUESTS} from '../src/core/identity-reservations.js';
import {issueIdentityReservation,verifyIdentityReservation} from '../src/core/identity-verification.js';
import {SecureIdentityHost} from '../src/core/secure-identity-host.js';
import {vacant} from './helpers/vacant-frontage.js';
import {copyJson,createProjectDocument,encodeProjectDocument,decodeProjectDocument} from '../src/data/project-format.js';
const types=['building','plot','property'],ns=n=>n.toString(16).padStart(2,'0').repeat(16);
const chosen=ns(1),other=ns(2);
const req=(type,key)=>({type,key});
const counter=(type,n)=>({version:1,namespaces:{[chosen]:{[type]:n}}});
const city=()=>({buildings:[{id:'BLD-001'}],plots:[{id:'PLOT-001'}],properties:[{id:'PROP-001'}]});
const ctx={projectId:'qualification-instance',namespace:chosen,revision:19};
for(const type of types){
 const rest=types.filter(t=>t!==type);
 test('IDA B4 allocation '+type+' crosses six-digit width boundary in a single sorted batch',()=>{
  const s=counter(type,999998),r=reserveAllocatedIdentities(s,chosen,[req(type,'c'),req(type,'a'),req(type,'b')]);
  assert.deepEqual(r.allocations.map(x=>x.sequence),[999999,1000000,1000001]);
  assert.deepEqual(r.allocations.map(x=>x.id),[999999,1000000,1000001].map(n=>formatAllocatedIdentity(type,chosen,n)));
  assert.equal(r.nextState.namespaces[chosen][type],1000001);
  assert.equal(s.namespaces[chosen][type],999998);
 });
 test('IDA B4 allocation '+type+' sorts punctuation, numeric and case-sensitive stable keys by code point',()=>{
  const keys=['a/2','A:1','a.1','0','a-1','a_1','a/10','a'];
  const r=reserveAllocatedIdentities(createIdentityAllocationState(),chosen,keys.map(k=>req(type,k)));
  const expected=['0','A:1','a','a-1','a.1','a/10','a/2','a_1'];
  assert.deepEqual(r.allocations.map(x=>x.key),expected);
  assert.deepEqual(r.allocations.map(x=>x.sequence),expected.map((_,i)=>i+1));
  assert.deepEqual(r,reserveAllocatedIdentities(createIdentityAllocationState(),chosen,keys.reverse().map(k=>req(type,k))));
 });
 test('IDA B4 allocation '+type+' exact 128-character stable key remains distinct from its 127-character prefix',()=>{
  const prefix='k'.repeat(127),r=reserveAllocatedIdentities(createIdentityAllocationState(),chosen,[req(type,prefix+'z'),req(type,prefix)]);
  assert.deepEqual(r.allocations.map(x=>[x.key,x.sequence]),[[prefix,1],[prefix+'z',2]]);
  assert.equal(r.nextState.namespaces[chosen][type],2);
 });
 test('IDA B4 allocation '+type+' can exhaust its own last sequence while other types continue independently',()=>{
  const s=counter(type,Number.MAX_SAFE_INTEGER-1);
  const r=reserveAllocatedIdentities(s,chosen,[req(type,'last'),req(rest[0],'other1'),req(rest[1],'other2')]);
  assert.equal(r.nextState.namespaces[chosen][type],Number.MAX_SAFE_INTEGER);
  for(const t of rest)assert.equal(r.nextState.namespaces[chosen][t],1);
  const next=reserveAllocatedIdentities(r.nextState,chosen,[req(rest[0],'next')]);
  assert.equal(next.nextState.namespaces[chosen][rest[0]],2);
  assert.equal(next.nextState.namespaces[chosen][type],Number.MAX_SAFE_INTEGER);
 });
 test('IDA B4 allocation '+type+' maximum batch from a nonzero high-water mark verifies independently',()=>{
  const s=counter(type,100),requests=Array.from({length:MAX_IDENTITY_RESERVATION_REQUESTS},(_,i)=>req(type,'batch/'+String(i).padStart(4,'0')));
  const receipt=issueIdentityReservation(s,city(),ctx,requests.slice().reverse());
  assert.equal(receipt.allocations[0].sequence,101);
  assert.equal(receipt.allocations.at(-1).sequence,100+MAX_IDENTITY_RESERVATION_REQUESTS);
  assert.equal(receipt.nextState.namespaces[chosen][type],100+MAX_IDENTITY_RESERVATION_REQUESTS);
  assert.deepEqual(verifyIdentityReservation(s,city(),ctx,requests,receipt),receipt.nextState);
 });
 test('IDA B4 allocation '+type+' equal counters in different namespaces never produce the same ID',()=>{
  const s={version:1,namespaces:{[chosen]:{[type]:42},[other]:{[type]:42}}};
  const a=reserveAllocatedIdentities(s,chosen,[req(type,'same')]),b=reserveAllocatedIdentities(s,other,[req(type,'same')]);
  assert.equal(a.allocations[0].sequence,b.allocations[0].sequence);
  assert.notEqual(a.allocations[0].id,b.allocations[0].id);
  assert.deepEqual(parseAllocatedIdentity(a.allocations[0].id),{type,namespace:chosen,sequence:43});
  assert.deepEqual(a.nextState.namespaces[other],s.namespaces[other]);
  assert.deepEqual(b.nextState.namespaces[chosen],s.namespaces[chosen]);
 });
 test('IDA B4 allocation '+type+' accepts null-prototype request and allocation maps without retaining aliases',()=>{
  const s=Object.assign(Object.create(null),{version:1,namespaces:Object.assign(Object.create(null),{[chosen]:Object.assign(Object.create(null),{[type]:8})})});
  const r=reserveAllocatedIdentities(s,chosen,[Object.assign(Object.create(null),req(type,'new'))]);
  assert.equal(r.allocations[0].sequence,9);
  assert.equal(Object.getPrototypeOf(r.nextState.namespaces),Object.prototype);
  s.namespaces[chosen][type]=100;
  assert.equal(r.nextState.namespaces[chosen][type],9);
 });
 test('IDA B4 allocation '+type+' cancelled mixed batch can be reduced and reordered without consuming unused sequences',()=>{
  const s=counter(type,17),full=[req(type,'c'),req(type,'a'),req(type,'b'),req(rest[0],'d')];
  const a=reserveAllocatedIdentities(s,chosen,full),reduced=reserveAllocatedIdentities(s,chosen,[req(type,'c')]);
  assert.equal(reduced.allocations[0].sequence,18);
  assert.equal(reduced.allocations[0].id,a.allocations.find(x=>x.type===type&&x.key==='a').id);
  assert.equal(reduced.nextState.namespaces[chosen][rest[0]],undefined);
  assert.equal(s.namespaces[chosen][type],17);
 });
}

const site=vacant();
function entropy(...bytes){let i=0;return {get calls(){return i;},getRandomValues(a){a.fill(bytes[Math.min(i++,bytes.length-1)]);return a;}};}
const newHost=source=>new SecureIdentityHost({cryptoSource:source});
const portable=p=>decodeProjectDocument(encodeProjectDocument(createProjectDocument(p,site.workspace)));
function adopt(h,p){return h.commitAdoption(h.stageAdoption(portable(p)).token);}
const sets=[['building only',{building:31}],['plot only',{plot:41}],['property only',{property:51}],['all types',{building:31,plot:41,property:51}]];
function withMarks(marks){const p=copyJson(site.project);p.identityAllocation.namespaces[chosen]={...marks};return p;}
function assertReservedIn(h,namespace){
 const r=h.reserve(types.map(t=>req(t,'copy/'+t)));
 for(const row of r.allocations){assert.equal(row.sequence,1);assert.equal(row.id,formatAllocatedIdentity(row.type,namespace,1));}
 return r;
}
for(const [label,marks] of sets){
 test('IDA B4 copy '+label+' retired-only backup excludes persisted namespace when first entropy draw collides',()=>{
  const p=withMarks(marks),source=entropy(1,2),h=newHost(source),out=adopt(h,p);
  assert.equal(source.calls,2);assert.equal(out.context.namespace,other);
  assert.deepEqual(out.project.identityAllocation,p.identityAllocation);
  assertReservedIn(h,other);assert.deepEqual(h.view().project.identityAllocation,p.identityAllocation);
 });
 test('IDA B4 copy '+label+' same portable document forked into two fresh sessions gets disjoint reservations',()=>{
  const p=withMarks(marks),doc=portable(p),a=newHost(entropy(1,2)),b=newHost(entropy(1,3));
  const x=a.commitAdoption(a.stageAdoption(doc).token),y=b.commitAdoption(b.stageAdoption(doc).token);
  assert.deepEqual(x.document,y.document);assert.notEqual(x.context.projectId,y.context.projectId);
  const ra=assertReservedIn(a,other),rb=assertReservedIn(b,ns(3));
  const ids=new Set(ra.allocations.map(r=>r.id));assert.ok(rb.allocations.every(r=>!ids.has(r.id)));
  assert.deepEqual(a.view().project.identityAllocation,b.view().project.identityAllocation);
 });
 test('IDA B4 copy '+label+' older backup without persisted counters still excludes both prior adopted session namespaces',()=>{
  const p=withMarks(marks),source=entropy(1,2,2,3,2,3,4),h=newHost(source);
  const first=adopt(h,p);assert.equal(first.context.namespace,other);
  const a=assertReservedIn(h,other);
  const second=adopt(h,site.project);assert.equal(second.context.namespace,ns(3));
  const b=assertReservedIn(h,ns(3));
  const third=adopt(h,site.project);assert.equal(third.context.namespace,ns(4));
  const c=assertReservedIn(h,ns(4));
  assert.equal(new Set([...a.allocations,...b.allocations,...c.allocations].map(x=>x.id)).size,9);
  assert.deepEqual(third.project.identityAllocation,site.project.identityAllocation);
 });
 test('IDA B4 copy '+label+' malformed newer backup cannot displace exact outgoing retired-only state',()=>{
  const p=withMarks(marks),source=entropy(1,2,3),h=newHost(source);
  adopt(h,p);const before=h.view(),bad=portable(p);
  bad.project.identityAllocation.namespaces[chosen][Object.keys(marks)[0]]=0;
  assert.throws(()=>h.stageAdoption(bad),/allocation|counter|identity/i);
  assert.equal(h.view(),before);assert.equal(source.calls,2);
  const out=adopt(h,p);assert.equal(out.context.namespace,ns(3));
  assert.deepEqual(out.project.identityAllocation,p.identityAllocation);
 });
}
