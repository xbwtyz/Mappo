// E3 compiled offline acceptance: Chromium/Firefox at desktop and phone widths.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {createProject} from '../src/core/city-model.js';
import {defaultWorkspace} from '../src/data/project-format.js';
import {preparePropertyBuildingClear4E} from '../src/editor/property-building-clear-4e.js';
import {PropertySplitSessionE2,inspectPropertySplitE2,preparePropertySplitE2} from '../src/editor/property-split-e2.js';
import {PropertyMergeSessionE3,inspectPropertyMergeE3} from '../src/editor/property-merge-e3.js';
import {observeBuildingApp} from '../tests/helpers/building-app.js';

function mergeFixture(){
  const project=createProject({seed:'e3-browser-qa',size:'small',morphology:'planned'});
  for(const row of project.city.properties){
    if(row.boundary.length!==4)continue;
    const cleared=row.buildingIds.length
      ?preparePropertyBuildingClear4E(project,defaultWorkspace(project),row.id)
      :{ok:true,candidate:project};
    if(!cleared.ok)continue;
    const original=cleared.candidate,split=new PropertySplitSessionE2();
    if(!split.start(original.city,row.id)||!inspectPropertySplitE2(original,split).ok)continue;
    const result=preparePropertySplitE2(original,defaultWorkspace(original),split);
    if(!result.ok)continue;
    const merge=new PropertyMergeSessionE3();
    merge.start(result.candidate.city,result.sourcePropertyId);
    merge.choose(result.candidate.city,result.newPropertyId);
    if(inspectPropertyMergeE3(result.candidate,merge).ok)
      return {project:result.candidate,workspace:defaultWorkspace(result.candidate),
        primaryId:result.sourcePropertyId,secondaryId:result.newPropertyId};
  }
  throw Error('No valid E2 sibling pair for E3 browser acceptance.');
}
const fixture=mergeFixture();
const html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const captures=new URL('../artifacts/e3/',import.meta.url);
await mkdir(captures,{recursive:true});
const failures=[];
for(const [engineName,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch({headless:true});
  try{
    for(const viewport of [{name:'desktop',width:1440,height:900},{name:'phone',width:390,height:844}]){
      const label=engineName+'/'+viewport.name,page=await browser.newPage({
        viewport,hasTouch:viewport.name==='phone'});
      page.setDefaultTimeout(20000);
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      try{
        await page.route('**/*',route=>route.request().url()==='http://mappo.test/index.html'
          ?route.fulfill({contentType:'text/html',body:html}):route.abort());
        await page.goto('http://mappo.test/index.html',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>__buildingQA.state().files.ready);
        await page.evaluate(doc=>__buildingQA.apply(doc),{
          project:fixture.project,workspace:fixture.workspace});
        const original=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
        const initialCount=fixture.project.city.properties.length,
          initialPlots=fixture.project.city.plots.length;
        const enter=async()=>{
          await page.evaluate(id=>__buildingQA.state().workspaceShell.select(
            {kind:'property',id}),fixture.primaryId);
          if(viewport.name==='phone'&&await page.locator('#workspaceOpenInspector').isVisible()
            &&!(await page.locator('#workspaceInspector').isVisible()))
            await page.locator('#workspaceOpenInspector').click();
          await page.getByRole('button',{name:'Merge properties',exact:true}).click();
          assert.equal(await page.locator('#propertyMergePanelE3').isVisible(),true);
          await page.locator('#propertyMergeNeighborE3').selectOption(fixture.secondaryId);
        };
        await enter();
        assert.equal(await page.locator('#propertyMergeApplyE3').isEnabled(),true);
        assert.match(await page.locator('#propertyMergeSummaryE3').innerText(),/Combined/);
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),original);
        await page.locator('#propertyMergeResetE3').click();
        assert.equal(await page.locator('#propertyMergeApplyE3').isDisabled(),true);
        await page.locator('#propertyMergeCancelE3').click();
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),original);
        await enter();
        const revision=await page.evaluate(()=>__buildingQA.state().files.revision);
        await page.locator('#propertyMergeApplyE3').click();
        await page.waitForFunction(()=>!__buildingQA.state().propertyMergeE3.active);
        const accepted=await page.evaluate(()=>({
          city:JSON.stringify(__buildingQA.state().project.city),
          properties:__buildingQA.state().project.city.properties.length,
          plots:__buildingQA.state().project.city.plots.length,
          revision:__buildingQA.state().files.revision,
          history:__buildingQA.state().propertyMergeE3.history.past.length
        }));
        assert.notEqual(accepted.city,original);
        assert.equal(accepted.properties,initialCount-1);
        assert.equal(accepted.plots,initialPlots);
        assert.ok(accepted.revision>=revision+1);
        assert.equal(accepted.history,1);
        if(viewport.name==='phone'){
          if(await page.locator('#workspaceCloseInspector').isVisible())
            await page.locator('#workspaceCloseInspector').click();
          if(await page.locator('#workspaceOpenTools').isVisible())
            await page.locator('#workspaceOpenTools').click();
        }
        await page.locator('#propertyMergeUndoE3').click();
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),original);
        await page.locator('#propertyMergeRedoE3').click();
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),accepted.city);
        const saved=await page.evaluate(()=>__buildingQA.capture());
        await page.evaluate(doc=>__buildingQA.apply(doc),saved);
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),accepted.city);
        assert.equal(await page.evaluate(()=>__buildingQA.state().propertyMergeE3.history.can(
          'undo',__buildingQA.state().project)),false);
        assert.deepEqual(errors,[]);
        console.log('PASS E3 '+label+' preview/reset/cancel/Apply/Undo/Redo/save');
      }catch(error){
        failures.push(label+': '+error.message);
        console.error('FAIL E3 '+label+': '+error.stack);
        await page.screenshot({path:new URL(label.replace('/','-')+'-failure.png',captures).pathname}).catch(()=>{});
      }finally{await page.close();}
    }
  }finally{await browser.close();}
}
if(failures.length)throw Error('E3 browser acceptance failed:\n'+failures.join('\n'));
