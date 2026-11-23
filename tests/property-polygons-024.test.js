import test from 'node:test';
import assert from 'node:assert/strict';
import { polygonSignedArea } from '../src/core/geometry.js';
import { shapeWellFormed } from '../src/core/building-validation.js';
import { partitionPropertyPolygon024, convexPropertyPolygon024, propertyPolygonPreview024 } from '../src/core/property-polygons-024.js';
import { createProject } from '../src/core/city-model.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { defaultWorkspace, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
import { PropertyEditSession3I } from '../src/editor/property-edit.js';
import { inspectPropertyEdit3I, preparePropertyApply3I } from '../src/editor/property-application.js';
import { PropertyGeometryHistory3I } from '../src/editor/property-history.js';

const pentagon=[{x:0,y:0},{x:12,y:0},{x:12,y:8},{x:6,y:10},{x:0,y:8}];
const concave=[{x:0,y:0},{x:12,y:0},{x:12,y:5},{x:7,y:5},{x:7,y:11},{x:0,y:11}];
test('024 P1: convex polygon retained as one convex cell',()=>{
  const cells=partitionPropertyPolygon024(pentagon);
  assert.equal(cells.length,1);
  assert.equal(convexPropertyPolygon024(pentagon),true);
  assert.notEqual(cells[0],pentagon);
  assert.deepEqual(cells[0],pentagon);
});
test('024 P1: concave L-shape decomposed into complete nonoverlapping convex cells',()=>{
  assert.equal(shapeWellFormed(concave),true);
  assert.equal(convexPropertyPolygon024(concave),false);
  const cells=partitionPropertyPolygon024(concave);
  assert.ok(cells.length>=2);
  assert.ok(cells.every(convexPropertyPolygon024));
  assert.ok(Math.abs(cells.reduce((s,c)=>s+polygonSignedArea(c),0)-polygonSignedArea(concave))<1e-7);
});
test('024 P1: degenerate, reversed, crossing and unsupported-size polygons fail closed',()=>{
  const reverse=[...pentagon].reverse();
  const crossed=[{x:0,y:0},{x:4,y:4},{x:0,y:4},{x:4,y:0}];
  const tooLarge=Array.from({length:13},(_,i)=>({
    x:10*Math.cos(i*2*Math.PI/13),y:10*Math.sin(i*2*Math.PI/13)
  }));
  for(const bad of [reverse,crossed,tooLarge]){
    assert.throws(()=>partitionPropertyPolygon024(bad));
  }
});
test('024 P5: morphology generation is deterministic and schema-9 compatible',()=>{
  let irregular=0;
  for(const morphology of ['organic','radial','linear','planned']){
    for(const seed of ['024-irregular-one','024-irregular-two']){
      const params={seed,size:'small',morphology,irregularProperties:true};
      const project=createProject(params);
      const again=createProject(params);
      assert.deepEqual(project.city,again.city,'Same seed must be bit-for-bit deterministic.');
      assert.equal(project.schemaVersion,10);
      assert.doesNotThrow(()=>validateStoredProject(project));
      const encoded=encodeProjectDocument(createProjectDocument(project,defaultWorkspace(project)));
      const decoded=decodeProjectDocument(encoded);
      assert.equal(JSON.stringify(decoded.project.city),JSON.stringify(project.city));
      for(const property of project.city.properties){
        assert.ok(property.boundary.length>=3);
        if(property.boundary.length>4)irregular++;
      }
    }
  }
  assert.ok(irregular>0,'Eligible morphology/blocks should produce genuinely irregular properties.');
});
test('024 P2/P3: a vertex draft is detached and applies atomically with Undo/Redo',()=>{
  const project=createProject({seed:'024-manual-polygon',size:'small',morphology:'planned'});
  const initial=JSON.stringify(project.city);
  let receipt=null,subject=null;
  for(const property of project.city.properties.filter(p=>p.boundary.length===4&&p.plotIds.length===1)){
    const session=new PropertyEditSession3I();
    if(!session.start(project.city,property.id)||!session.addVertex(2))continue;
    assert.equal(session.boundary.length,5);
    assert.equal(session.polygonMode,true);
    assert.equal(session.isPending,true);
    const result=preparePropertyApply3I(project,defaultWorkspace(project),session);
    if(result.ok){receipt=result;subject=property;break;}
  }
  assert.ok(receipt,'A five-vertex editing candidate should be valid on an eligible parcel.');
  assert.equal(JSON.stringify(project.city),initial,'Draft and Apply candidate must not change accepted city.');
  const candidate=receipt.candidate;
  const after=candidate.city.properties.find(p=>p.id===subject.id);
  assert.equal(after.boundary.length,5);
  assert.deepEqual(after.plotIds,subject.plotIds);
  validateStoredProject(candidate);
  const saved=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,defaultWorkspace(candidate))));
  assert.deepEqual(saved.project.city,candidate.city);
  const history=new PropertyGeometryHistory3I(20);
  assert.equal(history.record(project,candidate,subject.id),true);
  const undo=history.prepare(candidate,defaultWorkspace(candidate),subject.id,'undo');
  assert.equal(undo.ok,true,undo.reason);
  assert.deepEqual(undo.candidate.city.properties.find(p=>p.id===subject.id).boundary,subject.boundary);
  history.accept(undo.entry,'undo');
  const redo=history.prepare(undo.candidate,defaultWorkspace(undo.candidate),subject.id,'redo');
  assert.equal(redo.ok,true,redo.reason);
  assert.deepEqual(redo.candidate.city.properties.find(p=>p.id===subject.id).boundary,after.boundary);
  const editAgain=new PropertyEditSession3I();
  assert.equal(editAgain.start(candidate.city,subject.id),true,'Irregular polygons remain editable after save.');
  assert.equal(editAgain.removeVertex(3),true);
  assert.equal(editAgain.boundary.length,4);
});
test('024 P3: annotated plot metadata cannot be silently retiled',()=>{
  const project=createProject({seed:'024-protect-annotation',size:'small',morphology:'planned'});
  const property=project.city.properties.find(p=>p.boundary.length===4&&p.plotIds.length===1);
  assert.ok(property);
  const plot=project.city.plots.find(p=>p.id===property.plotIds[0]);
  plot.authoredNote='Protected plot data';
  const previous=JSON.stringify(project.city);
  const session=new PropertyEditSession3I();
  assert.ok(session.start(project.city,property.id));
  session.addVertex(2);
  const validation=inspectPropertyEdit3I(project,session);
  assert.equal(validation.ok,false);
  assert.ok(validation.issues.some(issue=>issue.code==='authorship'));
  assert.equal(preparePropertyApply3I(project,defaultWorkspace(project),session).candidate,null);
  assert.equal(JSON.stringify(project.city),previous);
});

