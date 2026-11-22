// B04 compiled HTML acceptance in both supported desktop browser engines.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {createProject} from '../src/core/city-model.js';
import {defaultWorkspace} from '../src/data/project-format.js';
import {PropertyEditSession3I} from '../src/editor/property-edit.js';
import {preparePropertyApply3I} from '../src/editor/property-application.js';
import {observeBuildingApp} from '../tests/helpers/building-app.js';

function fixture(){
 const project=createProject({seed:'b04-027-browser',size:'small',morphology:'planned'});
 for(const p of project.city.properties){
   const s=new PropertyEditSession3I();
   if(!s.start(project.city,p.id)||!s.beginFlexible(project.city))continue;
   if(s.flexible.selected.boundary.length!==4)continue;
   if(!s.splitFlexible(project.city))continue;
   s.updateFlexible({edgeA:0,edgeB:2,ratioA:.5,ratioB:.5});
   if(!s.splitFlexible(project.city))continue;
   const trial=preparePropertyApply3I(project,defaultWorkspace(project),s);
   if(trial.ok)return {project,workspace:defaultWorkspace(project),id:p.id};
 }
 throw Error('No viable two-step flexible plot partition fixture.');
}
const sample=fixture(),html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const dir=new URL('../artifacts/plot-027/',import.meta.url);
await mkdir(dir,{recursive:true});
const failures=[];
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
 const browser=await engine.launch({headless:true});
 try{
   const page=await browser.newPage({viewport:{width:1440,height:900}});
   page.setDefaultTimeout(25000);const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
     await page.route('**/*',route=>route.request().url()==='http://mappo.test/index.html'
       ?route.fulfill({contentType:'text/html',body:html}):route.abort());
     await page.goto('http://mappo.test/index.html',{waitUntil:'domcontentloaded'});
     await page.waitForFunction(()=>__buildingQA.state().files.ready);
     await page.evaluate(doc=>__buildingQA.apply(doc),{project:sample.project,workspace:sample.workspace});
     const before=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city));
     await page.evaluate(id=>__buildingQA.state().workspaceShell.select({kind:'property',id}),sample.id);
     await page.getByRole('button',{name:/^(Edit property geometry|Edit boundaries & plots)$/}).click();
     await page.locator('#plot027Start').click();
     assert.equal(await page.locator('#plot027Controls').isVisible(),true);
     await page.locator('#plot027Split').click();
     await page.locator('#plot027Split').click();
     assert.match(await page.locator('#plot027Summary').innerText(),/2 pending operation/);
     assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),before);
     assert.equal(await page.locator('#propertyEditApply3I').isEnabled(),true);
     await page.locator('#plot027Undo').click();
     assert.match(await page.locator('#plot027Summary').innerText(),/1 pending operation/);
     await page.locator('#plot027Split').click();
     const revision=await page.evaluate(()=>__buildingQA.state().files.revision);
     await page.locator('#propertyEditApply3I').click();
     const applied=await page.evaluate(()=>({city:JSON.stringify(__buildingQA.state().project.city),
       rev:__buildingQA.state().files.revision,
       history:__buildingQA.state().propertyHistory.count('undo',__buildingQA.state().propertyEditSession.propertyId)}));
     assert.notEqual(applied.city,before);
     assert.ok(applied.rev>=revision+1);
     assert.equal(applied.history,1);
     await page.locator('#propertyHistoryUndo3I').click();
     assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),before);
     await page.locator('#propertyHistoryRedo3I').click();
     assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),applied.city);
     const saved=await page.evaluate(()=>__buildingQA.capture());
     await page.evaluate(doc=>__buildingQA.apply(doc),saved);
     assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),applied.city);
     assert.deepEqual(errors,[]);
     console.log('PASS B04 0.2.7 '+name+' multi-step draft/Apply/Undo/Redo/save');
   }catch(error){failures.push(name+': '+error.message);console.error('FAIL B04 '+name+': '+error.stack);
     await page.screenshot({path:new URL(name+'-failure.png',dir).pathname}).catch(()=>{});
   }finally{await page.close();}
 }finally{await browser.close();}
}
if(failures.length)throw Error('B04 desktop QA failed:\n'+failures.join('\n'));
