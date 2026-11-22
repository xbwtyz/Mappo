import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {createProject} from '../src/core/city-model.js';
import {defaultWorkspace} from '../src/data/project-format.js';
import {observeBuildingApp} from '../tests/helpers/building-app.js';

// Both native browser engines exercise the real Roads review and fresh Apply.
const html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const origin='http://mappo-ownership-023.test/';
await mkdir(new URL('../artifacts/ownership-023/',import.meta.url),{recursive:true});
for(const [name,engine] of [['chromium',chromium],['firefox',firefox']]){
  const browser=await engine.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(35000);
  try{
    await page.route('**/*',route=>route.request().url().startsWith(origin)
      ? route.fulfill({contentType:'text/html',body:html}) : route.abort());
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>__buildingQA?.state().files.ready);
    for(const kind of ['junction','road']){
      const project=createProject({seed:kind==='junction'?'c2-planned':'c2-radial',
        size:'small',morphology:kind==='junction'?'planned':'radial'});
      await page.evaluate(doc=>__buildingQA.apply(doc),{project,workspace:defaultWorkspace(project)});
      await page.locator('#roadModeButton').click();
      await page.evaluate(kind=>{
        const app=__buildingQA.state(),s=app.roadWorkspace.session;
        if(kind==='junction'){
          const target=app.project.city.nodes.find(n=>n.id==='N-0140');
          s.select({kind:'junction',id:'N-0139'});
          s.update({x:target.x,y:target.y},{defer:false,targetId:'N-0140'});
        }else{
          s.select({kind:'road',id:'RD-0098'});
          s.previewRoadConnection({kind:'remove'});
        }
      },kind);
      await page.waitForFunction(()=>{const s=__buildingQA.state().roadWorkspace.session;
        return !s.checking&&s.settledRevision===s.revision&&
          s.reconciliation?.unresolved?.some(x=>x.code==='ownership-decision-required');
      },null,{timeout:60000});
      assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
      assert.equal(await page.locator('#roadOwnershipDecisions023').isVisible(),true);
      const choices=page.locator('#roadOwnershipList023 select[data-owner-field="districtId"]');
      assert.equal(await choices.count(),1,'Only one successor needs district selection');
      const before=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
      const eligible=await choices.locator('option:not([value=""])').evaluateAll(items=>items.map(x=>x.value));
      assert.deepEqual([...eligible].sort(),['DIST-001','DIST-003']);
      await page.locator('#roadOwnershipList023 button').first().click();
      assert.ok(await page.evaluate(()=>Boolean(__buildingQA.state().roadWorkspace.session.ownershipFocusKey023)));
      await choices.selectOption(eligible[0]);
      await page.waitForFunction(()=>{const s=__buildingQA.state().roadWorkspace.session;
        return !s.checking&&s.settledRevision===s.revision&&s.hasApplyCandidate;
      },null,{timeout:60000});
      assert.equal(await page.locator('#roadApplyB4').isEnabled(),true,
        await page.locator('#roadApplyStatusB4').innerText());
      assert.match(await page.locator('#roadOwnershipList023').innerText(),/Generated neighborhood impact/);
      assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),before);
      await page.locator('#roadApplyB4').click();
      await page.waitForFunction(kind=>{
        const app=__buildingQA.state();
        return kind==='junction'
          ? !app.project.city.nodes.some(n=>n.id==='N-0139')
          : !app.project.city.roads.some(r=>r.id==='RD-0098');
      },kind,{timeout:60000});
      const after=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
      assert.notEqual(after,before);
      assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('undo')),true);
      assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),before);
      assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('redo')),true);
      assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),after);
      if(__buildingQA?.state?.()?.roadWorkspace?.active)
        await page.locator('#roadPreviewCancel').click();
    }
    assert.deepEqual(errors,[]);
    console.log('PASS 0.2.3 ownership UI, preview, Apply and history '+name);
  }catch(error){
    await page.screenshot({path:new URL('../artifacts/ownership-023/'+name+'-failure.png',import.meta.url).pathname,
      fullPage:true}).catch(()=>{});
    throw new Error(name+': '+error.message,{cause:error});
  }finally{await page.close();await browser.close();}
}
