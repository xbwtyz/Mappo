import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium,firefox} from 'playwright';
import {observeBuildingApp} from '../tests/helpers/building-app.js';
const dir=new URL('../artifacts/selection-a1/',import.meta.url);
await mkdir(dir,{recursive:true});
const file=new URL('instrumented.html',dir);
await writeFile(file,observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8')));
for(const [name,type] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await type.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.context().setOffline(true);
    await page.goto(file.href);
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    const before=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
    await page.evaluate(()=>document.getElementById('roadModeButton').click());
    await page.waitForFunction(()=>__buildingQA.state().roadWorkspace.active);
    const ids=await page.evaluate(()=>{
      const s=__buildingQA.state().roadWorkspace.session;
      const roads=[...s.graph.roadsById.values()].filter(r=>{
        const a=s.graph.nodesById.get(r.a),b=s.graph.nodesById.get(r.b);
        return Math.hypot(a.x-b.x,a.y-b.y)>12;
      });
      const a=roads[0],b=roads.find(r=>r.id!==a.id&&(r.a===a.a||r.a===a.b||r.b===a.a||r.b===a.b))??roads[1];
      s.select({kind:'road',id:a.id});return [a.id,b.id];
    });
    async function clickRoad(id,shift){
      const point=await page.evaluate(id=>{
        const a=__buildingQA.state(),s=a.roadWorkspace.session,r=s.graph.roadsById.get(id);
        const p=s.graph.nodesById.get(r.a),q=s.graph.nodesById.get(r.b);
        const mid={x:(p.x+q.x)/2,y:(p.y+q.y)/2};
        a.camera.x=mid.x;a.camera.y=mid.y;a.camera.zoom=3;
        const screen=a.camera.worldToScreen(mid),box=document.getElementById('mapCanvas').getBoundingClientRect();
        __buildingQA.draw();return {x:screen.x+box.left,y:screen.y+box.top};
      },id);
      if(shift)await page.keyboard.down('Shift');
      await page.mouse.click(point.x,point.y);
      if(shift)await page.keyboard.up('Shift');
    }
    await clickRoad(ids[1],true);
    await page.waitForFunction(()=>__buildingQA.state().roadWorkspace.session.selectionSet.items.length===2);
    assert.equal(await page.locator('#roadSelectionGroupA1').isVisible(),true);
    assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
    assert.equal(await page.evaluate(()=>{
      const a=__buildingQA.state(),s=a.roadWorkspace.session;
      return s.selection===null && a.workspaceShell.state.selection===null &&
        s.selectionSet===a.workspaceShell.state.selectionSet;
    }),true);
    await page.locator('#roadSelectionLocateA1').click();
    await page.getByRole('button',{name:'Remove '+ids[1]+' from selection',exact:true}).click();
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.selection.id),ids[0]);
    await clickRoad(ids[1],true);
    await page.waitForFunction(()=>__buildingQA.state().roadWorkspace.session.selectionSet.items.length===2);
    await page.locator('#mapCanvas').focus();await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.selectionSet.items.length),0);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),before);
    await page.locator('#roadPreviewCancel').click();
    assert.deepEqual(errors,[]);
    console.log('PASS '+name+' A1 shared road selection, inspector, clear and immutable city');
  }finally{await browser.close();}
}
