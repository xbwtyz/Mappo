// B02 browser acceptance: irregular property straight splits in the offline
// compiled desktop application, with both Chromium and Firefox.
import assert from 'node:assert/strict';
import { readFile,mkdir } from 'node:fs/promises';
import { chromium,firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { preparePropertyBuildingClear4E } from '../src/editor/property-building-clear-4e.js';
import { PropertySplitSessionE2,inspectPropertySplitE2 } from '../src/editor/property-split-e2.js';
import { auditControls, createAdjustmentAudit } from '../tests/helpers/adjustment-audit.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

function fixture(){
  const project=createProject({seed:'025-split-one',size:'medium',morphology:'organic',irregularProperties:true});
  const props=project.city.properties.filter(p=>p.boundary.length>4&&p.area>190&&
    Math.hypot(p.boundary[1].x-p.boundary[0].x,p.boundary[1].y-p.boundary[0].y)>18)
    .sort((a,b)=>a.buildingIds.length-b.buildingIds.length);
  for(const property of props.slice(0,55)){
    const cleared=property.buildingIds.length
      ?preparePropertyBuildingClear4E(project,defaultWorkspace(project),property.id)
      :{ok:true,candidate:project};
    if(!cleared.ok)continue;
    const session=new PropertySplitSessionE2();
    if(!session.start(cleared.candidate.city,property.id))continue;
    for(let edge=1;edge<property.boundary.length;edge++){
      session.setExitEdge(edge);
      for(const t of [.35,.5,.65]){
        session.setT(t);
        if(inspectPropertySplitE2(cleared.candidate,session).ok)
          return {project:cleared.candidate,workspace:defaultWorkspace(cleared.candidate),
            propertyId:property.id,exitEdge:edge,frontPercent:t*100};
      }
    }
  }
  throw Error('025 desktop QA fixture could not find a valid irregular split.');
}
const sample=fixture();
const audit=createAdjustmentAudit();
const html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const screenshots=new URL('../artifacts/025/',import.meta.url);
await mkdir(screenshots,{recursive:true});
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(20000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.route('**/*',route=>route.request().url()==='http://mappo.test/index.html'
      ?route.fulfill({contentType:'text/html',body:html}):route.abort());
    await page.goto('http://mappo.test/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    await page.evaluate(doc=>__buildingQA.apply(doc),{project:sample.project,workspace:sample.workspace});
    const before=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
    await page.evaluate(id=>__buildingQA.state().workspaceShell.select({kind:'property',id}),sample.propertyId);
    await page.getByRole('button',{name:'Split property',exact:true}).click();
    assert.equal(await page.locator('#propertySplitFlexible025').isChecked(),true);
    assert.equal(await page.locator('#propertySplitFlexible025').isDisabled(),true);
    assert.equal(await page.locator('#propertySplitExit025').isVisible(),true);
    await page.locator('#propertySplitExitEdge025').selectOption(String(sample.exitEdge));
    await page.locator('#propertySplitPercentE2').fill(String(sample.frontPercent));
    await page.locator('#propertySplitPercentE2').press('Tab');
    assert.equal(await page.locator('#propertySplitApplyE2').isEnabled(),true,
      await page.locator('#propertySplitStatusE2').innerText());
    // Exercise both map drag handles in the real browser controller. Cancel
    // must restore each independently without changing accepted geometry.
    const dragged=await page.evaluate(()=>{
      const st=__buildingQA.state(),controls=st.propertySplitE2,session=controls.session;
      const firstT=session.t,firstExit=session.exitT;
      const g=session.geometry(st.project.city);
      const exitStart=g.boundary[session.exitEdge],exitEnd=g.boundary[(session.exitEdge+1)%g.boundary.length];
      if(!controls.begin(g.cut[1],2))return {ok:false,reason:'exit handle not hit'};
      const proposedExit=firstExit<.55?.58:.42;
      controls.move({x:exitStart.x+(exitEnd.x-exitStart.x)*proposedExit,
        y:exitStart.y+(exitEnd.y-exitStart.y)*proposedExit});
      const exitMoved=Math.abs(session.exitT-firstExit)>.01;
      controls.end(true);
      const frontStart=g.boundary[0],frontEnd=g.boundary[1];
      if(!controls.begin(g.cut[0],2))return {ok:false,reason:'front handle not hit'};
      const proposedFront=firstT<.55?.58:.42;
      controls.move({x:frontStart.x+(frontEnd.x-frontStart.x)*proposedFront,
        y:frontStart.y+(frontEnd.y-frontStart.y)*proposedFront});
      const frontMoved=Math.abs(session.t-firstT)>.01;
      controls.end(true);
      return {ok:exitMoved&&frontMoved&&Math.abs(session.t-firstT)<1e-9&&
        Math.abs(session.exitT-firstExit)<1e-9,exitMoved,frontMoved};
    });
    assert.equal(dragged.ok,true,JSON.stringify(dragged));
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),before);
    await page.locator('#propertySplitPercentE2').fill('1');
    await page.locator('#propertySplitPercentE2').press('Tab');
    assert.equal(await page.locator('#propertySplitApplyE2').isDisabled(),true);
    await page.locator('#propertySplitPercentE2').fill(String(sample.frontPercent));
    await page.locator('#propertySplitPercentE2').press('Tab');
    assert.equal(await page.locator('#propertySplitApplyE2').isEnabled(),true);
    await page.locator('#propertySplitApplyE2').click();
    await page.waitForFunction(()=>!__buildingQA.state().propertySplitE2.active);
    const after=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
    assert.notEqual(after,before);
    assert.equal(await page.evaluate(()=>__buildingQA.state().acceptedHistoryD01.past.length),1);
    assert.equal(await page.evaluate(()=>__buildingQA.state().acceptedHistoryD01.entry('undo')?.operation),'property-split');
    await page.locator('#propertySplitUndoE2').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),before);
    await page.locator('#propertySplitRedoE2').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),after);
    const saved=await page.evaluate(()=>__buildingQA.capture());
    await page.evaluate(doc=>__buildingQA.apply(doc),saved);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),after);
    const replays=[
      ['irregular-split-vacant',null],
      ['irregular-split-occupied',/BLD-00003/],
      ['multipart-split',/place parts of building BLD-MAN-COURTYARD-HOST on separate properties/]
    ];
    for(const [caseName,expectedMessage] of replays){
      const spec=auditControls[caseName];
      const {project,workspace}=audit.fixture(spec.fixture);
      await page.evaluate(doc=>__buildingQA.apply(doc),{project,workspace});
      const replayBefore=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
      await page.evaluate(id=>__buildingQA.state().workspaceShell.select({kind:'property',id}),spec.target);
      await page.getByRole('button',{name:'Split property',exact:true}).click();
      const status=await page.locator('#propertySplitStatusE2').innerText();
      assert.equal(await page.locator('#propertySplitApplyE2').isEnabled(),expectedMessage===null,status);
      if(expectedMessage)assert.match(status,expectedMessage);
      await page.locator('#propertySplitCancelE2').click();
      assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),replayBefore);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS 025 '+name+' irregular split/blocked draft/Apply/Undo/Redo/save and issues #137/#140 replays');
  }catch(error){
    await page.screenshot({path:new URL(name+'-failure.png',screenshots).pathname,fullPage:true}).catch(()=>{});
    throw new Error('025 '+name+': '+error.message,{cause:error});
  }finally{await page.close();await browser.close();}
}
