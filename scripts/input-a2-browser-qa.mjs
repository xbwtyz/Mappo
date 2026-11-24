import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright';
import {observeBuildingApp} from '../tests/helpers/building-app.js';
const dir=new URL('../artifacts/input-a2/',import.meta.url);
await mkdir(dir,{recursive:true});
const file=new URL('instrumented.html',dir);
await writeFile(file,observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'),
  'globalThis.__inputQA={state:()=>({main:mainInputA2,comparison:comparisonInputA2,tools:toolsA2})};'));
for(const [name,type] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await type.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.context().setOffline(true);await page.goto(file.href);
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    const baseline=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
    await page.evaluate(()=>document.getElementById('roadModeButton').click());
    await page.waitForFunction(()=>__buildingQA.state().roadWorkspace.active);
    const start=await page.evaluate(()=>{
      const a=__buildingQA.state(),s=a.roadWorkspace.session,p=s.point;
      a.camera.x=p.x;a.camera.y=p.y;a.camera.zoom=3;__buildingQA.draw();
      const screen=a.camera.worldToScreen(p),box=document.getElementById('mapCanvas').getBoundingClientRect();
      return {x:screen.x+box.left,y:screen.y+box.top,point:{...p}};
    });
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+15,start.y+9,{steps:3});
    assert.equal(await page.evaluate(()=>Boolean(__buildingQA.state().roadWorkspace.session.drag)),true);
    await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal(await page.evaluate(()=>__inputQA.state().main.active),false);
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.active),true);
    assert.deepEqual(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.point),start.point);
    const oldCamera=await page.evaluate(()=>__buildingQA.state().camera.x);
    await page.locator('#mapCanvas').focus();await page.keyboard.down('Space');
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+25,start.y,{steps:3});
    await page.mouse.up();await page.keyboard.up('Space');
    assert.notEqual(await page.evaluate(()=>__buildingQA.state().camera.x),oldCamera);
    assert.deepEqual(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.point),start.point);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),baseline);
    await page.locator('#roadPreviewCancel').click();assert.deepEqual(errors,[]);
    console.log('PASS '+name+' A2 captured road gesture Escape cancellation and temporary Space pan');
  }finally{await browser.close();}
}
