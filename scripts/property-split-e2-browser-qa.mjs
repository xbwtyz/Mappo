// E2 browser acceptance against the compiled offline HTML: Chromium/Firefox,
// desktop and phone. No production-only QA globals; the shared test observer is injected.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {createProject} from '../src/core/city-model.js';
import {defaultWorkspace} from '../src/data/project-format.js';
import {preparePropertyBuildingClear4E} from '../src/editor/property-building-clear-4e.js';
import {PropertySplitSessionE2,inspectPropertySplitE2} from '../src/editor/property-split-e2.js';
import {observeBuildingApp} from '../tests/helpers/building-app.js';

function splitFixture(){
  const project=createProject({seed:'e2-browser-qa',size:'small',morphology:'planned'});
  for(const row of project.city.properties){
    const length=Math.hypot(row.boundary[1].x-row.boundary[0].x,row.boundary[1].y-row.boundary[0].y);
    if(row.boundary.length!==4||length<17)continue;
    const cleared=row.buildingIds.length
      ?preparePropertyBuildingClear4E(project,defaultWorkspace(project),row.id)
      :{ok:true,candidate:project};
    if(!cleared.ok)continue;
    const original=cleared.candidate,session=new PropertySplitSessionE2();
    session.start(original.city,row.id);
    if(!inspectPropertySplitE2(original,session).ok)continue;
    return {project:original,workspace:defaultWorkspace(original),propertyId:row.id};
  }
  throw Error('E2 QA could not identify a valid four-corner split fixture.');
}
const fixture=splitFixture();
const html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const screenshots=new URL('../artifacts/e2/',import.meta.url);
await mkdir(screenshots,{recursive:true});
const failures=[];
for(const [engineName,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch({headless:true});
  try{
    for(const viewport of [{name:'desktop',width:1440,height:900},{name:'phone',width:390,height:844}]){
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
        const before=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
        const initialCount=fixture.project.city.properties.length;
        const initialPlots=fixture.project.city.plots.length;

        const enter=async()=>{
          await page.evaluate(id=>__buildingQA.state().workspaceShell.select({kind:'property',id}),fixture.propertyId);
          if(viewport.name==='phone'&&await page.locator('#workspaceOpenInspector').isVisible()
            &&!(await page.locator('#workspaceInspector').isVisible()))
            await page.locator('#workspaceOpenInspector').click();
          const action=page.getByRole('button',{name:'Split property',exact:true});
          await action.click();
          assert.equal(await page.locator('#propertySplitPanelE2').isVisible(),true);
        };
        await enter();
        assert.equal(await page.locator('#propertySplitApplyE2').isEnabled(),true);
        assert.match(await page.locator('#propertySplitSummaryE2').innerText(),/Left:.*Right:/);
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),before);

        // Invalid very narrow child cannot be committed.
        await page.locator('#propertySplitPercentE2').fill('1');
        await page.locator('#propertySplitPercentE2').press('Tab');
        assert.equal(await page.locator('#propertySplitApplyE2').isDisabled(),true);
        await page.locator('#propertySplitResetE2').click();
        assert.equal(await page.locator('#propertySplitApplyE2').isEnabled(),true);
        await page.locator('#propertySplitCancelE2').click();
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),before);
        await enter();

        await page.locator('#propertySplitPercentE2').fill('50');
        await page.locator('#propertySplitPercentE2').press('Tab');
        const revision=await page.evaluate(()=>__buildingQA.state().files.revision);
        await page.locator('#propertySplitApplyE2').click();
        await page.waitForFunction(()=>!__buildingQA.state().propertySplitE2.active);
        const accepted=await page.evaluate(()=>({
          city:JSON.stringify(__buildingQA.state().project.city),
          properties:__buildingQA.state().project.city.properties.length,
          plots:__buildingQA.state().project.city.plots.length,
          revision:__buildingQA.state().files.revision
        }));
        assert.notEqual(accepted.city,before);
        assert.equal(accepted.properties,initialCount+1);
        assert.equal(accepted.plots,initialPlots+1);
        // ProjectFiles.revision also tracks Inspector/selection changes and is
        // not the structural transaction counter. A split must notify recovery,
        // but exactly one whole-city history entry is the atomicity invariant.
        assert.ok(accepted.revision>=revision+1,'Accepted split must update file/recovery revision');
        assert.equal(await page.evaluate(()=>__buildingQA.state().propertySplitE2.history.past.length),1,
          'One Apply must create one structural split history transaction');

        if(viewport.name==='phone'){
          if(await page.locator('#workspaceCloseInspector').isVisible())await page.locator('#workspaceCloseInspector').click();
          if(await page.locator('#workspaceOpenTools').isVisible())await page.locator('#workspaceOpenTools').click();
        }
        await page.locator('#propertySplitUndoE2').click();
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),before);
        await page.locator('#propertySplitRedoE2').click();
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),accepted.city);

        const saved=await page.evaluate(()=>__buildingQA.capture());
        await page.evaluate(doc=>__buildingQA.apply(doc),saved);
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),accepted.city);
        assert.equal(await page.evaluate(()=>__buildingQA.state().propertySplitE2.history.can('undo',__buildingQA.state().project)),false);
        assert.deepEqual(errors,[]);
        console.log('PASS E2 '+label+' preview/reset/cancel/Apply/Undo/Redo/save');
      }catch(error){
        failures.push(label+': '+error.message);
        console.error('FAIL E2 '+label+': '+error.stack);
        await page.screenshot({path:new URL(label.replace('/','-')+'-failure.png',screenshots).pathname}).catch(()=>{});
      }finally{await page.close();}
    }
  }finally{await browser.close();}
}
if(failures.length)throw Error('E2 browser acceptance failed:\n'+failures.join('\n'));
