// E5 browser acceptance: two real property editors, one accepted city, one portable reopen.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {createProject} from '../src/core/city-model.js';
import {defaultWorkspace} from '../src/data/project-format.js';
import {preparePropertyBuildingClear4E} from '../src/editor/property-building-clear-4e.js';
import {PropertySplitSessionE2,inspectPropertySplitE2,preparePropertySplitE2} from '../src/editor/property-split-e2.js';
import {PropertyMergeSessionE3,inspectPropertyMergeE3,preparePropertyMergeE3} from '../src/editor/property-merge-e3.js';
import {PropertyEditSession3I} from '../src/editor/property-edit.js';
import {preparePropertyApply3I} from '../src/editor/property-application.js';
import {observeBuildingApp} from '../tests/helpers/building-app.js';

function fixture(){
 const original=createProject({seed:'e5-browser-chain',size:'small',morphology:'planned'});
 for(const p of original.city.properties){
  if(p.boundary.length!==4)continue;
  const cleared=p.buildingIds.length
   ?preparePropertyBuildingClear4E(original,defaultWorkspace(original),p.id)
   :{ok:true,candidate:original};
  if(!cleared.ok)continue;
  const project=cleared.candidate,split=new PropertySplitSessionE2();
  if(!split.start(project.city,p.id)||!inspectPropertySplitE2(project,split).ok)continue;
  const result=preparePropertySplitE2(project,defaultWorkspace(project),split);
  if(!result.ok)continue;
  const m=new PropertyMergeSessionE3();
  m.start(result.candidate.city,result.sourcePropertyId);
  m.choose(result.candidate.city,result.newPropertyId);
  if(!inspectPropertyMergeE3(result.candidate,m).ok)continue;
  const merged=preparePropertyMergeE3(result.candidate,defaultWorkspace(result.candidate),m);
  if(!merged.ok)continue;
  const edit=new PropertyEditSession3I();
  if(!edit.start(merged.candidate.city,result.sourcePropertyId)||!edit.addDivider(merged.candidate.city,0))continue;
  if(!preparePropertyApply3I(merged.candidate,defaultWorkspace(merged.candidate),edit).ok)continue;
  return {project:result.candidate,workspace:defaultWorkspace(result.candidate),
   primaryId:result.sourcePropertyId,neighborId:result.newPropertyId};
 }
 throw Error('No legal E3→E4 fixture for continuous E5 browser workflow.');
}
const sample=fixture();
const html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const artifactDir=new URL('../artifacts/e5/',import.meta.url);
await mkdir(artifactDir,{recursive:true});
const failures=[];
for(const [engineName,engine] of [['chromium',chromium],['firefox',firefox]]){
 const browser=await engine.launch({headless:true});
 try{
  for(const viewport of [{name:'desktop',width:1440,height:900},{name:'phone',width:390,height:844}]){
   const label=engineName+'/'+viewport.name;
   const page=await browser.newPage({viewport,hasTouch:viewport.name==='phone'});
   page.setDefaultTimeout(20000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.route('**/*',route=>route.request().url()==='http://mappo.test/index.html'
      ?route.fulfill({contentType:'text/html',body:html}):route.abort());
    await page.goto('http://mappo.test/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    await page.evaluate(doc=>__buildingQA.apply(doc),{project:sample.project,workspace:sample.workspace});
    const oldCity=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
    const originalPlotCount=sample.project.city.plots.length;
    await page.evaluate(id=>__buildingQA.state().workspaceShell.select({kind:'property',id}),sample.primaryId);
    if(viewport.name==='phone'&&await page.locator('#workspaceOpenInspector').isVisible()
       &&!(await page.locator('#workspaceInspector').isVisible()))
      await page.locator('#workspaceOpenInspector').click();
    await page.getByRole('button',{name:'Merge properties',exact:true}).click();
    assert.equal(await page.locator('#propertyMergePanelE3').isVisible(),true);
    await page.locator('#propertyMergeNeighborE3').selectOption(sample.neighborId);
    assert.equal(await page.locator('#propertyMergeApplyE3').isEnabled(),true);
    await page.locator('#propertyMergeApplyE3').click();
    await page.waitForFunction(()=>!__buildingQA.state().propertyMergeE3.active);
    assert.notEqual(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),oldCity);
    assert.equal(await page.evaluate(()=>__buildingQA.state().project.city.properties.some(p=>p.id===__buildingQA.state().workspaceShell.state.selection.id)),true);
    // Start a second editor against the newly committed primary property.
    if(viewport.name==='phone'&&await page.locator('#workspaceOpenInspector').isVisible()
       &&!(await page.locator('#workspaceInspector').isVisible()))
      await page.locator('#workspaceOpenInspector').click();
    await page.getByRole('button',{name:/^(Edit property geometry|Edit boundaries & plots)$/}).click();
    assert.equal(await page.locator('#propertyEditPanel3I').isVisible(),true);
    await page.locator('#propertyAddDividerE4').click();
    assert.match(await page.locator('#propertyCountSummaryE4').innerText(),/Split plot/);
    assert.equal(await page.locator('#propertyEditApply3I').isEnabled(),true);
    const beforePlotApply=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
    await page.locator('#propertyEditApply3I').click();
    const afterPlot=await page.evaluate(()=>({
      city:JSON.stringify(__buildingQA.state().project.city),
      plots:__buildingQA.state().project.city.plots.length,
      property:__buildingQA.state().project.city.properties.find(p=>p.id===__buildingQA.state().workspaceShell.state.selection.id)
    }));
    assert.equal(afterPlot.plots,originalPlotCount+1);
    assert.ok(afterPlot.property.propertyMergeHistoryE3?.length);
    assert.ok(afterPlot.property.propertySplitHistoryE2);
    assert.equal(afterPlot.property.plotCountHistoryE4.at(-1).operation,'split');
    await page.locator('#propertyHistoryUndo3I').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),beforePlotApply);
    await page.locator('#propertyHistoryRedo3I').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),afterPlot.city);
    const saved=await page.evaluate(()=>__buildingQA.capture());
    await page.evaluate(doc=>__buildingQA.apply(doc),saved);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),afterPlot.city);
    assert.deepEqual(errors,[]);
    console.log('PASS E5 '+label+' E3→E4 Apply/Undo/Redo/portable reopen');
   }catch(error){
    failures.push(label+': '+error.message);
    console.error('FAIL E5 '+label+': '+error.stack);
    await page.screenshot({path:new URL(label.replace('/','-')+'-failure.png',artifactDir).pathname}).catch(()=>{});
   }finally{await page.close();}
  }
 }finally{await browser.close();}
}
if(failures.length)throw Error('E5 integrated browser acceptance failed:\n'+failures.join('\n'));
