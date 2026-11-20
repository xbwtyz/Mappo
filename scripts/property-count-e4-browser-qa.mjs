// E4 compiled standalone acceptance across desktop, phone, Chromium and Firefox.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {createProject} from '../src/core/city-model.js';
import {defaultWorkspace} from '../src/data/project-format.js';
import {PropertyEditSession3I} from '../src/editor/property-edit.js';
import {preparePropertyApply3I} from '../src/editor/property-application.js';
import {observeBuildingApp} from '../tests/helpers/building-app.js';

function fixture(){
  const project=createProject({seed:'e4-browser-qa',morphology:'planned',size:'small'});
  for(const p of project.city.properties){
    const session=new PropertyEditSession3I();
    if(!session.start(project.city,p.id)||!session.addDivider(project.city,0))continue;
    if(preparePropertyApply3I(project,defaultWorkspace(project),session).ok)
      return {project,workspace:defaultWorkspace(project),id:p.id};
  }
  throw Error('Missing viable plot split for browser acceptance.');
}
const sample=fixture(),html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const captures=new URL('../artifacts/e4/',import.meta.url);
await mkdir(captures,{recursive:true});
const failures=[];
for(const [browserName,engine] of [['chromium',chromium],['firefox',firefox]]){
 const browser=await engine.launch({headless:true});
 try{
  for(const viewport of [{label:'desktop',width:1440,height:900},{label:'phone',width:390,height:844}]){
   const label=browserName+'/'+viewport.label;
   const page=await browser.newPage({viewport,hasTouch:viewport.label==='phone'});
   page.setDefaultTimeout(20000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.route('**/*',route=>route.request().url()==='http://mappo.test/index.html'
      ?route.fulfill({contentType:'text/html',body:html}):route.abort());
    await page.goto('http://mappo.test/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    await page.evaluate(doc=>__buildingQA.apply(doc),{project:sample.project,workspace:sample.workspace});
    const original=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
    const count=sample.project.city.plots.length;
    await page.evaluate(id=>__buildingQA.state().workspaceShell.select({kind:'property',id}),sample.id);
    if(viewport.label==='phone'&&await page.locator('#workspaceOpenInspector').isVisible()&&
       !(await page.locator('#workspaceInspector').isVisible()))
      await page.locator('#workspaceOpenInspector').click();
    await page.getByRole('button',{name:'Edit property geometry',exact:true}).click();
    assert.equal(await page.locator('#propertyEditPanel3I').isVisible(),true);
    await page.locator('#propertyAddDividerE4').click();
    assert.match(await page.locator('#propertyCountSummaryE4').innerText(),/Split plot/);
    assert.equal(await page.locator('#propertyEditApply3I').isEnabled(),true);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),original);
    await page.locator('#propertyEditReset3I').click();
    assert.equal(await page.locator('#propertyEditApply3I').isDisabled(),true);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),original);
    await page.locator('#propertyAddDividerE4').click();
    const revision=await page.evaluate(()=>__buildingQA.state().files.revision);
    await page.locator('#propertyEditApply3I').click();
    const accepted=await page.evaluate(()=>({
      city:JSON.stringify(__buildingQA.state().project.city),
      plots:__buildingQA.state().project.city.plots.length,
      history:__buildingQA.state().propertyHistory.count('undo',__buildingQA.state().propertyEditSession.propertyId),
      revision:__buildingQA.state().files.revision
    }));
    assert.notEqual(accepted.city,original);
    assert.equal(accepted.plots,count+1);
    assert.equal(accepted.history,1);
    assert.ok(accepted.revision>=revision+1);
    await page.locator('#propertyHistoryUndo3I').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),original);
    await page.locator('#propertyHistoryRedo3I').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),accepted.city);
    const saved=await page.evaluate(()=>__buildingQA.capture());
    await page.evaluate(doc=>__buildingQA.apply(doc),saved);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),accepted.city);
    assert.equal(await page.evaluate(()=>__buildingQA.state().propertyHistory.can(
      'undo',__buildingQA.state().project,sample.id)),false);
    assert.deepEqual(errors,[]);
    console.log('PASS E4 '+label+' draft/reset/Apply/Undo/Redo/save');
   }catch(error){
    failures.push(label+': '+error.message);
    console.error('FAIL E4 '+label+': '+error.stack);
    await page.screenshot({path:new URL(label.replace('/','-')+'-failure.png',captures).pathname}).catch(()=>{});
   }finally{await page.close();}
  }
 }finally{await browser.close();}
}
if(failures.length)throw Error('E4 browser acceptance failed:\n'+failures.join('\n'));
