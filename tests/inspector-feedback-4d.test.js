import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { propertyOverview4D,formatEditIssue4D } from '../src/core/inspector-feedback-4d.js';
import { propertyInformation } from '../src/core/selection-information.js';

test('Dev4d property facts are read-only and distinguish unbuilt estimate from buildability',()=>{
 const city=createProject({seed:'4d-inspector-facts',size:'small',morphology:'organic'}).city;
 const p=city.properties.find(x=>x.buildingIds.length>0);
 assert.ok(p);
 const snapshot=JSON.stringify(city),summary=propertyOverview4D(city,p);
 const occupied=city.buildings.filter(x=>x.propertyId===p.id).reduce((s,b)=>s+b.area,0);
 assert.ok(Math.abs(summary.estimatedUnbuiltArea-Math.max(0,p.area-occupied))<1e-6);
 assert.ok(summary.frontageLength>0);
 assert.equal(summary.plots,p.plotIds.length);
 assert.equal(summary.buildings,p.buildingIds.length);
 const info=propertyInformation(city,p);
 const facts=Object.fromEntries(info.sections.flatMap(s=>s.rows));
 assert.match(facts['Estimated unbuilt area'],/survey units/);
 assert.match(facts['Unbuilt area note'],/not guaranteed/i);
 assert.match(facts['Street frontage length'],/survey units/);
 assert.equal(JSON.stringify(city),snapshot);
});
test('Dev4d zero/multiple buildings and rename/delete states have freshly derived facts',()=>{
 const property={id:'p',area:50,boundary:[{x:0,y:0},{x:10,y:0},{x:10,y:5},{x:0,y:5}],plotIds:['a'],buildingIds:[]};
 const city={buildings:[],properties:[property],roads:[],plots:[]};
 assert.deepEqual(propertyOverview4D(city,property),{area:50,frontageLength:10,plots:1,buildings:0,estimatedUnbuiltArea:50});
 property.buildingIds=['b1','b2'];city.buildings=[{id:'b1',propertyId:'p',area:12},{id:'b2',propertyId:'p',area:18}];
 assert.equal(propertyOverview4D(city,property).estimatedUnbuiltArea,20);
 property.customName='Renamed';assert.match(propertyInformation(city,property).title,/Renamed/);
 const old=JSON.stringify(city);
 assert.equal(propertyOverview4D(city,{...property,id:'deleted',buildingIds:[]}).estimatedUnbuiltArea,50);
 assert.equal(propertyOverview4D(city,null),null);
 assert.equal(JSON.stringify(city),old);
});
test('Dev4d issues keep explicit identifiers, original reason and concrete remedies',()=>{
 for(const [code,id,label,remedy] of [
  ['setback','RD-42','Road RD-42','setback'],
  ['neighbor','PROP-2','Neighbor property PROP-2','boundary'],
  ['collision','BLD-3','Building BLD-3','shrink'],
  ['block','BLOCK-4','Block BLOCK-4','block'],
  ['building','BLD-5','Building BLD-5','reposition']]){
  const s=formatEditIssue4D({code,targetId:id,message:'Geometry conflict.'});
  assert.ok(s.startsWith(label+':'),s);assert.ok(s.includes('Geometry conflict.'));
  assert.match(s,new RegExp(remedy,'i'));
 }
 assert.match(formatEditIssue4D({code:'access',message:'Entrance blocked.'},{frontageRoadId:'ROAD-9'}),/Road ROAD-9.*frontage road/);
 assert.match(formatEditIssue4D({code:'plots',message:'No plot.'},{propertyId:'PROP-8'}),/Property PROP-8.*valid plots/);
 assert.match(formatEditIssue4D({code:'unknown',message:'Custom constraint.'}),/Custom constraint/);
});
