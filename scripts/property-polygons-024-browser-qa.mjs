// Mappo 0.2.4 real desktop browser acceptance: vertex editing and history.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {createProject} from '../src/core/city-model.js';
import {defaultWorkspace} from '../src/data/project-format.js';
import {PropertyEditSession3I} from '../src/editor/property-edit.js';
import {preparePropertyApply3I} from '../src/editor/property-application.js';
import {observeBuildingApp} from '../tests/helpers/building-app.js';

function fixture(){
  const project=createProject({seed:'024-browser-edit',morphology:'planned',size:'small'});
  for(const p of project.city.properties){
    const session=new PropertyEditSession3I();
    if(p.plotIds.length!==1||p.boundary.length!==4||
       !session.start(project.city,p.id)||!session.addVertex(2))continue;
    const result=preparePropertyApply3I(project,defaultWorkspace(project),session);
    if(result.ok)return {project,workspace:defaultWorkspace(project),id:p.id};
  }
  throw Error('No validated five-corner edit fixture available.');
}
const sample=fixture();
const html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const origin='http://mappo-polygons-024.test/';
await mkdir(new URL('../artifacts/polygons-024/',import.meta.url),{recursive:true});
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(35000);
  try{
    await page.route('**/*',route=>route.request().url().startsWith(origin)
      ?route.fulfill({contentType:'text/html',body:html}):route.abort());
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>__buildingQA?.state().files.ready);
    await page.evaluate(doc=>__buildingQA.apply(doc),{project:sample.project,workspace:sample.workspace});
    const before=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
    await page.evaluate(id=>__buildingQA.state().workspaceShell.select({kind:'property',id}),sample.id);
    await page.getByRole('button',{name:/^(Edit property geometry|Edit boundaries & plots)$/}).click();
    assert.equal(await page.locator('#propertyEditPanel3I').isVisible(),true);
    assert.equal(await page.locator('#propertyAddVertex024').isEnabled(),true);
    await page.locator('#propertyAddVertex024').click();
    assert.equal(await page.evaluate(()=>__buildingQA.state().propertyEditSession.boundary.length),5);
    assert.equal(await page.locator('#propertyEditApply3I').isEnabled(),true,
      await page.locator('#propertyEditStatus3I').innerText());
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),before);
    await page.locator('#propertyEditReset3I').click();
    assert.equal(await page.evaluate(()=>__buildingQA.state().propertyEditSession.boundary.length),4);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),before);
    await page.locator('#propertyAddVertex024').click();
    await page.locator('#propertyEditApply3I').click();
    const after=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
    assert.notEqual(after,before);
    assert.equal(await page.evaluate(id=>__buildingQA.state().project.city.properties.find(p=>p.id===id).boundary.length,sample.id),5);
    await page.locator('#propertyAddVertex024').click();
    assert.equal(await page.evaluate(()=>__buildingQA.state().propertyEditSession.boundary.length),6);
    await page.evaluate(()=>{
      const state=__buildingQA.state(),session=state.propertyEditSession;
      const tip=session.boundary[1],inward=session.source(state.project.city).frame.inward;
      session.setCorner(1,{x:tip.x+inward.x*.5,y:tip.y+inward.y*.5});
    });
    assert.match(await page.locator('#propertyEditIssues3I').innerText(),/Restore frontage/);
    assert.equal(await page.locator('#propertyEditApply3I').isDisabled(),true);
    assert.equal(await page.locator('#propertyRestoreFrontage024').isEnabled(),true);
    await page.locator('#propertyRestoreFrontage024').click();
    assert.equal(await page.evaluate(()=>__buildingQA.state().propertyEditSession.frontageChanged),false);
    assert.equal(await page.evaluate(()=>__buildingQA.state().propertyEditSession.boundary.length),6);
    assert.equal(await page.locator('#propertyEditApply3I').isEnabled(),true,
      await page.locator('#propertyEditStatus3I').innerText());
    await page.locator('#propertyEditReset3I').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),after);
    await page.locator('#propertyHistoryUndo3I').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),before);
    await page.locator('#propertyHistoryRedo3I').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),after);
    const saved=await page.evaluate(()=>__buildingQA.capture());
    await page.evaluate(doc=>__buildingQA.apply(doc),saved);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),after);
    assert.deepEqual(errors,[]);
    console.log('PASS 0.2.4 '+name+' vertex edit/reset/Apply/Undo/Redo/save');
  }catch(error){
    await page.screenshot({path:new URL('../artifacts/polygons-024/'+name+'-failure.png',import.meta.url).pathname,
      fullPage:true}).catch(()=>{});
    throw new Error(name+': '+error.message,{cause:error});
  }finally{await page.close();await browser.close();}
}
