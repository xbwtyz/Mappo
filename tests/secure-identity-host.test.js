import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { SecureIdentityHost } from '../src/core/secure-identity-host.js';
import { vacant } from './helpers/vacant-frontage.js';
import { copyJson,createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../src/data/project-format.js';
import { previewAllocatedPropertyCreation,commitAllocatedPropertyCreation } from '../src/editor/allocated-property-creation.js';

const site=vacant();
const ns=n=>n.toString(16).padStart(2,'0').repeat(16);
function entropy(...values){
  let calls=0;
  return {get calls(){return calls;},getRandomValues(bytes){
    assert.equal(bytes.constructor,Uint8Array);assert.equal(bytes.length,16);
    bytes.fill(values[Math.min(calls++,values.length-1)]);return bytes;
  }};
}
function fresh(source=entropy(1,2,3)){
  const host=new SecureIdentityHost({cryptoSource:source});host.adopt(site.project);return host;
}
const snapshot=host=>JSON.stringify({state:host.read(),ledger:host.copyHistory()});
const preview=host=>previewAllocatedPropertyCreation(host,site.workspace,site.draft);
const apply=(host,p)=>commitAllocatedPropertyCreation(host,site.workspace,site.draft,p);
test('IDA secure host cannot reserve or publish before adoption',()=>{
 const host=new SecureIdentityHost({cryptoSource:entropy(1)});
 assert.equal(host.adopted,false);
 for(const fn of [()=>host.read(),()=>host.copyHistory(),()=>host.reserve([]),()=>host.commit({}),()=>host.replay({})])
   assert.throws(fn,/No accepted identity session/);
});
test('IDA secure adoption uses exactly 128 bits and changes no saved project data',()=>{
 const source=entropy(1),host=new SecureIdentityHost({cryptoSource:source});
 const original=copyJson(site.project),out=host.adopt(original);
 assert.equal(source.calls,1);assert.equal(out.context.namespace,ns(1));
 assert.equal(out.context.projectId,'ida-session-'+ns(1));assert.equal(out.context.revision,0);
 assert.deepEqual(out.project,site.project);assert.deepEqual(out.project.identityAllocation.namespaces,{});
 assert.deepEqual(out.history.entries,[]);assert.equal(host.adopted,true);
 original.city.name='Injected';out.project.city.name='Other';out.context.namespace=ns(9);
 assert.deepEqual(host.read().project,site.project);assert.equal(host.read().context.namespace,ns(1));
});
test('IDA real Web Crypto independent host copies allocate disjoint IDs',()=>{
 const a=fresh(webcrypto),b=fresh(webcrypto);
 assert.match(a.read().context.namespace,/^[0-9a-f]{32}$/);
 assert.notEqual(a.read().context.namespace,b.read().context.namespace);
 const x=preview(a),y=preview(b);assert.ok(x.result.ok&&y.result.ok);
 assert.ok(x.receipt.allocations.every(row=>!y.receipt.allocations.some(other=>other.id===row.id)));
 const ax=apply(a,x),by=apply(b,y);
 assert.equal(ax.context.revision,1);assert.equal(by.context.revision,1);
 assert.notDeepEqual(ax.project.identityAllocation,by.project.identityAllocation);
});
test('IDA empty reservation and cancelled preview do not persist the namespace',()=>{
 const host=fresh(),before=snapshot(host),empty=host.reserve([]);
 assert.deepEqual(empty.allocations,[]);assert.deepEqual(empty.nextState,site.project.identityAllocation);
 assert.ok(preview(host).result.ok);assert.equal(snapshot(host),before);
 const saved=decodeProjectDocument(encodeProjectDocument(createProjectDocument(host.read().project,site.workspace)));
 assert.deepEqual(saved.project,site.project);
});
test('IDA reopening same unallocated project rotates context and rejects old receipts',()=>{
 const source=entropy(1,1,2),host=fresh(source),p=preview(host);
 const opened=host.adopt(site.project);assert.equal(source.calls,3);
 assert.equal(opened.context.namespace,ns(2));assert.equal(opened.context.revision,0);
 const before=snapshot(host);assert.throws(()=>apply(host,p),/Stale/);assert.equal(snapshot(host),before);
});
test('IDA adoption excludes namespaces in persisted counter metadata including retired-only marks',()=>{
 const project=copyJson(site.project);project.identityAllocation.namespaces[ns(1)]={plot:9};
 const source=entropy(1,2),host=new SecureIdentityHost({cryptoSource:source});
 const out=host.adopt(project);assert.equal(source.calls,2);assert.equal(out.context.namespace,ns(2));
 assert.deepEqual(out.project.identityAllocation,project.identityAllocation);
 assert.equal(host.reserve([{type:'plot',key:'new'}]).allocations[0].sequence,1);
});
test('IDA opening an older backup after accepted allocation uses a fresh namespace',()=>{
 const host=fresh(),p=preview(host),accepted=apply(host,p);
 const old=host.adopt(site.project),q=preview(host);
 assert.notEqual(old.context.namespace,accepted.context.namespace);
 assert.ok(q.receipt.allocations.every(x=>!p.receipt.allocations.some(y=>y.id===x.id)));
 assert.deepEqual(old.history.entries,[]);
 assert.throws(()=>host.replay({direction:'undo',context:accepted.context,workspace:site.workspace}),/Stale/);
});
test('IDA adopting current saved project preserves counters but resets session history',()=>{
 const host=fresh(),accepted=apply(host,preview(host)),saved=decodeProjectDocument(
  encodeProjectDocument(createProjectDocument(accepted.project,site.workspace)));
 const opened=host.adopt(saved.project);
 assert.deepEqual(opened.project,accepted.project);assert.deepEqual(opened.history.entries,[]);
 assert.equal(opened.context.revision,0);assert.equal(opened.context.namespace,ns(2));
 assert.deepEqual(opened.project.identityAllocation.namespaces,{[ns(1)]:{plot:1,property:1}});
});
test('IDA invalid adoption consumes no entropy and preserves prior state',()=>{
 const source=entropy(1,2),host=fresh(source),before=snapshot(host),bad=copyJson(site.project);
 bad.identityAllocation.namespaces[ns(3)]={plot:-1};
 assert.throws(()=>host.adopt(bad));assert.equal(source.calls,1);assert.equal(snapshot(host),before);
});
test('IDA missing secure randomness fails closed with no weak fallback',()=>{
 for(const cryptoSource of [null,{}, {randomUUID:()=> 'not-enough'}]){
  const host=new SecureIdentityHost({cryptoSource});
  assert.throws(()=>host.adopt(site.project),/Secure identity namespace/);
  assert.equal(host.adopted,false);
 }
});
test('IDA entropy failure during adoption leaves prior accepted project and history intact',()=>{
 let calls=0;
 const host=fresh({getRandomValues(bytes){if(calls++)throw Error('entropy denied');bytes.fill(1);return bytes;}});
 apply(host,preview(host));const before=snapshot(host);
 assert.throws(()=>host.adopt(site.project),/entropy denied/);assert.equal(snapshot(host),before);
});
test('IDA repeated entropy collision has a bounded failure and no partial adoption',()=>{
 const source=entropy(1),host=fresh(source),before=snapshot(host);
 assert.throws(()=>host.adopt(site.project),/fresh identity namespace/);
 assert.equal(source.calls,9);assert.equal(snapshot(host),before);
});
test('IDA entropy provider returning a different buffer fails closed',()=>{
 const host=new SecureIdentityHost({cryptoSource:{getRandomValues:()=>new Uint8Array(16)}});
 assert.throws(()=>host.adopt(site.project),/generation failed/);assert.equal(host.adopted,false);
});
test('IDA reentrant adoption during transaction domain validation cannot replace the active session',()=>{
 const host=fresh(),p=preview(host),before=snapshot(host);
 const requests=p.receipt.allocations.map(({type,key})=>({type,key}));
 assert.throws(()=>host.commit({requests,receipt:p.receipt,candidateCity:p.result.candidate.city,
  transaction:{family:'property',operation:'property-creation',label:'Create property',targetIds:[p.result.propertyId]},
  validateDomain:()=>{host.adopt(site.project);return true;}
 }),/Reentrant identity host/);
 assert.equal(snapshot(host),before);
 assert.equal(apply(host,p).context.revision,1);
});
test('IDA secure host delegates atomic Undo and Redo without rotating namespace',()=>{
 const host=fresh(),accepted=apply(host,preview(host));
 const undone=host.replay({direction:'undo',context:accepted.context,workspace:site.workspace});
 assert.deepEqual(undone.project.city,site.project.city);
 assert.deepEqual(undone.project.identityAllocation,accepted.project.identityAllocation);
 const redone=host.replay({direction:'redo',context:undone.context,workspace:site.workspace});
 assert.deepEqual(redone.project,accepted.project);assert.equal(redone.context.namespace,ns(1));
 assert.equal(redone.context.revision,3);
});
