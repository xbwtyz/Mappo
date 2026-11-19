import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const html = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
const output = new URL('../artifacts/road-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'ultrawide', width: 5120, height: 1440 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
];
const failures = [];
for (const [name, type] of [
  ['chromium', chromium],
  ['firefox', firefox],
]) {
  const browser = await type.launch({ headless: true });
  for (const viewport of viewports) {
    const label = `${name}-${viewport.name}`,
      page = await browser.newPage({ viewport, hasTouch: name === 'chromium' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(10000);
    try {
      await page.route('**/*', (route) =>
        route.request().url() === 'http://mappo.test/index.html'
          ? route.fulfill({ contentType: 'text/html', body: html })
          : route.abort(),
      );
      await page.goto('http://mappo.test/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => __buildingQA.state().files.ready);
      // Snapshot a real property selection, accepted history, camera and recovery.
      await page.evaluate(() => {
        const s = __buildingQA.state();
        s.propertyWorkspace.select({ kind: 'property', id: s.project.city.properties[0].id });
      });
      if (viewport.width <= 670) await page.locator('#workspaceCloseInspector').click();
      await page.locator('#roadModeButton').scrollIntoViewIfNeeded();
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await page.evaluate(async () => {
        const s = __buildingQA.state();
        await s.files.flush();
        __buildingQA.before = JSON.stringify(__buildingQA.capture());
        __buildingQA.revision = s.files.revision;
        __buildingQA.recovery = await s.files.store.read();
        __buildingQA.history = [
          s.buildingHistory,
          s.buildingStructureHistory,
          s.propertyHistory,
          s.propertyDeletionHistory4A,
        ].map((h) => JSON.stringify(h));
      });
      await page.locator('#roadModeButton').click();
      assert.equal(await page.locator('#roadPreviewPanel').isVisible(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'roadPreviewHeading');
      assert.equal(await page.locator('#roadApplyB4').count(), 1);
      assert.equal(await page.locator('#roadApplyB4').isDisabled(), true);
      assert.equal(await page.locator('#roadHistoryUndoB4').isDisabled(), true);
      assert.equal(await page.locator('#roadApplyStatusB4').getAttribute('role'), 'status');
      assert.equal(await page.locator('#roadReportStatus').getAttribute('role'), 'status');
      assert.equal(await page.locator('#roadReconciliationB3').isVisible(), true);
      assert.equal(await page.locator('#roadReconciliationStatusB3').getAttribute('role'), 'status');
      assert.equal(await page.locator('#roadOverlayB3').isChecked(), true);
      await page.locator('#roadOverlayB3').uncheck();
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.previewVisible), false);
      await page.locator('#roadOverlayB3').check();
      const id = await page.evaluate(() => __buildingQA.state().roadWorkspace.session.selection.id);
      // Move the inspected junction to an unobstructed map location. Camera
      // adjustments are transient; the serialized view must remain the baseline.
      const place = async (point = null) => {
        await page.evaluate((point) => {
          const s = __buildingQA.state(),
            p = point ?? s.roadWorkspace.session.point;
          s.camera.zoom = 3;
          s.camera.x = p.x - 80 / s.camera.zoom;
          s.camera.y = p.y + (s.camera.height * 0.24) / s.camera.zoom;
          __buildingQA.draw();
        }, point);
        const p = await page.evaluate(() => {
          const s = __buildingQA.state();
          return s.camera.worldToScreen(s.roadWorkspace.session.point);
        });
        const box = await page.locator('#mapCanvas').boundingBox();
        return { x: box.x + p.x, y: box.y + p.y };
      };
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      let p = await place();
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x + 5, p.y + 3, { steps: 4 });
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.checking), true);
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.report), null);
      await page.mouse.up();
      await page.waitForFunction(() => Boolean(__buildingQA.state().roadWorkspace.session.report));
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.selection.id), id);
      const expected = await page.evaluate(() => {
        const s = __buildingQA.state(),
          session = s.roadWorkspace.session;
        // Compare displayed status, counts and every list description with A3's
        // unaltered report. Core classification is tested separately in Node.
        return {
          status: session.report.status,
          counts: session.report.counts,
          rows: session.report.affected.slice(0, 50),
        };
      });
      const statusText = await page.locator('#roadReportStatus').innerText();
      assert.ok(
        statusText.startsWith(
          { safe: 'Safe', 'needs-review': 'Needs review', invalid: 'Invalid' }[expected.status],
        ),
      );
      assert.ok(statusText.includes(`${expected.counts.affectedObjects} affected`));
      // A5 groups repeated issues into collapsed details. Check every preserved
      // ID and message, including rows not initially expanded in the UI.
      while (await page.locator('#roadShowMore').isVisible())
        await page.locator('#roadShowMore').click();
      const descriptions = await page.locator('#roadReportList').textContent();
      for (const row of expected.rows) {
        assert.ok(descriptions.includes(row.id));
        assert.ok(descriptions.includes(row.message));
      }
      await page.locator('#roadPreviewReset').click();
      assert.ok((await page.locator('#roadReportStatus').innerText()).startsWith('Accepted position'));
      // Numeric invalid -> corrected clears stale issues and uses A3 again.
      const original = await page.evaluate(() => ({ ...__buildingQA.state().roadWorkspace.session.point }));
      await page.locator('#roadProposedX').fill('200000');
      await page.waitForFunction(
        () => __buildingQA.state().roadWorkspace.session.report?.status === 'invalid',
      );
      assert.ok((await page.locator('#roadReportStatus').innerText()).startsWith('Invalid'));
      await page.locator('#roadProposedX').fill(String(original.x + 0.01));
      await page.waitForFunction(() =>
        ['safe', 'needs-review'].includes(__buildingQA.state().roadWorkspace.session.report?.status),
      );
      assert.equal(
        await page.locator('#roadPreviewPanel').getAttribute('data-report-status'),
        await page.evaluate(() => __buildingQA.state().roadWorkspace.session.report.status),
      );
      // All preview data, pan/zoom, file downloads and recovery captures exclude
      // road mode. Flush a pre-existing recovery write while preview is active.
      assert.equal(
        await page.evaluate(() => JSON.stringify(__buildingQA.capture()) === __buildingQA.before),
        true,
      );
      const after = await page.evaluate(async () => {
        const s = __buildingQA.state();
        await s.files.flush();
        const recovery = await s.files.store.read();
        return {
          same: s.files.revision === __buildingQA.revision,
          current: JSON.parse(recovery.current),
          before: JSON.parse(__buildingQA.recovery.current),
          history: [
            s.buildingHistory,
            s.buildingStructureHistory,
            s.propertyHistory,
            s.propertyDeletionHistory4A,
          ].map((h) => JSON.stringify(h)),
          expectedHistory: __buildingQA.history,
        };
      });
      assert.equal(after.same, true);
      delete after.current.savedAt;
      delete after.before.savedAt;
      assert.deepEqual(after.current, after.before);
      assert.deepEqual(after.history, after.expectedHistory);
      const downloading = page.waitForEvent('download');
      await page.locator('#projectMenuButton').click();
      await page.locator('#saveProjectButton').click();
      const download = await downloading;
      const portable = JSON.parse(await readFile(await download.path(), 'utf8'));
      const baseline = await page.evaluate(() => JSON.parse(__buildingQA.before));
      assert.deepEqual(portable.project, baseline.project);
      assert.deepEqual(portable.workspace, baseline.workspace);
      await page.locator('#roadProposedX').focus(); // closes the nonmodal Project menu
      // Keyboard nudging is scoped to the canvas, with native input arrows intact.
      await page.locator('#roadPreviewReset').click();
      await page.locator('#mapCanvas').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(
        await page.evaluate(() => __buildingQA.state().roadWorkspace.session.point.x),
        original.x + 0.5,
      );
      await page.keyboard.press('Control+z');
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.pending), false);
      await page.locator('#roadProposedX').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.pending), false);
      // Touch selection/drag through the real pointer controller; Firefox's
      // synthetic touch PointerEvent supplies the same event API as hardware.
      p = await place();
      if (name === 'chromium') {
        const cdp = await page.context().newCDPSession(page);
        for (const [type, x, y] of [
          ['touchStart', p.x, p.y],
          ['touchMove', p.x + 4, p.y + 2],
          ['touchEnd', p.x + 4, p.y + 2],
        ])
          await cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }],
          });
        await cdp.detach();
      } else {
        // Firefox Playwright cannot inject native touch drags. Dispatch the
        // hardware-equivalent PointerEvents and bypass capture only for this
        // synthetic pointer, which the browser never registers as active.
        await page.locator('#mapCanvas').evaluate((canvas) => {
          canvas.qaCapture = canvas.setPointerCapture;
          canvas.setPointerCapture = function (id) {
            if (id !== 7) this.qaCapture(id);
          };
        });
        for (const [event, x, y] of [
          ['pointerdown', p.x, p.y],
          ['pointermove', p.x + 4, p.y + 2],
          ['pointerup', p.x + 4, p.y + 2],
        ])
          await page.locator('#mapCanvas').dispatchEvent(event, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            button: 0,
            clientX: x,
            clientY: y,
            bubbles: true,
          });
        await page.locator('#mapCanvas').evaluate((canvas) => {
          canvas.setPointerCapture = canvas.qaCapture;
          delete canvas.qaCapture;
        });
      }
      await page.waitForFunction(() => Boolean(__buildingQA.state().roadWorkspace.session.report));
      // Protected records remain reachable by keyboard list and map tapping.
      const protectedId = await page.evaluate(() => {
        const session = __buildingQA.state().roadWorkspace.session;
        return [...session.graph.nodesById.keys()].find((id) =>
          session.graph.incidentRoads.get(id).some((r) => session.graph.roadClasses.get(r).protected),
        );
      });
      await page.locator('#roadSelectionId').selectOption(protectedId);
      assert.equal(await page.locator('#roadProposedX').isDisabled(), true);
      assert.ok((await page.locator('#roadRecordDetails').innerText()).includes('Protected:'));
      await page.locator('#roadSelectionKind').selectOption('road');
      // Road-first C1 must keep an intentionally large street move as an
      // inspectable draft even if existing parcels cannot accept it yet.
      const ordinaryId = await page.evaluate(() => {
        const session=__buildingQA.state().roadWorkspace.session,graph=session.graph;
        const length=road=>{
          const a=graph.nodesById.get(road.a),b=graph.nodesById.get(road.b);
          return Math.hypot(a.x-b.x,a.y-b.y);
        };
        return [...graph.roadsById.values()].filter(road=>
          [road.a,road.b].every(id=>
            graph.incidentRoads.get(id).every(edge=>!graph.roadClasses.get(edge).protected)))
          .sort((a,b)=>length(b)-length(a))[0]?.id;
      });
      assert.ok(ordinaryId,'A generated city needs at least one ordinary movable segment.');
      await page.locator('#roadSelectionId').selectOption(ordinaryId);
      assert.equal(await page.locator('#roadIntentPanelC1').isVisible(),true);
      await page.locator('#roadIntentDxC1').fill('15');
      await page.waitForFunction(() =>
        __buildingQA.state().roadWorkspace.session.roadIntentAnalysis?.draftable===true);
      const roadIntent=await page.evaluate(() => {
        const {project,roadWorkspace,files}=__buildingQA.state(),session=roadWorkspace.session,
          analysis=session.roadIntentAnalysis;
        const accepted=new Map(project.city.nodes.map(n=>[n.id,n]));
        return {
          pending:session.pending,applyReady:analysis.applyReady,
          draftable:analysis.draftable,changedRoads:analysis.changedRoadIds.length,
          displaced:analysis.proposedNodes.every(n=>Math.abs(n.x-accepted.get(n.id).x-15)<1e-8 &&
            n.y===accepted.get(n.id).y),
          acceptedUnchanged:JSON.stringify(__buildingQA.capture())===__buildingQA.before,
          recoveryUnchanged:files.revision===__buildingQA.revision
        };
      });
      assert.equal(roadIntent.pending,true);
      assert.equal(roadIntent.applyReady,false);
      assert.equal(roadIntent.draftable,true);
      assert.ok(roadIntent.changedRoads>0);
      assert.equal(roadIntent.displaced,true);
      assert.equal(roadIntent.acceptedUnchanged,true);
      assert.equal(roadIntent.recoveryUnchanged,true);
      assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
      assert.ok((await page.locator('#roadIntentStatusC1').innerText()).includes('draft'));
      // Invalid/blank coordinates are not road drafts. No stale proposal is
      // allowed to remain visible while the user edits a numeric input.
      await page.locator('#roadIntentDxC1').fill('');
      const invalid=await page.evaluate(()=>{
        const s=__buildingQA.state().roadWorkspace.session;
        return {pending:s.pending,proposal:s.roadIntentAnalysis,ghost:s.roadIntentNodes,
          error:s.roadIntentInputError};
      });
      assert.equal(invalid.pending,false);
      assert.equal(invalid.proposal,null);
      assert.equal(invalid.ghost,null);
      assert.match(invalid.error,/finite/);
      assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
      await page.locator('#roadIntentDxC1').fill('15');
      await page.waitForFunction(() =>
        __buildingQA.state().roadWorkspace.session.roadIntentAnalysis?.draftable===true);
      await page.locator('#roadPreviewReset').click();

      // Actual mouse-drag on the map: this must not merely test a text field.
      // Keep the road midpoint clear of the Road Inspection panel at all sizes.
      const placeRoad=()=>page.evaluate(()=>{
        const s=__buildingQA.state(),session=s.roadWorkspace.session;
        const road=session.details.record,graph=session.graph;
        const a=graph.nodesById.get(road.a),b=graph.nodesById.get(road.b);
        const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        const canvas=document.getElementById('mapCanvas');
        const rect=canvas.getBoundingClientRect();
        // Responsive road controls move to the map's bottom on phones.
        // Pick a truly unobstructed *canvas* location rather than assuming
        // the upper-right 80% position is always safe to click.
        const candidates=[[.55,.35],[.45,.36],[.60,.40],[.40,.42],
          [.70,.37],[.35,.37],[.55,.46],[.73,.45],[.30,.54]];
        const target=candidates.find(([fx,fy])=>
          document.elementFromPoint(rect.left+rect.width*fx,
            rect.top+rect.height*fy)===canvas);
        if(!target)throw new Error('No unobstructed canvas region for road gesture QA');
        s.camera.zoom=5;
        const targetX=rect.width*target[0],targetY=rect.height*target[1];
        s.camera.x=mid.x-(targetX-s.camera.width/2)/s.camera.zoom;
        s.camera.y=mid.y-(targetY-s.camera.height/2)/s.camera.zoom;
        __buildingQA.draw();
        const pos=s.camera.worldToScreen(mid);
        return {x:rect.left+pos.x,y:rect.top+pos.y};
      });
      const center=await placeRoad();
      const targetHit=await page.evaluate(pos=>{
        const element=document.elementFromPoint(pos.x,pos.y),s=__buildingQA.state(),
          canvas=document.getElementById('mapCanvas'),rect=canvas.getBoundingClientRect(),
          world=s.camera.screenToWorld({x:pos.x-rect.left,y:pos.y-rect.top});
        return {target:element?.id??element?.tagName,
          hit:s.roadWorkspace.session.hit(world,s.camera.zoom,'mouse')};
      },center);
      assert.equal(targetHit.target,'mapCanvas',
        'The gesture target must be unobstructed canvas, not mobile map controls');
      assert.equal(targetHit.hit?.kind,'road',
        'Map hit testing must identify the selected road at the gesture start');
      await page.mouse.move(center.x,center.y);
      await page.mouse.down();
      assert.equal(await page.evaluate(() =>
        __buildingQA.state().roadWorkspace.session.drag?.kind),'road',
        'Mouse press on the selected road midpoint must begin a road drag.');
      await page.mouse.move(center.x+35,center.y-20,{steps:5});
      await page.mouse.up();
      await page.waitForFunction(() =>
        __buildingQA.state().roadWorkspace.session.roadIntentAnalysis?.draftable===true);
      const mouseDraft=await page.evaluate(()=>{
        const s=__buildingQA.state();
        return {dx:s.roadWorkspace.session.roadIntentOffset.x,
          dy:s.roadWorkspace.session.roadIntentOffset.y,
          pending:s.roadWorkspace.session.pending,revision:s.files.revision};
      });
      assert.ok(Math.abs(mouseDraft.dx-7)<.25,'Mouse drag should translate road X by 7 world units');
      assert.ok(Math.abs(mouseDraft.dy+4)<.25,'Mouse drag should translate road Y by -4 world units');
      assert.equal(mouseDraft.pending,true);
      assert.equal(mouseDraft.revision,await page.evaluate(()=>__buildingQA.revision));

      // Continue dragging from the *proposed*, not the old, road position.
      const ghost=await page.evaluate(()=>{
        const s=__buildingQA.state(),session=s.roadWorkspace.session,
          graph=session.graph,road=session.details.record,nodes=session.roadIntentNodes;
        const a=nodes.get(road.a),b=nodes.get(road.b),
          point=s.camera.worldToScreen({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
        const rect=document.getElementById('mapCanvas').getBoundingClientRect();
        return {x:rect.x+point.x,y:rect.y+point.y};
      });
      await page.mouse.move(ghost.x,ghost.y);
      await page.mouse.down();
      assert.equal(await page.evaluate(()=>
        __buildingQA.state().roadWorkspace.session.drag?.kind),'road');
      await page.mouse.move(ghost.x+15,ghost.y+5,{steps:3});
      await page.mouse.up();
      await page.waitForFunction(()=>
        __buildingQA.state().roadWorkspace.session.roadIntentAnalysis?.draftable===true);
      assert.ok((await page.evaluate(()=>
        __buildingQA.state().roadWorkspace.session.roadIntentOffset.x))>mouseDraft.dx+2);
      await page.screenshot({path:new URL(`${label}-road-first.png`,output).pathname});
      await page.locator('#roadPreviewReset').click();

      // Space + left-drag must pan rather than altering the selected street.
      const panFrom=await placeRoad();
      const cameraBefore=await page.evaluate(()=>__buildingQA.state().camera.x);
      await page.locator('#mapCanvas').focus();
      await page.keyboard.down('Space');
      await page.mouse.move(panFrom.x,panFrom.y);
      await page.mouse.down();
      await page.mouse.move(panFrom.x+24,panFrom.y+12,{steps:3});
      await page.mouse.up();
      await page.keyboard.up('Space');
      assert.equal(await page.evaluate(()=>
        __buildingQA.state().roadWorkspace.session.pending),false);
      assert.notEqual(await page.evaluate(()=>__buildingQA.state().camera.x),cameraBefore);

      // Touch must use the same real canvas pointer controller. Chromium
      // receives native dispatched touch events; Firefox receives equivalent
      // synthetic PointerEvents with capture bypass for synthetic pointer #77.
      const touchFrom=await placeRoad();
      if(name==='chromium'){
        const cdp=await page.context().newCDPSession(page);
        for(const [type,x,y] of [
          ['touchStart',touchFrom.x,touchFrom.y],
          ['touchMove',touchFrom.x+30,touchFrom.y+16],
          ['touchEnd',touchFrom.x+30,touchFrom.y+16],
        ])await cdp.send('Input.dispatchTouchEvent',{
          type,touchPoints:type==='touchEnd'?[]:[{x,y,id:77}]
        });
        await cdp.detach();
      }else{
        await page.locator('#mapCanvas').evaluate(canvas=>{
          canvas.qaCapture=canvas.setPointerCapture;
          canvas.setPointerCapture=function(id){if(id!==77)this.qaCapture(id);};
        });
        for(const [event,x,y] of [
          ['pointerdown',touchFrom.x,touchFrom.y],
          ['pointermove',touchFrom.x+30,touchFrom.y+16],
          ['pointerup',touchFrom.x+30,touchFrom.y+16]
        ])await page.locator('#mapCanvas').dispatchEvent(event,{
          pointerId:77,pointerType:'touch',isPrimary:true,button:0,
          clientX:x,clientY:y,bubbles:true,
        });
        await page.locator('#mapCanvas').evaluate(canvas=>{
          canvas.setPointerCapture=canvas.qaCapture;delete canvas.qaCapture;
        });
      }
      await page.waitForFunction(()=>
        __buildingQA.state().roadWorkspace.session.roadIntentAnalysis?.draftable===true);
      const touchDraft=await page.evaluate(()=>{
        const s=__buildingQA.state();
        return {offset:s.roadWorkspace.session.roadIntentOffset,
          pending:s.roadWorkspace.session.pending};
      });
      assert.equal(touchDraft.pending,true);
      assert.ok(Math.abs(touchDraft.offset.x)>1);
      assert.ok(Math.abs(touchDraft.offset.y)>1);
      assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
      await page.locator('#roadPreviewReset').click();

      // Cancellation of a captured touch pointer rolls back the unaccepted
      // gesture. The project and saved revision remain untouched.
      const cancelFrom=await placeRoad();
      await page.locator('#mapCanvas').evaluate(canvas=>{
        canvas.qaCapture=canvas.setPointerCapture;
        canvas.setPointerCapture=function(id){if(id!==88)this.qaCapture(id);};
      });
      for(const [event,x,y] of [
        ['pointerdown',cancelFrom.x,cancelFrom.y],
        ['pointermove',cancelFrom.x+30,cancelFrom.y+12],
        ['pointercancel',cancelFrom.x+30,cancelFrom.y+12]
      ])await page.locator('#mapCanvas').dispatchEvent(event,{
        pointerId:88,pointerType:'touch',isPrimary:true,button:0,
        clientX:x,clientY:y,bubbles:true,
      });
      await page.locator('#mapCanvas').evaluate(canvas=>{
        canvas.setPointerCapture=canvas.qaCapture;delete canvas.qaCapture;
      });
      assert.equal(await page.evaluate(()=>
        __buildingQA.state().roadWorkspace.session.pending),false);
      assert.equal(await page.evaluate(()=>
        JSON.stringify(__buildingQA.capture())===__buildingQA.before),true);
      assert.equal(await page.evaluate(()=>
        __buildingQA.state().files.revision===__buildingQA.revision),true);

      assert.ok((await page.locator('#roadAcceptedPoint').innerText()).includes('Endpoints'));
      assert.ok((await page.locator('#roadEndpointList button').count()) === 2);
      await page.locator('#roadEndpointList button').first().click();
      assert.equal(await page.locator('#roadSelectionKind').inputValue(), 'junction');
      await page.locator('#roadSelectionId').selectOption(id);
      await page.locator('#roadProposedX').fill(String(original.x + 0.01));
      await page.waitForFunction(() => Boolean(__buildingQA.state().roadWorkspace.session.report));
      // Keep a review screenshot for visual inspection at all viewport sizes.
      await page.screenshot({ path: new URL(`${label}.png`, output).pathname });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, 'No horizontal page overflow');
      const panel = await page.locator('#roadPreviewPanel').boundingBox();
      assert.ok(panel.width >= 270 && panel.x >= 0 && panel.x + panel.width <= viewport.width);
      await page.locator('#roadPreviewMinimize').click();
      assert.equal(await page.locator('#roadPreviewBody').isVisible(), false);
      await page.locator('#roadPreviewMinimize').click();
      // Escape from a numeric input cancels deferred analysis and restores the
      // exact initial view/selection without advancing the file revision.
      await page.locator('#roadProposedX').fill(String(original.x + 0.02));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(240);
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.active), false);
      assert.equal(
        await page.evaluate(() => JSON.stringify(__buildingQA.capture()) === __buildingQA.before),
        true,
      );
      assert.equal(
        await page.evaluate(() => __buildingQA.state().files.revision === __buildingQA.revision),
        true,
      );
      // Route changes and replacement cancel pending work, then ordinary roof
      // selection again resolves to the property-first workflow.
      await page.locator('#roadModeButton').click();
      await page.locator('#roadNudgeRight').click();
      await page.locator('#workspaceTab-landscape').click();
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.active), false);
      await page.locator('#workspaceTab-city').click();
      await page.locator('#roadModeButton').click();
      await page.locator('#roadNudgeRight').click();
      await page.evaluate(() => {
        const saved = JSON.parse(__buildingQA.before);
        __buildingQA.apply({ project: saved.project, workspace: saved.workspace });
      });
      await page.waitForTimeout(240);
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.report), null);
      assert.equal(await page.locator('#roadPreviewPanel').isVisible(), false);
      // A valid undeveloped city exposes the Safe state through the same UI.
      await page.evaluate(() => {
        const saved = JSON.parse(__buildingQA.before),
          city = saved.project.city;
        city.properties = [];
        city.plots = [];
        city.buildings = [];
        city.openSpaces = city.blocks.map((b) => ({
          id: `OPEN-${b.id}`,
          blockId: b.id,
          kind: 'undeveloped',
          area: b.area,
        }));
        saved.workspace.ui.selection = null;
        __buildingQA.apply(saved);
      });
      await page.locator('#roadModeButton').click();
      const safePoint = await page.evaluate(() => __buildingQA.state().roadWorkspace.session.point);
      await page.locator('#roadProposedX').fill(String(safePoint.x + 0.01));
      await page.waitForFunction(() => __buildingQA.state().roadWorkspace.session.report?.status === 'safe');
      assert.ok((await page.locator('#roadReportStatus').innerText()).startsWith('Safe'));
      await page.locator('#roadPreviewCancel').click();
      const project = createProject({seed:'c2-planned',size:'small',morphology:'planned'});
      await page.evaluate(doc => {
        __buildingQA.apply(doc);
        const s = __buildingQA.state();
        __buildingQA.c2Before = JSON.stringify(s.project);
      }, {project, workspace:defaultWorkspace(project)});
      await page.locator('#roadModeButton').click();
      await page.evaluate(() => { __buildingQA.c2Revision = __buildingQA.state().files.revision; });
      await page.locator('#roadSelectionKind').selectOption('road');
      await page.locator('#roadSelectionId').selectOption('RD-0113');
      await page.locator('#roadIntentDxC1').fill('12');
      await page.waitForFunction(() => !document.querySelector('#roadApplyB4').disabled);
      assert.match(await page.locator('#roadReconciliationListB3').innerText(), /Generated replacement/);
      assert.equal(await page.evaluate(() => __buildingQA.state().files.revision === __buildingQA.c2Revision), true);
      await page.locator('#roadApplyB4').click();
      const applied = await page.evaluate(() => JSON.stringify(__buildingQA.state().project));
      assert.equal(await page.evaluate(() => __buildingQA.state().files.revision === __buildingQA.c2Revision + 1), true);
      assert.notEqual(applied, await page.evaluate(() => __buildingQA.c2Before));
      assert.equal(await page.evaluate(() => __buildingQA.moveRoadHistory('undo')), true);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project) === __buildingQA.c2Before), true);
      assert.equal(await page.evaluate(() => __buildingQA.moveRoadHistory('redo')), true);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project)), applied);
      if (viewport.name === 'desktop') {
        const radial = createProject({seed:'c2-radial',size:'small',morphology:'radial'});
        for (const [id, delta] of [['RD-0103', 1], ['RD-0099', -1]]) {
          await page.evaluate(doc => __buildingQA.apply(doc), {project:radial, workspace:defaultWorkspace(radial)});
          await page.locator('#roadModeButton').click();
          await page.locator('#roadSelectionKind').selectOption('road');
          await page.locator('#roadSelectionId').selectOption(id);
          if (delta === 1) {
            await page.locator('#roadIntentDyC1').fill('15');
          } else {
            await page.locator('#roadIntentPanelC1 summary').click();
            await page.locator('#roadRemoveC3').click();
          }
          await page.waitForFunction(() => !document.querySelector('#roadApplyB4').disabled);
          assert.match(await page.locator('#roadReconciliationListB3').innerText(),
            delta === 1 ? /New junction/ : /Removed street/);
          await page.locator('#roadApplyB4').click();
          assert.equal(await page.evaluate(() => __buildingQA.state().project.city.blocks.length), radial.city.blocks.length + delta);
          assert.equal(await page.evaluate(() => __buildingQA.moveRoadHistory('undo')), true);
          assert.equal(await page.evaluate(() => __buildingQA.state().project.city.blocks.length), radial.city.blocks.length);
        }
      }
      assert.equal(errors.length, 0, errors.join('; '));
      console.log(
        `PASS road ${label}: inspection, mouse/touch/keyboard preview, A3 report, reset/cancel, save/recovery isolation`,
      );
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
      console.error(`FAIL road ${label}: ${error.stack}`);
      await page.screenshot({ path: new URL(`${label}-failure.png`, output).pathname });
    } finally {
      await page.close();
    }
  }
  await browser.close();
}
if (failures.length) throw new Error(`Road browser QA failures:\n${failures.join('\n')}`);
console.log('Road browser QA: 8/8 browser-viewport checks passed.');
