import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createProject} from '../src/core/city-model.js';
import {defaultWorkspace,createProjectDocument,encodeProjectDocument,decodeProjectDocument} from '../src/data/project-format.js';
import {validateStoredProject} from '../src/data/project-validation.js';
import {PropertyEditSession3I} from '../src/editor/property-edit.js';
import {inspectPropertyEdit3I,preparePropertyApply3I} from '../src/editor/property-application.js';
import {PropertyGeometryHistory3I} from '../src/editor/property-history.js';
import {findSplitAndMerge} from './helpers/property-split-merge-fixture.js';
import {buildingAppHarness} from './helpers/building-app.js';

const MORPHOLOGIES=['planned','radial','organic','linear'];
const SIZES=['small','large'];
const unchanged=(previous,next)=>{
 for(const key of ['roads','blocks','nodes','openSpaces','districts'])
  assert.equal(JSON.stringify(next.city[key]),JSON.stringify(previous.city[key]),
   'Unrelated '+key+' must be byte-equivalent after local property edits');
};
function roundTrip(project){
 validateStoredProject(project);
 const workspace=defaultWorkspace(project);
 const document=createProjectDocument(project,workspace);
 const reopened=decodeProjectDocument(encodeProjectDocument(document)).project;
 assert.deepEqual(reopened.city,project.city,'Portable schema-9 round-trip must preserve every identity and lineage field');
 assert.equal(reopened.schemaVersion,9);
 return reopened;
}
test('E5 complete E2→E3→E4 property/plot chain preserves unrelated city and all lineage after reopen',()=>{
 const {base,split,merged,propertyId}=findSplitAndMerge();
 const original=JSON.stringify(base.city);
 assert.equal(JSON.stringify(base.city),original);
 unchanged(base,split.candidate);unchanged(base,merged.candidate);
 const survivor=merged.candidate.city.properties.find(p=>p.id===propertyId);
 assert.ok(survivor.propertySplitHistoryE2);
 assert.equal(survivor.propertyMergeHistoryE3.at(-1).retainedId,propertyId);
 assert.equal(merged.candidate.city.properties.length,base.city.properties.length);
 const splitLeft=survivor.plotIds.length;
 let final=null,edit=null;
 for(let i=0;i<splitLeft;i++){
  const s=new PropertyEditSession3I();
  if(!s.start(merged.candidate.city,propertyId)||!s.addDivider(merged.candidate.city,i))continue;
  const receipt=preparePropertyApply3I(merged.candidate,defaultWorkspace(merged.candidate),s);
  if(receipt.ok){final=receipt;edit=s;break;}
 }
 assert.ok(final,'An empty reunited parcel must support a legal E4 divider addition');
 unchanged(base,final.candidate);
 assert.equal(final.candidate.city.plots.length,merged.candidate.city.plots.length+1);
 assert.ok(final.candidate.city.properties.find(p=>p.id===propertyId).propertyMergeHistoryE3);
 assert.ok(final.candidate.city.properties.find(p=>p.id===propertyId).propertySplitHistoryE2);
 assert.equal(final.candidate.city.properties.find(p=>p.id===propertyId).plotCountHistoryE4.at(-1).operation,'split');
 const saved=roundTrip(final.candidate);
 const history=new PropertyGeometryHistory3I();
 assert.equal(history.record(merged.candidate,final.candidate,propertyId),true);
 assert.equal(history.count('undo',propertyId),1);
 const undo=history.prepare(final.candidate,defaultWorkspace(final.candidate),propertyId,'undo');
 assert.equal(undo.ok,true,undo.reason);
 assert.deepEqual(undo.candidate.city,merged.candidate.city);
 history.accept(undo.entry,'undo');
 const redo=history.prepare(merged.candidate,defaultWorkspace(merged.candidate),propertyId,'redo');
 assert.equal(redo.ok,true,redo.reason);
 assert.deepEqual(redo.candidate.city,saved.city);
 assert.equal(edit.reset(),true);
 assert.equal(JSON.stringify(base.city),original);
});

