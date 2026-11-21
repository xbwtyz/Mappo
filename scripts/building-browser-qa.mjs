// Runs against the compiled standalone document. The sole test-only addition is
// a closure-state observer; shipped HTML has no QA globals or runtime dependency.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

async function openInspectorFold(page, id) {
  const fold = page.locator('#' + id);
  if (await fold.isVisible() && !await fold.evaluate(node => node.open))
    await fold.locator(':scope > summary').click();
}
async function openIdentity(page) {
  if (await page.locator('#identityInspector').getAttribute('open') !== null) return;
  const action = page.getByRole('button', {name:'Name & use', exact:true});
  if (await action.isVisible()) await action.click();
  else await page.locator('#identityEditorTitle').click();
}

const html = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
const output = new URL('../artifacts/building-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'ultrawide', width: 5120, height: 1440 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 }
];
const failures = [];

for (const [browserName, browserType] of [['chromium', chromium], ['firefox', firefox]]) {
  const browser = await browserType.launch({ headless: true });
  for (const viewport of viewports) {
    const label = `${browserName}-${viewport.name}`, page = await browser.newPage({ viewport });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      // about:blank/setContent has an opaque origin and blocks browser storage,
      // causing the real app to open its storage warning over unrelated controls.
      // Intercept a normal test origin instead; no server or network is needed.
      await page.route('**/*', route => route.request().url() === 'http://mappo.test/index.html'
        ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
      await page.goto('http://mappo.test/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => __buildingQA.state().files.ready);
      assert.ok(await page.evaluate(() => Boolean(__buildingQA.state().files.store)), 'Browser fixture needs normal-origin storage');
      if (viewport.width <= 670) await page.locator('#workspaceCollapseTools').click();
      const geometry = await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city));
      const id = await page.evaluate(() => {
        const { project, camera, buildingWorkspace, propertyWorkspace, landscapeWorkspace } = __buildingQA.state();
        camera.zoom = 3;
        const candidates = [...project.city.buildings].sort((a, b) => b.holes.length - a.holes.length);
        for (const building of candidates) {
          const center = building.footprint.reduce((p, v) => ({
            x: p.x + v.x / building.footprint.length, y: p.y + v.y / building.footprint.length
          }), { x: 0, y: 0 });
          for (let i = 0; i < building.footprint.length; i++) {
            const a = building.footprint[i], b = building.footprint[(i + 1) % building.footprint.length];
            const point = { x: .45 * (a.x + b.x) + .1 * center.x, y: .45 * (a.y + b.y) + .1 * center.y };
            if (buildingWorkspace.hit(point, camera.zoom)?.id !== building.id
              || propertyWorkspace.hit(point, camera.zoom)?.id !== building.propertyId || landscapeWorkspace.hit(point, camera.zoom)) continue;
            camera.x = point.x;
            camera.y = point.y;
            __buildingQA.target = point;
            __buildingQA.roofTarget = point;
            __buildingQA.buildingId = building.id;
            __buildingQA.draw();
            return building.propertyId;
          }
        }
        throw new Error('No generated roof available');
      });
      const target = async () => {
        const p = await page.evaluate(() => __buildingQA.state().camera.worldToScreen(__buildingQA.target));
        const box = await page.locator('#mapCanvas').boundingBox();
        return { x: box.x + p.x, y: box.y + p.y };
      };
      let p = await target();
      await page.mouse.move(p.x, p.y);
      assert.equal(await page.evaluate(() => __buildingQA.state().propertyWorkspace.hover?.id), id);
      await page.mouse.click(p.x, p.y);
      assert.equal(await page.locator('#workspaceSelectionType').innerText(), 'Property');
      assert.ok((await page.locator('#workspaceSelectionName').innerText()).includes(id));
      assert.equal(await page.locator('#workspaceInspector').isVisible(), true);
      const siteContext = await page.evaluate(id => {
        const city = __buildingQA.state().project.city;
        const property = city.properties.find(p => p.id === id);
        return { plotIds: property.plotIds, buildingIds: property.buildingIds, blockId: property.blockId,
          roadId: property.frontageRoadId, district: city.districts.find(d => d.id === property.districtId)?.name };
      }, id);
      await openInspectorFold(page, 'workspaceInspectorDetails');
      let informationText = await page.locator('#workspaceSelectionSections').innerText();
      // Dev 4d: summary stays readable, and unbuilt is explicitly an estimate.
      for(const label of ['Street frontage length:', 'Estimated unbuilt area:', 'not guaranteed buildable'])
        assert.ok(informationText.includes(label), 'Property summary contains '+label);
      for (const text of ['Generated usage:', 'Site area:', 'square survey units', 'Frontage street:',
        siteContext.blockId, siteContext.roadId, ...siteContext.plotIds, ...siteContext.buildingIds])
        assert.ok(informationText.includes(text), `Property information contains ${text}`);
      if (siteContext.district) assert.ok(informationText.includes(siteContext.district));
      // Dev 4e: one confirmed property-wide clear, one history entry and
      // exact undo/redo restores accepted city and preserves every plot.
      assert.ok(siteContext.buildingIds.length > 0);
      await openInspectorFold(page, 'workspaceInspectorMore');
      const clearButton=page.getByRole('button',{name:'Clear all buildings…'});
      assert.equal(await clearButton.isDisabled(),false);
      page.once('dialog',async dialog=>{
        assert.match(dialog.message(),/Clear all.*building\(s\).*property/i);
        await dialog.dismiss();
      });
      await clearButton.click();
      assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),geometry,
        'Cancelling Clear all must not change accepted geometry');
      page.once('dialog',async dialog=>{
        assert.match(dialog.message(),/undo this entire action/i);
        await dialog.accept();
      });
      await clearButton.click();
      const clearState=await page.evaluate(id=>{
        const s=__buildingQA.state();
        return {buildings:s.project.city.buildings.filter(b=>b.propertyId===id).length,
          propertyBuildings:s.project.city.properties.find(p=>p.id===id).buildingIds.length,
          undoCount:s.buildingStructureHistory.count('undo',id),
          plots:s.project.city.properties.find(p=>p.id===id).plotIds.slice()};
      },id);
      assert.equal(clearState.buildings,0);
      assert.equal(clearState.propertyBuildings,0);
      assert.equal(clearState.undoCount,1);
      assert.deepEqual(clearState.plots,siteContext.plotIds);
      assert.equal(await clearButton.isDisabled(),true);
      assert.match(await page.locator('#structureHistoryStatus').innerText(),/Restore all cleared buildings/);
      if(viewport.width<=900 && await page.locator('#workspaceCloseInspector').isVisible())
        await page.locator('#workspaceCloseInspector').click();
      await page.locator('#structureUndo').click();
      assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),geometry);
      if(viewport.width<=900 && await page.locator('#workspaceCloseInspector').isVisible())
        await page.locator('#workspaceCloseInspector').click();
      await page.locator('#structureRedo').click();
      assert.equal(await page.evaluate(id=>__buildingQA.state().project.city.buildings.some(b=>b.propertyId===id),id),false);
      if(viewport.width<=900 && await page.locator('#workspaceCloseInspector').isVisible())
        await page.locator('#workspaceCloseInspector').click();
      await page.locator('#structureUndo').click();
      assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project.city)),geometry);
      if(viewport.width<=900 && await page.locator('#workspaceOpenInspector').isVisible())
        await page.locator('#workspaceOpenInspector').click();
      // Dev 4b: focus is based on the actual selected property bounds, not
      // the map cursor or the city's overall extent. It must not edit city data.
      const focusBefore=await page.evaluate(()=>{
        const c=__buildingQA.state().camera;return {x:c.x,y:c.y,zoom:c.zoom};
      });
      await page.getByRole('button',{name:/^(Zoom to this property|Locate)$/}).click();
      const focused=await page.evaluate(id=>{
        const {camera,project,workspaceShell}=__buildingQA.state();
        const p=project.city.properties.find(p=>p.id===id),xs=p.boundary.map(q=>q.x),ys=p.boundary.map(q=>q.y);
        return {x:camera.x,y:camera.y,zoom:camera.zoom,
          expectedX:(Math.min(...xs)+Math.max(...xs))/2,
          expectedY:(Math.min(...ys)+Math.max(...ys))/2,
          selected:workspaceShell.state.selection?.id};
      },id);
      assert.ok(Math.abs(focused.x-focused.expectedX)<.001);
      assert.ok(Math.abs(focused.y-focused.expectedY)<.001);
      assert.ok(focused.zoom>=.18&&focused.zoom<=12);
      assert.equal(focused.selected,id);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      if(viewport.width<=900)await page.locator('#workspaceOpenInspector').click();
      await page.evaluate(c=>{
        const state=__buildingQA.state();state.camera.x=c.x;state.camera.y=c.y;
        state.camera.zoom=c.zoom;__buildingQA.draw();
      },focusBefore);
      // Dev 4c: canvas Delete must request, not silently apply, property removal.
      await page.evaluate(() => document.getElementById('mapCanvas').focus());
      await Promise.all([
        page.waitForEvent('dialog').then(dialog => {
          assert.match(dialog.message(),/Delete property/);
          return dialog.dismiss();
        }),
        page.keyboard.press('Delete')
      ]);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      await page.screenshot({ path: new URL(`${label}-selected.png`, output).pathname });
      // 3I-A: real browser property preview must not mutate any accepted land.
      await page.getByRole('button', { name: /^(Edit property geometry|Edit boundaries & plots)$/ }).click();
      assert.equal(await page.locator('#propertyEditPanel3I').isVisible(),true);
      assert.equal(await page.locator('#propertyEditApply3I').isDisabled(),true);
      assert.equal(await page.evaluate(() => __buildingQA.state().propertyEditSession.propertyId),id);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      // Dev 4c: draft metrics and nudge buttons must not commit accepted land.
      assert.match(await page.locator('#propertyPreviewMeasurements4C').innerText(),/Width.*Area.*Center/);
      await page.evaluate(() => __buildingQA.state().propertyEditSession.selectCorner(0));
      const beforeNudge=await page.evaluate(() => __buildingQA.state().propertyEditSession.boundary[0].x);
      await page.locator('#propertyNudgeRight4C').click();
      assert.ok(Math.abs(await page.evaluate(() => __buildingQA.state().propertyEditSession.boundary[0].x)-beforeNudge-.5)<.0001);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      await page.locator('#propertyEditReset3I').click();
      await page.screenshot({ path: new URL(`${label}-3ia-property-preview.png`, output).pathname });
      // 3I-B: change a corner through the public numeric control, then Reset.
      await page.evaluate(() => __buildingQA.state().propertyEditSession.selectCorner(0));
      const originalCornerX=Number(await page.locator('#propertyCornerX3I').inputValue());
      await page.locator('#propertyCornerX3I').fill(String(originalCornerX-.15));
      await page.locator('#propertyCornerX3I').press('Tab');
      assert.equal(await page.evaluate(() => __buildingQA.state().propertyEditSession.isPending),true);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      await page.locator('#propertyEditReset3I').click();
      assert.equal(await page.evaluate(() => __buildingQA.state().propertyEditSession.isPending),false);
      assert.equal(await page.evaluate(() => __buildingQA.state().propertyEditSession.selectedCorner),null);
      // 3I-C/D: apply a safe shrinking of the rear property edge and verify
      // real UI Undo/Redo restores every linked record with no schema changes.
      const validParcelEdit=await page.evaluate(() => {
        const {project,propertyEditSession:session}=__buildingQA.state();
        const site=session.source(project.city),axis=site.frame.inward;
        for(const index of [2,3]){
          const p=site.boundary[index];
          session.setCorner(index,{x:p.x-axis.x*.1,y:p.y-axis.y*.1});
        }
        return {valid:session.validation?.ok,issues:session.validation?.issues};
      });
      assert.equal(validParcelEdit.valid,true,JSON.stringify(validParcelEdit.issues));
      assert.equal(await page.locator('#propertyEditApply3I').isDisabled(),false);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      await page.locator('#propertyEditApply3I').click();
      assert.notEqual(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      assert.equal(await page.locator('#propertyHistoryUndo3I').isDisabled(),false);
      await page.locator('#propertyHistoryUndo3I').click();
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      assert.equal(await page.locator('#propertyHistoryRedo3I').isDisabled(),false);
      await page.locator('#propertyHistoryRedo3I').click();
      assert.notEqual(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      await page.locator('#propertyHistoryUndo3I').click();
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      await page.screenshot({ path: new URL(`${label}-3id-property-undo.png`,output).pathname });
      await page.locator('#propertyEditCancel3I').click();
      assert.equal(await page.locator('#propertyEditPanel3I').isVisible(),false);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);

      // Dev 4a: delete through the real Inspector and restore the exact city.
      const countBefore=await page.evaluate(() => {
        const c=__buildingQA.state().project.city;
        return {properties:c.properties.length,plots:c.plots.length,buildings:c.buildings.length};
      });
      page.once('dialog',async dialog=>{
        assert.ok(dialog.message().includes('plot(s)') && dialog.message().includes('building(s)'));
        await dialog.accept();
      });
      await openInspectorFold(page, 'workspaceInspectorMore');
      await page.getByRole('button',{name:'Delete property…'}).click();
      assert.equal(await page.evaluate(id => __buildingQA.state().project.city.properties.some(p=>p.id===id),id),false);
      const countAfter=await page.evaluate(() => {
        const c=__buildingQA.state().project.city;
        return {properties:c.properties.length,plots:c.plots.length,buildings:c.buildings.length};
      });
      assert.equal(countAfter.properties,countBefore.properties-1);
      assert.equal(countAfter.plots,countBefore.plots-siteContext.plotIds.length);
      assert.equal(countAfter.buildings,countBefore.buildings-siteContext.buildingIds.length);
      assert.equal(await page.locator('#propertyDeletionUndo4A').isVisible(),true);
      await page.locator('#propertyDeletionUndo4A').click();
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      assert.equal(await page.locator('#propertyDeletionRedo4A').isVisible(),true);
      await page.locator('#propertyDeletionRedo4A').click();
      assert.equal(await page.evaluate(id => __buildingQA.state().project.city.properties.some(p=>p.id===id),id),false);
      await page.locator('#propertyDeletionUndo4A').click();
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      if(viewport.width<=900 && await page.locator('#workspaceOpenInspector').isVisible())
        await page.locator('#workspaceOpenInspector').click();

      // 3H: property-first Add starts a ghost, not a committed building.
      await page.getByRole('button', { name: /^(Add building to this property|Add building)$/ }).click();
      assert.equal(await page.locator('#buildingStructurePanel').isVisible(),true);
      assert.equal(await page.evaluate(() => __buildingQA.state().buildingPlacementSession.isActive),true);
      await page.locator('#structurePreset').selectOption('T');
      assert.equal(await page.evaluate(() => __buildingQA.state().buildingPlacementSession.spec.preset),'T');
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      await page.screenshot({ path: new URL(`${label}-3h-ghost.png`, output).pathname });
      page.once('dialog',dialog=>dialog.accept());
      await page.locator('#structureCancel').click();
      assert.equal(await page.evaluate(() => __buildingQA.state().buildingPlacementSession.isActive),false);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);


      // A courtyard belongs to the site, including its open center.
      const hasCourtyard = await page.evaluate(() => {
        const building = __buildingQA.state().project.city.buildings.find(b => b.id === __buildingQA.buildingId);
        const hole = building.holes[0];
        if (!hole) return false;
        __buildingQA.target = hole.reduce((p, v) => ({ x: p.x + v.x / hole.length, y: p.y + v.y / hole.length }), { x: 0, y: 0 });
        return true;
      });
      assert.ok(hasCourtyard, 'Fixture should include a courtyard property');
      await page.locator('#workspaceCloseInspector').click();
      p = await target();
      await page.mouse.click(p.x, p.y);
      assert.equal(await page.locator('#workspaceSelectionType').innerText(), 'Property');
      assert.ok((await page.locator('#workspaceSelectionName').innerText()).includes(id));
      await page.evaluate(() => { __buildingQA.target = __buildingQA.roofTarget; });

      // Native buttons support keyboard selection of a child and parent return.
      const buildingId = await page.evaluate(() => __buildingQA.buildingId);
      // 3H-D: the actual browser Delete and structural Undo restore all links.
      await page.locator(`[data-inspector-kind="building"][data-inspector-id="${buildingId}"]`).click();
      page.once('dialog',dialog=>dialog.accept());
      await openInspectorFold(page, 'workspaceInspectorMore');
      await page.getByRole('button', { name: 'Delete building…' }).click();
      assert.equal(await page.evaluate(id => __buildingQA.state().project.city.buildings.some(b=>b.id===id),buildingId),false);
      assert.equal(await page.locator('#structureUndo').isDisabled(),false);
      await page.locator('#workspaceCloseInspector').click();
      await page.locator('#structureUndo').click();
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      assert.equal(await page.locator('#structureRedo').isDisabled(),false);
      await page.screenshot({ path: new URL(`${label}-3h-structure-undo.png`,output).pathname });
      await page.locator(`[data-inspector-kind="building"][data-inspector-id="${buildingId}"]`).press('Enter');
      assert.equal(await page.locator('#workspaceSelectionType').innerText(), 'Building');
      assert.ok((await page.locator('#workspaceSelectionName').innerText()).includes(buildingId));
      await openInspectorFold(page, 'workspaceInspectorDetails');
      informationText = await page.locator('#workspaceSelectionSections').innerText();
      const childContext = await page.evaluate(id => {
        const building = __buildingQA.state().project.city.buildings.find(b => b.id === id);
        return { plots: building.plotIds, frontage: building.frontageRoadId };
      }, buildingId);
      for (const text of ['Building use:', 'Footprint shape:', 'Footprint area:',
        `Occupied plots: ${childContext.plots.length}`, 'square survey units', childContext.frontage, id, ...childContext.plots])
        assert.ok(informationText.includes(text), `Building information contains ${text}`);
      assert.deepEqual(await page.evaluate(() => __buildingQA.state().files.captureDocument().workspace.ui.selection), { kind: 'building', id: buildingId });
      await page.screenshot({ path: new URL(`${label}-child.png`, output).pathname });
      // F3: classify through the Inspector, capture the save, then undo metadata only.
      if (viewport.name === 'desktop' || viewport.name === 'phone') {
        await openIdentity(page);
        const acceptedBuilding = id => page.evaluate(id => __buildingQA.state().project.city.buildings.find(b => b.id === id), id);
        const original = await acceptedBuilding(buildingId);
        const type = original.type === 'inn' ? 'shop' : 'inn';
        await page.locator('#identityBuildingType').selectOption(type);
        assert.equal((await acceptedBuilding(buildingId)).type, original.type);
        await page.locator('#identityApplyButton').click();
        assert.deepEqual(await acceptedBuilding(buildingId), { ...original, type });
        assert.match(await page.locator('#workspaceSelectionSections').innerText(), /Building use: (Inn|Shop)/);
        const accepted = await page.evaluate(() => __buildingQA.state().files.captureDocument());
        assert.equal(accepted.project.city.buildings.find(b => b.id === buildingId).type, type);
        await page.locator('#identityUndoButton').click();
        assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)), geometry);
      }
      // 3G-A: use the real Inspector action and verify a visual-only mode in every viewport.
      await page.getByRole('button', { name: /^(Edit building footprint|Edit footprint)$/ }).click();
      assert.equal(await page.evaluate(() => __buildingQA.state().buildingEditSession.isEditing(__buildingQA.buildingId)), true);
      // 3G-D: real browsers expose scoped, initially disabled accepted-edit history.
      assert.equal(await page.locator('#buildingHistoryUndo').isDisabled(), true);
      assert.equal(await page.locator('#buildingHistoryRedo').isDisabled(), true);
      assert.match(await page.locator('#buildingHistoryStatus').innerText(), /session history/i);
      assert.equal(await page.evaluate(() => document.getElementById('draftBadge').textContent), '● BUILDING EDIT MODE');
      assert.equal(await page.evaluate(() => __buildingQA.state().files.captureDocument().workspace.ui.selection?.id), buildingId);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)), geometry);
      await page.screenshot({ path: new URL(`${label}-building-edit.png`, output).pathname });
      // 3G-B: modify all three preview axes through actual UI controls, then
      // verify unchanged accepted geometry and a clean reset before exiting.
      await page.locator('#buildingOffsetX').fill('7');
      await page.locator('#buildingOffsetX').press('Tab');
      assert.equal(await page.evaluate(() => __buildingQA.state().buildingEditSession.transform.dx), 7);
      assert.match(await page.locator('#buildingPreviewMeasurements4C').innerText(),/Width.*Area.*Center/);
      await page.locator('#buildingNudgeRight4C').click();
      assert.equal(await page.evaluate(() => __buildingQA.state().buildingEditSession.transform.dx), 7.5);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),geometry);
      await page.locator('#buildingToolRotate').click();
      await page.locator('#buildingAngle').fill('30');
      await page.locator('#buildingAngle').press('Tab');
      assert.ok(await page.evaluate(() => Math.abs(__buildingQA.state().buildingEditSession.transform.angle)>0.4));
      await page.locator('#buildingToolResize').click();
      const currentWidth=await page.evaluate(() => {
        const b=__buildingQA.state().buildingEditSession.source(__buildingQA.state().project.city);
        return Math.max(...b.footprint.map(p=>p.x))-Math.min(...b.footprint.map(p=>p.x));
      });
      await page.locator('#buildingWidth').fill(String(currentWidth*1.2));
      await page.locator('#buildingWidth').press('Tab');
      assert.ok(await page.evaluate(() => __buildingQA.state().buildingEditSession.transform.scaleX>1.1));
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)), geometry);
      assert.ok(await page.evaluate(() => __buildingQA.state().buildingEditSession.isPending));
      // 3G-C: invalid geometry is editable, but Apply must be disabled.
      await page.locator('#buildingOffsetX').fill('-10000');
      await page.locator('#buildingOffsetX').press('Tab');
      assert.equal(await page.locator('#buildingPreviewApply').isDisabled(), true);
      assert.match(await page.locator('#buildingPreviewStatus').innerText(),/INVALID PLACEMENT/);
      assert.ok(await page.locator('#buildingPreviewIssues li').count() > 0);
       assert.equal(await page.locator('#mapEditDiagnostic4D').isVisible(),true);
       assert.match(await page.locator('#mapEditDiagnostic4D').innerText(),/EDIT BLOCKED.*(Property|Road|Building)/);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)), geometry);
      await page.screenshot({ path: new URL(`${label}-building-invalid.png`, output).pathname });
      await page.screenshot({ path: new URL(`${label}-building-preview.png`, output).pathname });
      page.once('dialog',dialog=>dialog.accept());
      await page.locator('#buildingPreviewReset').click();
      assert.equal(await page.evaluate(() => __buildingQA.state().buildingEditSession.isPending), false);
      if (viewport.width <= 900) await page.locator('#buildingPreviewCancel').click();
      else await page.getByRole('button', { name: 'Exit building editing' }).click();
      assert.equal(await page.evaluate(() => __buildingQA.state().buildingEditSession.isActive), false);
      assert.equal(await page.locator('#workspaceInspector').isVisible(), true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 3), 'Child Inspector must not overflow horizontally');
      await page.locator(`[data-inspector-kind="property"][data-inspector-id="${id}"]`).click();
      assert.equal(await page.locator('#workspaceSelectionType').innerText(), 'Property');
      assert.ok((await page.locator('#workspaceSelectionName').innerText()).includes(id));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 3), 'Property Inspector must not overflow horizontally');

      // Collapsing and reselecting uses the same record at the resized camera.
      await page.locator('#workspaceCloseInspector').click();
      p = await target();
      await page.mouse.click(p.x, p.y);
      assert.equal(await page.locator('#workspaceInspector').isVisible(), true);
      await page.locator('#workspaceCloseInspector').click();

      // No selection after cancelled click/drag; ordinary map dragging still pans.
      await page.evaluate(() => __buildingQA.state().workspaceShell.clear());
      p = await target();
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x + 40, p.y + 20, { steps: 5 });
      await page.mouse.up();
      assert.equal(await page.evaluate(() => __buildingQA.state().workspaceShell.state.selection), null);
      p = await target();
      await page.mouse.click(p.x, p.y);
      assert.ok((await page.locator('#workspaceSelectionName').innerText()).includes(id));
      await page.locator('#workspaceCloseInspector').click();

      await page.locator('#layersMenuButton').click();
      await page.locator('#propertiesLayer').check();
      await page.locator('#buildingsLayer').uncheck();
      await page.locator('#layersMenuClose').click();
      assert.equal(await page.evaluate(() => __buildingQA.state().workspaceShell.state.selection?.id), id);
      p = await target();
      await page.mouse.click(p.x, p.y);
      assert.equal(await page.locator('#workspaceSelectionType').innerText(), 'Property');
      assert.equal(await page.locator(`[data-inspector-kind="building"][data-inspector-id="${buildingId}"]`).isDisabled(), true);
      await page.locator('#workspaceCloseInspector').click();
      await page.locator('#layersMenuButton').click();
      await page.locator('#propertiesLayer').uncheck();
      await page.locator('#plotsLayer').uncheck();
      await page.locator('#layersMenuClose').click();
      assert.equal(await page.evaluate(() => __buildingQA.state().workspaceShell.state.selection), null);
      p = await target();
      await page.mouse.click(p.x, p.y);
      assert.equal(await page.evaluate(() => __buildingQA.state().workspaceShell.state.selection?.kind), 'district');
      // A district inspector/drawer may now cover map controls on narrow layouts.
      if (await page.locator('#workspaceInspector').isVisible()) await page.locator('#workspaceCloseInspector').click();
      if (viewport.width <= 670 && await page.locator('#workspaceTools').isVisible()) await page.locator('#workspaceCollapseTools').click();
      await page.locator('#layersMenuButton').click();
      await page.locator('#buildingsLayer').check();
      await page.locator('#layersMenuClose').click();
      p = await target();
      await page.mouse.click(p.x, p.y);
      assert.equal(await page.locator('#workspaceSelectionType').innerText(), 'Property');
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)), geometry);
      if (viewport.name === 'desktop') {
        // Local district generation and undo must refresh the selected child,
        // not replace inspection with the district editor's default selection.
        const beforeDistricts = await page.evaluate(() => __buildingQA.state().project.city);
        await page.locator(`[data-inspector-kind="building"][data-inspector-id="${buildingId}"]`).click();
        await page.locator('#workspaceTab-districts').click();
        if (await page.locator('#districtGenerationSettings').getAttribute('open') === null)
          await page.locator('#districtGenerationSettings > summary').click();
        await page.locator('#districtSeedInput').fill('3fb-browser-local-districts');
        await page.locator('#generateDistrictButton').click();
        assert.deepEqual(await page.evaluate(() => __buildingQA.state().workspaceShell.state.selection), { kind: 'building', id: buildingId });
        const ward = await page.evaluate(id => {
          const city = __buildingQA.state().project.city;
          const building = city.buildings.find(b => b.id === id);
          return city.districts.find(d => d.id === building.districtId).name;
        }, buildingId);
        await openInspectorFold(page, 'workspaceInspectorDetails');
        assert.ok((await page.locator('#workspaceSelectionSections').innerText()).includes(ward));
        await page.locator('#undoDistrictButton').click();
        assert.deepEqual(await page.evaluate(() => __buildingQA.state().project.city), beforeDistricts);
        assert.deepEqual(await page.evaluate(() => __buildingQA.state().workspaceShell.state.selection), { kind: 'building', id: buildingId });
        await page.locator(`[data-inspector-kind="property"][data-inspector-id="${id}"]`).click();
      }
      const saved = await page.evaluate(() => __buildingQA.state().files.captureDocument());
      assert.equal(saved.project.schemaVersion, 9);
      assert.equal(saved.workspace.schemaVersion, 1);
      assert.deepEqual(saved.workspace.ui.selection, { kind: 'property', id }, 'Property selection travels with schema-1 UI state');
      // 3F-C: native identity editing, scoped undo and portable metadata.
      await openIdentity(page);
      const histories = await page.evaluate(() => {
        const s = __buildingQA.state();
        return [s.editor, s.waterPanel.editor, s.terrainPanel.editor, s.districtPanel.editor, s.fortificationPanel.editor].map(e => e.history.length);
      });
      await page.locator('#identityNameInput').fill('The Silver Stag');
      await page.locator('#identityUseInput').selectOption('Inn / Tavern');
      assert.equal(await page.evaluate(id => __buildingQA.state().project.city.properties.find(p => p.id === id).customName, id), undefined);
      assert.match(await page.locator('#identityDraftState').innerText(), /Unapplied/);
      await page.locator('#identityApplyButton').click();
      assert.ok((await page.locator('#workspaceSelectionName').innerText()).includes('The Silver Stag'));
      await page.locator(`[data-inspector-kind="building"][data-inspector-id="${buildingId}"]`).click();
      assert.equal(await page.locator('#identityNameInput').inputValue(), '');
      await page.locator('#identityNameInput').fill('West Wing');
      await page.locator('#identityUseInput').selectOption('other');
      await page.locator('#identityOtherUseInput').fill('Apothecary');
      await page.locator('#identityApplyButton').click();
      assert.ok((await page.locator('#workspaceSelectionName').innerText()).includes('West Wing'));
      await page.locator(`[data-inspector-kind="property"][data-inspector-id="${id}"]`).click();
      await page.locator('#identityNameInput').fill('Pending property name');
      await page.locator(`[data-inspector-kind="building"][data-inspector-id="${buildingId}"]`).click();
      assert.equal(await page.locator('#identityNameInput').inputValue(), 'West Wing');
      await page.locator(`[data-inspector-kind="property"][data-inspector-id="${id}"]`).click();
      assert.equal(await page.locator('#identityNameInput').inputValue(), 'Pending property name');
      await page.locator('#identityDiscardButton').click();
      assert.equal(await page.locator('#identityNameInput').inputValue(), 'The Silver Stag');
      await page.locator('#identityUndoButton').click();
      assert.equal(await page.evaluate(id => __buildingQA.state().project.city.buildings.find(b => b.id === id).customName, buildingId), undefined);
      // At tablet/phone widths the Inspector intentionally overlays map controls.
      // Close it first to exercise the actual user-accessible map Undo path.
      if (viewport.width <= 900) {
        await page.locator('#workspaceCloseInspector').click();
        assert.equal(await page.locator('#workspaceInspector').isVisible(), false);
      }
      await page.locator('#workspaceUndoButton').click();
      if (viewport.width <= 900) await page.locator('#workspaceOpenInspector').click();
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)), geometry, 'Undo restores the exact city without touching geometry');
      assert.deepEqual(await page.evaluate(() => {
        const s = __buildingQA.state();
        return [s.editor, s.waterPanel.editor, s.terrainPanel.editor, s.districtPanel.editor, s.fortificationPanel.editor].map(e => e.history.length);
      }), histories);
      await page.locator('#identityNameInput').fill('The Silver Stag');
      await page.locator('#identityUseInput').selectOption('Inn / Tavern');
      await page.locator('#identityApplyButton').click();
      const identityDocument = await page.evaluate(() => __buildingQA.state().files.captureDocument());
      assert.equal(identityDocument.project.city.properties.find(p => p.id === id).customName, 'The Silver Stag');
      assert.equal(identityDocument.project.city.properties.find(p => p.id === id).customUse, 'Inn / Tavern');
      const invalid = structuredClone(identityDocument);
      invalid.project.city.properties.find(p => p.id === id).customName = 42;
      await page.locator('#projectFileInput').setInputFiles({ name: 'invalid-identity.mappo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
      await page.waitForFunction(() => document.querySelector('#fileStatus').textContent.includes('Custom name'));
      assert.equal(await page.evaluate(id => __buildingQA.state().project.city.properties.find(p => p.id === id).customName, id), 'The Silver Stag');
      await page.locator('#projectMenuClose').click();
      await page.locator('#projectFileInput').setInputFiles({ name: 'identity.mappo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(identityDocument)) });
      await page.locator('#loadPreview').waitFor({ state: 'visible' });
      await page.locator('#openProjectButton').click();
      await page.waitForFunction(() => document.querySelector('#fileStatus').textContent.startsWith('Opened '));
      await page.locator('#projectMenuClose').click();
      assert.deepEqual(await page.evaluate(() => __buildingQA.state().workspaceShell.state.selection), { kind: 'property', id }, 'Saved Inspector selection restores after loading');
      assert.equal(await page.evaluate(id => __buildingQA.state().project.city.properties.find(p => p.id === id).customName, id), 'The Silver Stag');
      assert.equal(await page.evaluate(() => __buildingQA.state().identityWorkspace.editor.history.length), 0);
      if (viewport.width <= 900 && await page.locator('#workspaceInspector').isVisible())
        await page.locator('#workspaceCloseInspector').click();
      p = await target();
      await page.mouse.click(p.x, p.y);
      await openIdentity(page);
      assert.equal(await page.locator('#identityNameInput').inputValue(), 'The Silver Stag');
      await page.screenshot({ path: new URL(`${label}-identity.png`, output).pathname });
      if (await page.locator('#workspaceInspector').isVisible()) await page.locator('#workspaceCloseInspector').click();
      if (viewport.width <= 670) await page.locator('#workspaceOpenTools').click();
      await page.locator('#generateButton').click();
      assert.equal(await page.locator('#identityRebuildWarning').isVisible(), true);
      await page.locator('#identityCancelRebuildButton').click();
      assert.equal(await page.evaluate(id => __buildingQA.state().project.city.properties.find(p => p.id === id).customName, id), 'The Silver Stag');
      await page.locator('#generateButton').click();
      await page.locator('#identityConfirmRebuildButton').click();
      assert.equal(await page.evaluate(id => __buildingQA.state().project.city.properties.find(p => p.id === id).customName, id), undefined);

      assert.equal(await page.evaluate(() => __buildingQA.state().workspaceShell.state.selection), null);
      assert.ok(await page.evaluate(id => __buildingQA.state().project.city.properties.some(p => p.id === id), id));
      assert.equal(errors.length, 0, errors.join('; '));
      console.log(`PASS property ${label}: identity apply/drafts/undo, property/child facts, import validation, save/load, rebuild confirmation`);
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
      await page.screenshot({ path: new URL(`${label}-failure.png`, output).pathname });
      console.error(`FAIL building ${label}: ${error.stack}`);
      console.error(await page.evaluate(() => ({ fileStatus: document.querySelector('#fileStatus')?.textContent,
        projectMenuVisible: !document.querySelector('#projectMenu')?.hidden,
        layersMenuVisible: !document.querySelector('#layersMenu')?.hidden })));
    } finally {
      await page.close();
    }
  }
  await browser.close();
}
if (failures.length) throw new Error(`Building browser QA failures:\n${failures.join('\n')}`);
console.log('Property/building browser QA: 8/8 browser-viewport checks passed.');
