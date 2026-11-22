import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {createProject} from '../src/core/city-model.js';
import {prepareNeighborhoodReflowC3} from '../src/core/neighborhood-reflow.js';
import {defaultWorkspace} from '../src/data/project-format.js';
import {observeBuildingApp} from '../tests/helpers/building-app.js';

const street='RD-0116',offset={x:5,y:0};
function fixture(){
 const original=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
 const first=prepareNeighborhoodReflowC3(original,street,offset);
 for(const row of first.ledger.filter(x=>x.kind==='property'&&x.disposition==='reshaped')){
   const project=structuredClone(original);
   const property=project.city.properties.find(p=>p.id===row.oldId);
   property.customName='B05 named yard';
   const blocked=prepareNeighborhoodReflowC3(project,street,offset);
   const offer=blocked.parcelReview?.find(p=>p.id===property.id);
   if(!offer?.options.some(o=>o.kind==='reshape'))continue;
   const result=prepareNeighborhoodReflowC3(project,street,offset,undefined,new Map(),
     {parcelChoices:new Map([[property.id,{kind:'reshape'}]])});
   if(result.candidateProject)return {project,id:property.id};
 }
 throw Error('B05 browser fixture lacks one valid authored parcel choice.');
}
const {project,id}=fixture();
const html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const origin='http://mappo-b05-028.test/';
await mkdir(new URL('../artifacts/road-parcels-028/',import.meta.url),{recursive:true});
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
 const browser=await engine.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 page.setDefaultTimeout(35000);
 try{
   await page.route('**/*',route=>route.request().url().startsWith(origin)
     ?route.fulfill({contentType:'text/html',body:html}):route.abort());
   await page.goto(origin,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>__buildingQA?.state().files.ready);
   await page.evaluate(doc=>__buildingQA.apply(doc),{project,workspace:defaultWorkspace(project)});
   await page.locator('#roadModeButton').click();
   await page.evaluate(({street,offset})=>{
     const s=__buildingQA.state().roadWorkspace.session;
     s.schedule=fn=>{fn();};
     s.select({kind:'road',id:street});
     s.updateRoadIntent(offset,{defer:false});
   },{street,offset});
   await page.waitForFunction(id=>{
     const s=__buildingQA.state().roadWorkspace.session;
     return !s.checking&&s.settledRevision===s.revision&&
       s.reconciliation?.parcelReview?.some(p=>p.id===id);
   },id,{timeout:60000});
   const before=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
   assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
   assert.equal(await page.locator('#roadParcelDecisions028').isVisible(),true);
   const options=page.locator('#roadParcelConflict028-'+id+' button');
   await options.filter({hasText:'Reshape'}).first().click();
   await page.waitForFunction(id=>{
     const s=__buildingQA.state().roadWorkspace.session;
     return !s.checking&&s.settledRevision===s.revision&&s.parcelChoices.has(id)&&s.hasApplyCandidate;
   },id,{timeout:60000});
   assert.equal(await page.locator('#roadApplyB4').isEnabled(),true,
     await page.locator('#roadApplyStatusB4').innerText());
   assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),before);
   await page.locator('#roadApplyB4').click();
   await page.waitForFunction(before=>JSON.stringify(__buildingQA.state().project)!==before,before,{timeout:60000});
   const after=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
   assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('undo')),true);
   assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),before);
   assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('redo')),true);
   assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),after);
   assert.deepEqual(errors,[]);
   console.log('PASS B05 0.2.8 authored parcel choice, Apply, Undo/Redo '+name);
 }catch(error){
   await page.screenshot({path:new URL('../artifacts/road-parcels-028/'+name+'-failure.png',import.meta.url).pathname,
     fullPage:true}).catch(()=>{});
   throw new Error(name+': '+error.message,{cause:error});
 }finally{await page.close();await browser.close();}
}