test('E5 protected lineage and custom plot annotation cannot be retired without consent',()=>{
 const {merged,propertyId}=findSplitAndMerge('e5-protected');
 const custom=merged.candidate;
 const property=custom.city.properties.find(p=>p.id===propertyId);
 assert.ok(property.plotIds.length>=2);
 const retired=custom.city.plots.find(p=>p.id===property.plotIds[1]);
 retired.e5UnknownMetadata={origin:'authored',rights:['access']};
 const before=JSON.stringify(custom.city);
 const session=new PropertyEditSession3I();
 assert.equal(session.start(custom.city,propertyId),true);
 assert.equal(session.removeDivider(0),true);
 assert.equal(inspectPropertyEdit3I(custom,session).ok,false);
 assert.equal(preparePropertyApply3I(custom,defaultWorkspace(custom),session).ok,false);
 assert.equal(JSON.stringify(custom.city),before);
 session.approvePlotCount(true);
 const accepted=preparePropertyApply3I(custom,defaultWorkspace(custom),session);
 assert.equal(accepted.ok,true,JSON.stringify(accepted.issues));
 const receipt=accepted.candidate.city.properties.find(p=>p.id===propertyId).plotCountHistoryE4.at(-1);
 assert.deepEqual(receipt.sourceRecord.e5UnknownMetadata,{origin:'authored',rights:['access']});
 roundTrip(accepted.candidate);
 assert.equal(JSON.stringify(custom.city),before);
});

test('E5 generated baseline supports independent E4 draft decisions for all morphologies and sizes',()=>{
 for(const morphology of MORPHOLOGIES)for(const size of SIZES){
  const project=createProject({seed:'e5-matrix-'+morphology+'-'+size,morphology,size});
  const before=JSON.stringify(project.city);
  let success=false;
  const t0=performance.now();
  for(const property of project.city.properties){
   const session=new PropertyEditSession3I();
   if(!session.start(project.city,property.id)||!session.addDivider(project.city,0))continue;
   const result=preparePropertyApply3I(project,defaultWorkspace(project),session);
   if(!result.ok)continue;
   roundTrip(result.candidate);
   unchanged(project,result.candidate);
   success=true;break;
  }
  const elapsed=performance.now()-t0;
  assert.ok(success,'Missing valid E4 fixture for '+morphology+'/'+size);
  assert.equal(JSON.stringify(project.city),before,'E4 testing must never mutate source city');
  console.log('E5 fixture '+morphology+'/'+size+': validated split in '+elapsed.toFixed(1)+'ms (runner sample, not benchmark)');
 }
});

test('E5 accepted road adaptation remains authoritative for subsequent plot-count editing and portable saves',async()=>{
 const app=await buildingAppHarness();
 const start=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
 app.apply({project:start,workspace:defaultWorkspace(start)});
 const beforeRoad=JSON.stringify(app.state().project.city);
 const roadWorkspace=app.state().roadWorkspace;
 roadWorkspace.start();
 const drag=roadWorkspace.session;
 drag.schedule=run=>run();
 drag.select({kind:'road',id:'RD-0113'});
 const road=drag.details.record;
 const a=drag.graph.nodesById.get(road.a),b=drag.graph.nodesById.get(road.b);
 const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
 assert.equal(drag.begin(center,5,'mouse'),true);
 drag.move({x:center.x+12,y:center.y});
 drag.end(false);
 assert.equal(app.el('roadApplyB4').disabled,false,
  'The established road acceptance fixture must be valid.');
 app.el('roadApplyB4').handlers.click();
 const adapted=app.state().project;
 assert.notEqual(JSON.stringify(adapted.city),beforeRoad,'Accepted road edit must change city state');
 let edited=null;
 for(const p of adapted.city.properties){
  const session=new PropertyEditSession3I();
  if(!session.start(adapted.city,p.id)||!session.addDivider(adapted.city,0))continue;
  const result=preparePropertyApply3I(adapted,defaultWorkspace(adapted),session);
  if(result.ok){edited=result.candidate;break;}
 }
 assert.ok(edited,'An accepted adapted city must support a legal later plot edit.');
 unchanged(adapted,edited);
 assert.equal(JSON.stringify(edited.city.nodes),JSON.stringify(adapted.city.nodes),
  'Later land changes cannot revert accepted street positions');
 roundTrip(edited);
});
