// E1 end-to-end acceptance on the compiled offline HTML, Chromium and Firefox.
// Only test-origin page serving and the existing test-only QA observer are injected.
import assert from 'node:assert/strict';
import { readFile,mkdir } from 'node:fs/promises';
import { chromium,firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { preparePropertyDeletion4A } from '../src/editor/property-deletion.js';
import { inspectPropertyCreationE1 } from '../src/editor/property-creation-e1.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

function vacantFixture(){
  const original=createProject({seed:'e1-browser-qa',size:'small',morphology:'planned'});
  for(const property of original.city.properties){
    if(property.local?.width<10||property.local?.depth<12)continue;
    const removed=preparePropertyDeletion4A(original,defaultWorkspace(original),property.id);
    if(!removed.ok)continue;
    const draft={blockId:property.blockId,roadId:property.frontageRoadId,
      u:property.local.x+1,width:Math.min(10,property.local.width-2),
      depth:Math.min(12,property.local.depth-1)};
    if(!inspectPropertyCreationE1(removed.candidate,draft).ok)continue;
    const a=property.boundary[0],b=property.boundary[1],n=property.frame.inward;
    return {project:removed.candidate,workspace:defaultWorkspace(removed.candidate),
      target:{x:(a.x+b.x)/2+n.x*.4,y:(a.y+b.y)/2+n.y*.4},draft};
  }
  throw Error('No suitable land-reuse fixture for E1 browser QA');
}
const fixture=vacantFixture();
const html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const output=new URL('../artifacts/e1/',import.meta.url);
await mkdir(output,{recursive:true});
const failures=[];
for(const [engineName,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch({headless:true});
  try{
    for(const viewport of [{name:'desktop',width:1440,height:900},
      {name:'phone',width:390,height:844}]){
      const label=engineName+'/'+viewport.name;
      const page=await browser.newPage({viewport,hasTouch:viewport.name==='phone'});
      page.setDefaultTimeout(20000);
      const errors=[];
      page.on('pageerror',err=>errors.push(err.message));
      try{
        await page.route('**/*',route=>route.request().url()==='http://mappo.test/index.html'
          ?route.fulfill({contentType:'text/html',body:html}):route.abort());
        await page.goto('http://mappo.test/index.html',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>__buildingQA.state().files.ready);
        await page.evaluate(doc=>__buildingQA.apply(doc),{project:fixture.project,workspace:fixture.workspace});
        const cityBefore=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
        await page.locator('#propertyCreateStartE1').scrollIntoViewIfNeeded();
        await page.locator('#propertyCreateStartE1').click();
        assert.equal(await page.locator('#propertyCreatePanelE1').isVisible(),true);
        assert.equal(await page.locator('#propertyCreateApplyE1').isDisabled(),true);
        if(viewport.name==='phone'){
          if(await page.locator('#workspaceCollapseTools').isVisible())
            await page.locator('#workspaceCollapseTools').click();
          if(await page.locator('#workspaceCloseInspector').isVisible())
            await page.locator('#workspaceCloseInspector').click();
        }
        await page.locator('#mapCanvas').scrollIntoViewIfNeeded();
        const selectGround=async()=>{
          const p=await page.evaluate(target=>{
            const {camera}=__buildingQA.state();
            camera.zoom=2.2;camera.x=target.x;camera.y=target.y;
            __buildingQA.draw();
            return camera.worldToScreen(target);
          },fixture.target);
          const box=await page.locator('#mapCanvas').boundingBox();
          const click={x:box.x+p.x,y:box.y+p.y};
          const found=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.id,click);
          assert.equal(found,'mapCanvas','Open map ground must be reachable with E1 controls displayed');
          // Exercise an actual touch gesture on phone rather than a mouse event
          // against a touch-enabled viewport.
          if(viewport.name==='phone')await page.touchscreen.tap(click.x,click.y);
          else await page.mouse.click(click.x,click.y);
          await page.waitForFunction(()=>Boolean(__buildingQA.state().propertyCreationSessionE1?.draft));
        };
        const setValid=async()=>{
          await page.locator('#propertyCreateRoadE1').selectOption(fixture.draft.roadId);
          for(const [field,key] of [['#propertyCreateUE1','u'],['#propertyCreateWidthE1','width'],
            ['#propertyCreateDepthE1','depth']]){
            await page.locator(field).fill(String(fixture.draft[key]));
            await page.locator(field).press('Tab');
          }
          await page.waitForFunction(()=>!document.querySelector('#propertyCreateApplyE1').disabled);
          assert.match(await page.locator('#propertyCreateStatusE1').innerText(),/VALID/);
          assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),cityBefore);
        };
        await selectGround();
        assert.ok(await page.locator('#propertyCreateRoadE1').isEnabled());
        await setValid();
        await page.locator('#propertyCreateResetE1').click();
        assert.equal(await page.locator('#propertyCreateApplyE1').isDisabled(),true);
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),cityBefore);
        await selectGround();
        await setValid();
        const revision=await page.evaluate(()=>__buildingQA.state().files.revision);
        await page.locator('#propertyCreateApplyE1').click();
        await page.waitForFunction(()=>!__buildingQA.state().propertyCreationSessionE1.active);
        const accepted=await page.evaluate(()=>({
          city:JSON.stringify(__buildingQA.state().project.city),
          revision:__buildingQA.state().files.revision,
          newSite:__buildingQA.state().project.city.properties.at(-1)
        }));
        assert.notEqual(accepted.city,cityBefore);
        assert.equal(accepted.revision,revision+1,'One accepted edit creates one revision');
        assert.equal(accepted.newSite.usage,'undeveloped');
        assert.deepEqual(accepted.newSite.buildingIds,[]);
        if(viewport.name==='phone'){
          // Selecting the new parcel can reopen its Inspector overlay. Dismiss
          // that genuine user-facing surface before accessing the City history.
          if(await page.locator('#workspaceCloseInspector').isVisible())
            await page.locator('#workspaceCloseInspector').click();
          if(await page.locator('#workspaceOpenTools').isVisible())
            await page.locator('#workspaceOpenTools').click();
        }
        await page.locator('#propertyCreateUndoE1').click();
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),cityBefore);
        await page.locator('#propertyCreateRedoE1').click();
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),accepted.city);
        const saved=await page.evaluate(()=>__buildingQA.capture());
        await page.evaluate(doc=>__buildingQA.apply(doc),saved);
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),accepted.city);
        assert.equal(await page.evaluate(()=>__buildingQA.state().propertyCreationHistoryE1.can('undo',__buildingQA.state().project)),false);
        assert.deepEqual(errors,[]);
        console.log('PASS E1 '+label+' click-to-preview, cancel/reset, Apply, Undo/Redo, save/reopen');
      }catch(error){
        failures.push(label+': '+error.message);
        console.error('FAIL E1 '+label+': '+error.stack);
        await page.screenshot({path:new URL(label.replace('/','-')+'-failure.png',output).pathname}).catch(()=>{});
      }finally{await page.close();}
    }
  }finally{await browser.close();}
}
if(failures.length)throw Error('E1 browser acceptance failed:\n'+failures.join('\n'));
console.log('E1 browser QA: 4/4 accepted browser/viewport scenarios');