function historicalIrregularFrontageFixture(){
  const base=createProject({seed:'024-manual-polygon',size:'small',morphology:'planned'});
  for(const property of base.city.properties.filter(p=>p.boundary.length===4&&p.plotIds.length===1)){
    const draft=new PropertyEditSession3I();
    if(!draft.start(base.city,property.id)||!draft.addVertex(2))continue;
    const made=preparePropertyApply3I(base,defaultWorkspace(base),draft);
    if(!made.ok)continue;
    const project=made.candidate,accepted=project.city.properties.find(p=>p.id===property.id);
    // Model an accepted historical frontage whose saved street frame is slightly
    // misaligned. The original parcel and plot geometry remain valid and saved.
    const {inward,tangent}=accepted.frame;
    accepted.frame.inward={x:inward.x+.02*tangent.x,y:inward.y+.02*tangent.y};
    validateStoredProject(project);
    return {project,id:property.id};
  }
  throw Error('Could not construct a valid accepted irregular property fixture.');
}

test('irregular property: an existing frontage does not block a side/rear edit',()=>{
  const {project,id}=historicalIrregularFrontageFixture();
  const before=JSON.stringify(project.city);
  const accepted=project.city.properties.find(p=>p.id===id);
  const session=new PropertyEditSession3I();
  assert.equal(session.start(project.city,id),true);
  assert.equal(session.addVertex(3),true,'A side/rear corner may be inserted');
  assert.equal(session.frontageChanged,false);
  const inspected=inspectPropertyEdit3I(project,session);
  assert.equal(inspected.ok,true,JSON.stringify(inspected.issues));
  const result=preparePropertyApply3I(project,defaultWorkspace(project),session);
  assert.equal(result.ok,true,JSON.stringify(result.issues));
  const updated=result.candidate.city.properties.find(p=>p.id===id);
  assert.equal(updated.boundary.length,6);
  assert.deepEqual(updated.boundary.slice(0,2),accepted.boundary.slice(0,2));
  assert.deepEqual(updated.frontage,accepted.frontage);
  assert.deepEqual(updated.frame,accepted.frame);
  assert.equal(JSON.stringify(project.city),before,'The accepted city is not mutated by preview/Apply');
  validateStoredProject(result.candidate);
  const opened=decodeProjectDocument(encodeProjectDocument(createProjectDocument(result.candidate,defaultWorkspace(result.candidate))));
  assert.deepEqual(opened.project.city,result.candidate.city,'Portable save/open must retain geometry and frame');
  const history=new PropertyGeometryHistory3I(20);
  assert.equal(history.record(project,result.candidate,id),true);
  const undo=history.prepare(result.candidate,defaultWorkspace(result.candidate),id,'undo');
  assert.equal(undo.ok,true,undo.reason);
  assert.deepEqual(undo.candidate.city.properties.find(p=>p.id===id).boundary,accepted.boundary);
  history.accept(undo.entry,'undo');
  const redo=history.prepare(undo.candidate,defaultWorkspace(undo.candidate),id,'redo');
  assert.equal(redo.ok,true,redo.reason);
  assert.deepEqual(redo.candidate.city.properties.find(p=>p.id===id).boundary,updated.boundary);
});

test('irregular property: changed frontage rejects unsafe alignment and restores only the frontage',()=>{
  const {project,id}=historicalIrregularFrontageFixture();
  const before=JSON.stringify(project.city);
  const session=new PropertyEditSession3I();
  session.start(project.city,id);
  assert.equal(session.addVertex(3),true);
  const tip=session.boundary[1],inward=session.source(project.city).frame.inward;
  assert.equal(session.setCorner(1,{x:tip.x+inward.x*.5,y:tip.y+inward.y*.5}),true);
  assert.equal(session.frontageChanged,true);
  const invalid=inspectPropertyEdit3I(project,session);
  assert.equal(invalid.ok,false);
  assert.ok(invalid.issues.some(issue=>issue.code==='frontage'&&/Restore frontage/.test(issue.message)),
    JSON.stringify(invalid.issues));
  assert.equal(preparePropertyApply3I(project,defaultWorkspace(project),session).candidate,null);
  assert.equal(session.restoreFrontage(),true);
  assert.equal(session.frontageChanged,false);
  assert.equal(session.boundary.length,6,'Side/rear draft edits survive frontage restoration');
  assert.equal(session.isPending,true);
  assert.equal(inspectPropertyEdit3I(project,session).ok,true);
  assert.equal(session.restoreFrontage(),false,'No second restore when the accepted frontage is intact');
  assert.equal(JSON.stringify(project.city),before,'Failed Apply and Restore must not mutate accepted state');
});
