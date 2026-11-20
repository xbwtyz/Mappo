import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { createProjectDocument, decodeProjectDocument, defaultWorkspace, encodeProjectDocument } from '../src/data/project-format.js';
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
      const controls = page.locator('#roadEditControlsD1 > summary');
      const details = page.locator('#roadDetailsD1 > summary');
      const openRoadEditor = async (editControls = true) => {
        await page.locator('#roadModeButton').click();
        if (editControls) await controls.click();
      };
      await openRoadEditor(false);
      assert.equal(await page.locator('#roadPreviewPanel').isVisible(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'roadPreviewHeading');
      assert.equal(await page.locator('#roadApplyB4').count(), 1);
      assert.equal(await page.locator('#roadApplyB4').isDisabled(), true);
      assert.equal(await page.locator('#roadHistoryUndoB4').isDisabled(), true);
      assert.equal(await page.locator('#roadPreviewPanel [role="status"]').count(),1);
      assert.equal(await page.locator('#roadDetailsD1').evaluate(el=>el.open),false);
      assert.equal(await page.locator('#roadEditControlsD1').evaluate(el=>el.open),false);
      assert.equal(await page.locator('#roadReconciliationB3').isVisible(),false);
      await details.click();
      assert.equal(await page.locator('#roadOverlayB3').isChecked(), true);
      await page.locator('#roadOverlayB3').uncheck();
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.previewVisible), false);
      await page.locator('#roadOverlayB3').check();
      await details.click();
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
          ready: !document.querySelector('#roadApplyB4').disabled,
          rows: session.report.affected.slice(0, 50),
        };
      });
      if (expected.ready) {
        assert.equal(await page.locator('#roadReportStatus').innerText(),'Preview ready');
        assert.equal(await page.locator('#roadChangeSummaryD1').isVisible(),true);
      } else {
        assert.match(await page.locator('#roadReportStatus').innerText(),/blocked|choice|only/i);
      }
      assert.equal(await page.locator('#roadDetailsD1').evaluate(el=>el.open),false);
      await details.click();
      // A5 groups repeated issues into collapsed details. Check every preserved
      // ID and message, including rows not initially expanded in the UI.
      while (await page.locator('#roadShowMore').isVisible())
        await page.locator('#roadShowMore').click();
      const descriptions = await page.locator('#roadReportList').textContent();
      for (const row of expected.rows) {
        assert.ok(descriptions.includes(row.id));
        assert.ok(descriptions.includes(row.message));
      }
      await details.click();
      await controls.click();
      await page.locator('#roadPreviewReset').click();
      assert.ok((await page.locator('#roadReportStatus').innerText()).startsWith('Accepted position'));
      // Numeric invalid -> corrected clears stale issues and uses A3 again.
      const original = await page.evaluate(() => ({ ...__buildingQA.state().roadWorkspace.session.point }));
      await page.locator('#roadProposedX').fill('200000');
      await page.waitForFunction(
        () => __buildingQA.state().roadWorkspace.session.report?.status === 'invalid',
      );
      assert.equal(await page.locator('#roadReportStatus').innerText(),'Preview blocked');
      assert.equal(await page.locator('#roadChangeSummaryD1').isVisible(),false);
      assert.equal(await page.locator('#roadRecoveryD3').isVisible(),true);
      assert.match(await page.locator('#roadRecoveryHeadingD3').innerText(),/Coordinates cannot be used/);
      assert.equal(await page.locator('#roadRecoveryLocateD3').isVisible(),false);
      await page.locator('#roadRecoveryPrimaryD3').click();
      assert.equal(await page.locator('#roadEditControlsD1').evaluate(el=>el.open),true);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'roadProposedX');
      await page.locator('#roadProposedX').fill(String(original.x + 0.01));
      await page.waitForFunction(() =>
        ['safe', 'needs-review'].includes(__buildingQA.state().roadWorkspace.session.report?.status),
      );
      assert.equal(
        await page.locator('#roadPreviewPanel').getAttribute('data-report-status'),
        await page.evaluate(() => {
          const {session}=__buildingQA.state().roadWorkspace;
          return !document.querySelector('#roadApplyB4').disabled ? 'safe' :
            session.previewGeometry?.mode==='topology-only' ? 'needs-review' : 'invalid';
        }),
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
      // A large street move stays detached from the saved city until Apply.
      // Neighborhood reflow may now make this draft eligible.
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
          reconciled:session.reconciliation?.validation?.project === 'valid' &&
            session.hasApplyCandidate,
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
      assert.equal(await page.locator('#roadApplyB4').isDisabled(), !roadIntent.reconciled);
      assert.match(await page.locator('#roadIntentStatusC1').innerText(),
        roadIntent.reconciled ? /ready to review/ : /held in draft/);
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
      assert.match(await page.locator('#roadApplyStatusB4').innerText(), /finite/);
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
        const {roadWorkspace,files}=__buildingQA.state(), session=roadWorkspace.session;
        return {offset:session.roadIntentOffset, pending:session.pending,
          reconciled:session.reconciliation?.validation?.project === 'valid' &&
            session.hasApplyCandidate,
          acceptedUnchanged:JSON.stringify(__buildingQA.capture())===__buildingQA.before,
          recoveryUnchanged:files.revision===__buildingQA.revision};
      });
      assert.equal(touchDraft.pending,true);
      assert.ok(Math.abs(touchDraft.offset.x)>1);
      assert.ok(Math.abs(touchDraft.offset.y)>1);
      assert.equal(touchDraft.acceptedUnchanged,true);
      assert.equal(touchDraft.recoveryUnchanged,true);
      assert.equal(await page.locator('#roadApplyB4').isDisabled(),!touchDraft.reconciled);
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
      await openRoadEditor();
      await page.locator('#roadNudgeRight').click();
      await page.locator('#workspaceTab-landscape').click();
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.active), false);
      await page.locator('#workspaceTab-city').click();
      await openRoadEditor();
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
      await openRoadEditor();
      const safePoint = await page.evaluate(() => __buildingQA.state().roadWorkspace.session.point);
      await page.locator('#roadProposedX').fill(String(safePoint.x + 0.01));
      await page.waitForFunction(() => __buildingQA.state().roadWorkspace.session.report?.status === 'safe');
      assert.equal(await page.locator('#roadReportStatus').innerText(),'Preview ready');
      await page.locator('#roadPreviewCancel').click();
      const project = createProject({seed:'c2-planned',size:'small',morphology:'planned'});
      await page.evaluate(doc => {
        __buildingQA.apply(doc);
        const s = __buildingQA.state();
        __buildingQA.c2Before = JSON.stringify(s.project);
      }, {project, workspace:defaultWorkspace(project)});
      await openRoadEditor();
      await page.evaluate(() => { __buildingQA.c2Revision = __buildingQA.state().files.revision; });
      await page.locator('#roadSelectionKind').selectOption('road');
      await page.locator('#roadSelectionId').selectOption('RD-0113');
      await page.locator('#roadIntentDxC1').fill('12');
      await page.waitForFunction(() => !document.querySelector('#roadApplyB4').disabled);
      await controls.click();
      assert.equal(await page.locator('#roadDetailsD1').evaluate(el=>el.open),false);
      assert.match(await page.locator('#roadChangeSummaryD1').innerText(),
        /Rebuild development \(4 existing buildings replaced, 2 generated\).*Reconnect access for 1 building/);
      assert.equal(await page.evaluate(() => {
        const body = document.querySelector('#roadPreviewBody').getBoundingClientRect();
        return [...document.querySelectorAll('.road-preview-disclosures-d1 > details > summary')].every(el => {
          const box = el.getBoundingClientRect();
          return box.top >= body.top - 1 && box.bottom <= body.bottom + 1;
        });
      }), true, 'Both disclosures must be reachable in the compact preview');
      await details.click();
      assert.match(await page.locator('#roadReconciliationListB3').innerText(), /Generated replacement/);
      assert.ok(await page.locator('#roadReconciliationListB3 .road-change-group-d1 h4').count());
      await details.click();
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
          await openRoadEditor();
          await page.locator('#roadSelectionKind').selectOption('road');
          await page.locator('#roadSelectionId').selectOption(id);
          if (delta === 1) {
            await page.locator('#roadIntentDyC1').fill('15');
          } else {
            await page.locator('#roadIntentPanelC1 summary').click();
            await page.locator('#roadRemoveC3').click();
          }
          await page.waitForFunction(() => !document.querySelector('#roadApplyB4').disabled);
          await details.click();
          assert.match(await page.locator('#roadReconciliationListB3').innerText(),
            delta === 1 ? /New junction/ : /Removed street/);
          assert.match(await page.locator('#roadReconciliationListB3').innerText(), /Related blocks/);
          await details.click();
          await page.locator('#roadApplyB4').click();
          assert.equal(await page.evaluate(() => __buildingQA.state().project.city.blocks.length), radial.city.blocks.length + delta);
          assert.equal(await page.evaluate(() => __buildingQA.moveRoadHistory('undo')), true);
          assert.equal(await page.evaluate(() => __buildingQA.state().project.city.blocks.length), radial.city.blocks.length);
        }
      }
      await page.evaluate(doc => __buildingQA.apply(doc), {project, workspace:defaultWorkspace(project)});
      await openRoadEditor();
      const bendBaseline=await page.evaluate(() => JSON.stringify(__buildingQA.state().project));
      await page.locator('#roadSelectionKind').selectOption('road');
      await page.locator('#roadSelectionId').selectOption('RD-0113');
      await page.locator('#roadStartBendsC4').click();
      await page.locator('#roadInsertBendC4').click();
      await page.getByLabel('Snap drags to 1-unit grid').check();
      const handle=await placeRoad();
      if (name === 'chromium' && viewport.name === 'phone') {
        const cdp=await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[handle]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:handle.x+20,y:handle.y+10}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await cdp.detach();
      } else {
        await page.mouse.move(handle.x,handle.y);
        await page.mouse.down();
        await page.mouse.move(handle.x+20,handle.y+10,{steps:3});
        await page.mouse.up();
      }
      const snapped=await page.evaluate(() => {
        const {bendEditor}=__buildingQA.state().roadWorkspace.session;
        return {point:bendEditor.points[0], original:bendEditor.path.points};
      });
      assert.equal(Number.isInteger(snapped.point.x) && Number.isInteger(snapped.point.y),true);
      const [start,end]=snapped.original, dx=end.x-start.x, dy=end.y-start.y, length=Math.hypot(dx,dy);
      const target={x:start.x+.33*dx-4*dy/length,y:start.y+.33*dy+4*dx/length};
      const xField=page.locator('#roadBendXC4'), yField=page.locator('#roadBendYC4');
      await xField.fill(String(target.x));
      await xField.press('Tab');
      await yField.fill(String(target.y));
      await page.waitForFunction(() => !document.querySelector('#roadApplyB4').disabled);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project)),bendBaseline);
      await page.locator('#roadApplyB4').click();
      const committed=await page.evaluate(() => __buildingQA.state().project.city.nodes.find(node=>node.id.startsWith('N-BEND-')));
      assert.equal(committed?.x,target.x);
      assert.equal(committed?.y,target.y);
      assert.equal(await page.evaluate(() => __buildingQA.moveRoadHistory('undo')),true);
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project)),bendBaseline);
      if (['desktop','phone'].includes(viewport.name)) {
        const custom=structuredClone(project);
        custom.city.buildings.find(building=>building.id==='BLD-00061').customName='Market Hall';
        await page.evaluate(doc=>__buildingQA.apply(doc),{project:custom,workspace:defaultWorkspace(custom)});
        await openRoadEditor();
        const original=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
        await page.locator('#roadSelectionKind').selectOption('road');
        await page.locator('#roadSelectionId').selectOption('RD-0113');
        await page.locator('#roadIntentDyC1').fill('18');
        const needsChoice=page.locator('#roadConflictC6-BLD-00061');
        await page.locator('#roadPreviewMinimize').click();
        await page.getByRole('button',{name:'Resolve conflict'}).click();
        assert.match(await page.locator('#roadApplyStatusB4').innerText(),/Market Hall/);
        assert.equal(await page.locator('#roadRecoveryD3').isVisible(),true);
        assert.match(await page.locator('#roadRecoveryHeadingD3').innerText(),/Building needs a decision/);
        assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Suggest a new location');
        await needsChoice.getByRole('button',{name:'Keep it here'}).click();
        await page.waitForFunction(()=>__buildingQA.state().roadWorkspace.session.reconciliation?.unresolved[0]?.code==='building-placement-blocked');
        assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
        await needsChoice.getByRole('button',{name:'Suggest a new location'}).click();
        await page.waitForFunction(()=>!document.querySelector('#roadApplyB4').disabled);
        assert.equal(await needsChoice.isVisible(),true);
        assert.match(await needsChoice.innerText(),/Your choice: Suggest a new location/);
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),original);
        await page.locator('#roadApplyB4').click();
        const placed=await page.evaluate(()=>__buildingQA.state().project.city.buildings.find(building=>building.id==='BLD-00061'));
        assert.equal(placed.customName,'Market Hall');
        assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('undo')),true);
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),original);
      }
      if (viewport.name === 'desktop') {
        // C7 release acceptance: real user controls, all four developed layouts.
        for (const [morphology,id,axis,delta] of [
          ['planned','N-0105','x',12],['radial','N-0101','y',15],
          ['organic','N-0139','y',15],['linear','N-0118','y',8],
        ]) {
          const cityProject=createProject({seed:'c2-'+morphology,size:'small',morphology});
          await page.evaluate(doc=>__buildingQA.apply(doc),
            {project:cityProject,workspace:defaultWorkspace(cityProject)});
          await openRoadEditor();
          await page.locator('#roadSelectionKind').selectOption('junction');
          await page.locator('#roadSelectionId').selectOption(id);
          const before=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
          const original=cityProject.city.nodes.find(node=>node.id===id);
          await page.locator(axis==='x'?'#roadProposedX':'#roadProposedY')
            .fill(String(original[axis]+delta));
          await page.waitForFunction(()=>!document.querySelector('#roadApplyB4').disabled);
          if (['radial','organic'].includes(morphology)) {
            assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.reconciliation.ledger
              .some(row=>row.disposition==='created-junction')),true,morphology+' crossing');
          }
          assert.equal(await page.locator('#roadReportStatus').innerText(),'Preview ready');
          await page.locator('#roadApplyB4').click();
          await page.waitForFunction(() => !__buildingQA.state().roadWorkspace.active);
          assert.equal(await page.evaluate(({id,axis})=>__buildingQA.state().project.city.nodes
            .find(node=>node.id===id)[axis],{id,axis}),original[axis]+delta);
          const accepted=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
          assert.notEqual(accepted,before);
          assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('undo')),true);
          assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),before);
          assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('redo')),true);
          assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),accepted);
          const saved=await page.evaluate(()=>__buildingQA.capture());
          const reopened=decodeProjectDocument(encodeProjectDocument(createProjectDocument(
            saved.project,saved.workspace)));
          await page.evaluate(doc=>__buildingQA.apply(doc),reopened);
          assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),accepted);
        }
        const radial=createProject({seed:'c2-radial',size:'small',morphology:'radial'});
        radial.city.buildings.find(b=>b.id==='BLD-00048').customName='Market Hall';
        await page.evaluate(doc=>__buildingQA.apply(doc),
          {project:radial,workspace:defaultWorkspace(radial)});
        await openRoadEditor();
        await page.locator('#roadSelectionKind').selectOption('junction');
        await page.locator('#roadSelectionId').selectOption('N-0101');
        const beforeCustom=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
        const original=radial.city.nodes.find(n=>n.id==='N-0101');
        await page.locator('#roadProposedY').fill(String(original.y+15));
        await page.waitForFunction(()=>!document.querySelector('#roadResolveConflictC6').hidden);
        assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
        await page.locator('#roadPreviewMinimize').click();
        await page.getByRole('button',{name:'Resolve conflict'}).click();
        assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Suggest a new location');
        const choice=page.locator('#roadConflictC6-BLD-00048');
        await choice.getByRole('button',{name:'Suggest a new location'}).click();
        await page.waitForFunction(()=>!document.querySelector('#roadApplyB4').disabled);
        await page.locator('#roadApplyB4').click();
        await page.waitForFunction(() => !__buildingQA.state().roadWorkspace.active);
        assert.equal(await page.evaluate(()=>__buildingQA.state().project.city.buildings
          .find(b=>b.id==='BLD-00048').customName),'Market Hall');
        assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('undo')),true);
        assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),beforeCustom);
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
