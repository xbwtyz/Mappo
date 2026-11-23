import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { observeBuildingApp } from '../tests/helpers/building-app.js';
import { findDirectFootprintFixture } from '../tests/helpers/building-footprint-fixture.js';
import { cornerBuildingFixture } from '../tests/helpers/corner-building-fixture.js';
import { defaultWorkspace, encodeProjectDocument } from '../src/data/project-format.js';

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

const html = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'), `
globalThis.__c01QA = {
  ensureSite: () => {
    let property = project.city.properties.find(p=>p.buildingIds.length>=2);
    if(property)return property.id;
    for(const seed of ['c01-compounds','c01-castle','c01-estate']){
      const candidate=createProject({seed,size:'medium',morphology:'organic'});
      property=candidate.city.properties.find(p=>p.buildingIds.length>=2);
      if(property) {
        project=candidate;
        workspaceShell.refresh();
        requestDraw();
        return property.id;
      }
    }
    throw Error('No property with two buildings for C01 browser test.');
  }
};

globalThis.__d01QA = {
  reset: () => { acceptedHistoryD01.clear(project,'QA fixture baseline'); updateUndoFeedback(); },
  summaries: () => acceptedHistoryD01.summaries(),
  length: () => acceptedHistoryD01.length,
  move: direction => d01MoveHistory(direction),
  can: direction => acceptedHistoryD01.can(direction,project),
  blocked: () => d01DraftBlocked(),
  notice: () => acceptedHistoryD01.notice
};
`);
const origin = 'http://mappo-f2.test/';
const readCity = page => page.evaluate(() => __buildingQA.state().project.city);
const editorPanel = '#buildingTransformPanel';

async function openBuildingEditor(page, building, tool) {
  await page.evaluate(propertyId => {
    __buildingQA.state().propertyWorkspace.select({ kind: 'property', id: propertyId });
  }, building.propertyId);
  await page.locator('[data-inspector-kind="building"][data-inspector-id="' + building.id + '"]').click();
  await page.getByRole('button', { name: /^(Edit building footprint|Edit footprint)$/ }).click();
  await page.locator('#buildingTool' + tool).click();
  assert.equal(await page.locator(editorPanel).isVisible(), true);
}

async function showOnMap(page, point) {
  return page.evaluate(point => {
    const { camera } = __buildingQA.state();
    camera.zoom = 11;
    camera.x = point.x;
    camera.y = point.y + 85 / camera.zoom;
    __buildingQA.draw();
    const rect = document.getElementById('mapCanvas').getBoundingClientRect();
    const screen = camera.worldToScreen(point);
    return { x: rect.left + screen.x, y: rect.top + screen.y };
  }, point);
}

async function exerciseF2(browserName, browserType) {
  const browser = await browserType.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  page.setDefaultTimeout(15000);
  try {
    await page.route('**/*', request => request.request().url() === origin
      ? request.fulfill({ contentType: 'text/html', body: html })
      : request.abort());
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => __buildingQA.state().files.ready);
    const project = await page.evaluate(() => __buildingQA.state().project);
    const { building, wing, courtyard, vertex, moved } = findDirectFootprintFixture(project);
    const appliedBuilding = async () => (await readCity(page)).buildings.find(item => item.id === building.id);

    await openBuildingEditor(page, building, 'Vertices');
    const point = await showOnMap(page, vertex);
    const opposite = building.footprint[0];
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + (opposite.x - vertex.x) * 11,
      point.y + (opposite.y - vertex.y) * 11, { steps: 5 });
    assert.equal(await page.locator('#buildingPreviewApply').isDisabled(), true);
    assert.match(await page.locator('#buildingPreviewStatus').innerText(), /INVALID/);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.equal(await page.locator('#buildingDirectHandle').evaluate(node => document.activeElement === node), true);
    assert.equal(await page.evaluate(() => __buildingQA.state().buildingEditSession.isPending), false);
    const dragTarget = { x: point.x + (moved.x - vertex.x) * 11, y: point.y + (moved.y - vertex.y) * 11 };
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(dragTarget.x, dragTarget.y, { steps: 3 });
    await page.mouse.up();
    assert.equal(await page.locator('#buildingPreviewApply').isEnabled(), true);
    assert.ok(JSON.stringify(await readCity(page)) === JSON.stringify(project.city), 'Accepted city should match the expected snapshot');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#buildingPreviewReset').click();
    // Select by keyboard, and enter the vertex coordinate to preview a change.
    const handle = page.locator('#buildingDirectHandle');
    await handle.focus();
    await handle.press('Home');
    await handle.press('ArrowDown');
    await handle.press('ArrowDown');
    assert.equal(await handle.inputValue(), '2');
    const x = page.locator('#buildingVertexX');
    await x.fill(String(moved.x));
    await x.press('Tab');
    assert.ok(await page.evaluate(() => __buildingQA.state().buildingEditSession.isPending));
    assert.ok(JSON.stringify(await readCity(page)) === JSON.stringify(project.city), 'Accepted city should match the expected snapshot');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#buildingPreviewReset').click();

    await page.locator('#buildingToolEdges').click();
    const edge = { x: (building.footprint[1].x + vertex.x) / 2, y: (building.footprint[1].y + vertex.y) / 2 };
    const edgeScreen = await showOnMap(page, edge);
    await page.mouse.click(edgeScreen.x, edgeScreen.y);
    assert.equal(await handle.inputValue(), '1');
    await page.locator('#buildingWingDepth').fill(String(wing.depth));
    await page.locator('#buildingAddWing').click();
    assert.equal(await page.locator('#buildingInsertVertex').isDisabled(), false);
    assert.equal(await page.locator('#buildingPreviewApply').isEnabled(), true);
    assert.ok(JSON.stringify(await readCity(page)) === JSON.stringify(project.city), 'Accepted city should match the expected snapshot');
    await page.locator('#buildingPreviewApply').click();
    assert.equal((await appliedBuilding()).footprint.length, 8);
    const withWing = await readCity(page);
    await page.locator('#buildingHistoryUndo').click();
    assert.ok(JSON.stringify(await readCity(page)) === JSON.stringify(project.city), 'Accepted city should match the expected snapshot');
    await page.locator('#buildingHistoryRedo').click();
    assert.ok(JSON.stringify(await readCity(page)) === JSON.stringify(withWing), 'Accepted city should match the expected snapshot');

    await page.locator('#buildingToolCourtyard').click();
    for (const [suffix, value] of Object.entries({
      X: courtyard.center.x, Y: courtyard.center.y, Width: courtyard.width, Depth: courtyard.depth
    })) await page.locator('#buildingCourtyard' + suffix).fill(String(value));
    const draftHole = () => page.evaluate(() => {
      const { buildingEditSession, project } = __buildingQA.state();
      return buildingEditSession.previewFor(project.city).holes[0];
    });
    const initialHole = await draftHole();
    const depth = page.locator('#buildingCourtyardDepth');
    await depth.fill('0.12');
    assert.notDeepEqual(await draftHole(), initialHole);
    assert.equal((await appliedBuilding()).holes.length, 0);
    await depth.fill('10000');
    assert.equal(await page.locator('#buildingPreviewApply').isDisabled(), true);
    await depth.fill(String(courtyard.depth));
    assert.equal(await page.locator('#buildingPreviewApply').isEnabled(), true);
    await page.locator('#desktopPlaceReview').click();
    const footprintDetails = page.locator('#buildingFootprintDetails');
    assert.equal(await footprintDetails.isVisible(), true);
    assert.match(await footprintDetails.innerText(), /Occupied.*Plots/);
    await page.locator('#buildingPreviewApply').click();
    const withCourtyard = await readCity(page);
    assert.equal((await appliedBuilding()).holes.length, 1);
    assert.equal(await page.locator('#buildingDirectRing').inputValue(), '0');

    await page.locator('#buildingPreviewCancel').click();
    await openInspectorFold(page, 'workspaceInspectorMore');
    await page.getByRole('button', { name: /^(Replace building \(preview\)|Preview replacement)$/ }).click();
    assert.equal(await page.locator('#structurePreset').inputValue(), '');
    assert.equal(await page.locator('#structureApply').isDisabled(), true);
    await page.locator('#structurePreset').selectOption('rectangle');
    const reviewChoice = page.locator('#desktopPlaceReviewChoice');
    await reviewChoice.click();
    const replaceGeometry = page.locator('#structureReplaceGeometry');
    assert.equal(await replaceGeometry.isVisible(), true);
    assert.equal(await page.locator('#structureApply').isDisabled(), true);
    await replaceGeometry.check();
    await page.locator('#desktopPlaceEdit').click();
    await page.locator('#structurePreset').selectOption('L');
    await reviewChoice.click();
    assert.equal(await replaceGeometry.isChecked(), false);
    assert.ok(JSON.stringify(await readCity(page)) === JSON.stringify(withCourtyard), 'Accepted city should match the expected snapshot');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#structureCancel').click();

    // F4 keeps classification, geometry history, and portable save in one workflow.
    await openIdentity(page);
    const beforeUse = await appliedBuilding();
    const type = beforeUse.type === 'inn' ? 'shop' : 'inn';
    await page.locator('#identityBuildingType').selectOption(type);
    await page.locator('#identityApplyButton').click();
    assert.deepEqual(await appliedBuilding(), { ...beforeUse, type });
    const classified = await readCity(page);
    await page.getByRole('button', { name: /^(Edit building footprint|Edit footprint)$/ }).click();
    // D01 is chronological: the later accepted building-use change must be
    // reversed before the earlier courtyard edit, even when editing a building.
    assert.equal(await page.locator('#buildingHistoryUndo').isDisabled(),true);
    await page.locator('#workspaceUndoButton').click();
    assert.equal((await appliedBuilding()).type,beforeUse.type);
    assert.equal((await appliedBuilding()).holes.length,1);
    await page.locator('#workspaceUndoButton').click();
    assert.equal((await appliedBuilding()).holes.length,0);
    await page.locator('#workspaceRedoButtonD01').click();
    assert.equal((await appliedBuilding()).holes.length,1);
    await page.locator('#workspaceRedoButtonD01').click();
    assert.equal(JSON.stringify(await readCity(page)), JSON.stringify(classified));
    await page.locator('#buildingPreviewCancel').click();

    const saved = await page.evaluate(() => __buildingQA.state().files.captureDocument());
    await page.locator('#projectFileInput').setInputFiles({
      name: 'f2.mappo.json', mimeType: 'application/json', buffer: Buffer.from(encodeProjectDocument(saved))
    });
    await page.locator('#loadPreview').waitFor({ state: 'visible' });
    await page.locator('#openProjectButton').click();
    await page.waitForFunction(() => document.querySelector('#fileStatus').textContent.startsWith('Opened '));
    assert.equal(JSON.stringify(await readCity(page)), JSON.stringify(classified));
    assert.equal(await page.evaluate(() => __buildingQA.state().buildingEditSession.isActive), false);
    const corner=cornerBuildingFixture();
    await page.evaluate(({project,workspace})=>__buildingQA.apply({project,workspace}),
      {project:corner.project,workspace:defaultWorkspace(corner.project)});
    await openBuildingEditor(page,corner.building,'Transform');
    await page.locator('#buildingOffsetY').fill(String(corner.dy));
    await page.locator('#buildingPreviewApply').isEnabled().then(enabled=>assert.equal(enabled,true));
    assert.match(await page.locator('#buildingPreviewStatus').innerText(), new RegExp(corner.sideRoadId));
    const frontage=()=>page.evaluate(id=>__buildingQA.state().project.city.buildings.find(b=>b.id===id).frontageRoadId,corner.building.id);
    assert.equal(await frontage(),corner.building.frontageRoadId);
    await page.locator('#buildingPreviewApply').click();
    assert.equal(await frontage(),corner.sideRoadId);
    await page.locator('#workspaceUndoButton').click();
    assert.equal(await frontage(),corner.building.frontageRoadId);
    await page.locator('#workspaceRedoButtonD01').click();
    assert.equal(await frontage(),corner.sideRoadId);
    console.log('PASS corner access preview, Apply and history '+browserName);
    assert.deepEqual(errors, []);
    console.log('PASS F2/F4 ' + browserName + ' ' + 'desktop');
  } finally {
    await browser.close();
  }
}


async function exerciseC02(name, engine) {
  const browser = await engine.launch();
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(15000);
  try {
    await page.route('**/*',request=>request.request().url()===origin
      ?request.fulfill({contentType:'text/html',body:html}):request.abort());
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    const project=await page.evaluate(()=>__buildingQA.state().project);
    const {building,wing,courtyard}=findDirectFootprintFixture(project);
    const before=JSON.stringify(project.city);
    await openBuildingEditor(page,building,'Edges');
    await page.locator('#buildingDirectHandle').selectOption('1');
    await page.locator('#buildingWingStart').fill(String(wing.start*100));
    await page.locator('#buildingWingEnd').fill(String(wing.end*100));
    await page.locator('#buildingWingDepth').fill(String(wing.depth));
    await page.locator('#buildingAddWing').click();
    assert.equal(await page.evaluate(()=>__buildingQA.state().buildingEditSession.structuralOperationCount),1);
    assert.match(await page.locator('#buildingDirectHint').innerText(),/1\/16 structural edits/);
    assert.equal(await page.locator('#buildingInsertVertex').isDisabled(),false);
    await page.locator('#buildingToolCourtyard').click();
    for(const [suffix,value] of Object.entries({
      X:courtyard.center.x,Y:courtyard.center.y,
      Width:courtyard.width,Depth:courtyard.depth
    })) await page.locator('#buildingCourtyard'+suffix).fill(String(value));
    assert.equal(await page.evaluate(()=>__buildingQA.state().buildingEditSession.structuralOperationCount),2);
    await page.locator('#buildingToolEdges').click();
    await page.locator('#buildingDirectRing').selectOption('exterior');
    await page.locator('#buildingDirectHandle').selectOption('0');
    await page.locator('#buildingInsertVertex').click();
    assert.equal(await page.evaluate(()=>__buildingQA.state().buildingEditSession.structuralOperationCount),3);
    assert.match(await page.locator('#buildingDirectHint').innerText(),/3\/16 structural edits/);
    assert.equal(await page.locator('#buildingPreviewApply').isEnabled(),true);
    assert.equal(JSON.stringify(await readCity(page)),before);
    await page.locator('#buildingPreviewApply').click();
    assert.equal(await page.evaluate(id=>__buildingQA.state().buildingHistory.count('undo',id),building.id),1);
    const after=JSON.stringify(await readCity(page));
    assert.notEqual(after,before);
    assert.equal(await page.evaluate(()=>__buildingQA.state().buildingEditSession.structuralOperationCount),0);
    await page.locator('#buildingHistoryUndo').click();
    assert.equal(JSON.stringify(await readCity(page)),before);
    await page.locator('#buildingHistoryRedo').click();
    assert.equal(JSON.stringify(await readCity(page)),after);
    assert.deepEqual(errors,[]);
    console.log('PASS C02 '+name+' multi-operation building draft');
  } finally {await browser.close();}
}

for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]]) {
  await exerciseF2(name, engine);
  await exerciseC02(name, engine);
}

async function exerciseC01(name,engine) {
  const browser=await engine.launch();
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(15000);
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  try {
    await page.route('**/*',request=>request.request().url()===origin
      ?request.fulfill({contentType:'text/html',body:html}):request.abort());
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    const propertyId=await page.evaluate(()=>__c01QA.ensureSite());
    await page.evaluate(id=>__buildingQA.state().propertyWorkspace.select({kind:'property',id}),propertyId);
    const original=JSON.stringify(await readCity(page));
    await page.getByRole('button',{name:/building compounds/i}).first().click();
    assert.equal(await page.locator('#buildingCompoundPanel').isVisible(),true);
    await page.locator('#compoundNameInput').fill('Abbey complex');
    const members=page.locator('#compoundMemberList input[type="checkbox"]');
    assert.ok(await members.count()>=2);
    await members.nth(0).check();
    await members.nth(1).check();
    await page.locator('#compoundSaveGroup').click();
    assert.equal(await page.locator('#compoundGroupSelect').inputValue()==='',false);
    const groups=await page.evaluate(id=>__buildingQA.state().project.city.properties
      .find(p=>p.id===id).buildingCompounds,propertyId);
    assert.equal(groups.length,1);
    assert.equal(groups[0].memberBuildingIds.length,2);
    assert.equal((await readCity(page)).buildings.find(b=>b.id===groups[0].memberBuildingIds[0]).id,
      groups[0].memberBuildingIds[0]);
    await page.locator('#structureUndo').click();
    assert.equal(await page.evaluate(id=>
      __buildingQA.state().project.city.properties.find(p=>p.id===id).buildingCompounds??null,propertyId),null);
    assert.equal(JSON.stringify(await readCity(page)),original);
    await page.locator('#structureRedo').click();
    assert.equal((await page.evaluate(id=>__buildingQA.state().project.city.properties
      .find(p=>p.id===id).buildingCompounds,propertyId)).length,1);
    await page.locator('#compoundDx').fill('0.01');
    assert.match(await page.locator('#compoundStatus').innerText(),/VALID|CANNOT APPLY/);
    assert.equal(await page.locator('#compoundReset').isEnabled(),true);
    await page.locator('#compoundReset').click();
    assert.equal(await page.locator('#compoundDx').inputValue(),'0');
    await page.locator('#compoundCancel').click();
    assert.equal(await page.locator('#buildingCompoundPanel').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('PASS C01 '+name+' compound membership and preview controls');
  } finally{await browser.close();}
}
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]) {
  await exerciseC01(name,engine);
}

async function exerciseD01(name,engine) {
  const browser=await engine.launch();
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.route('**/*',request=>request.request().url()===origin
      ?request.fulfill({contentType:'text/html',body:html}):request.abort());
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    const propertyId=await page.evaluate(()=>{
      const id=__c01QA.ensureSite();
      __d01QA.reset();
      __buildingQA.state().propertyWorkspace.select({kind:'property',id});
      return id;
    });
    const original=JSON.stringify(await readCity(page));
    await openIdentity(page);
    await page.locator('#identityNameInput').fill('Briar Estate');
    await page.locator('#identityApplyButton').click();
    assert.equal(await page.evaluate(id=>__buildingQA.state().project.city.properties
      .find(p=>p.id===id).customName,propertyId),'Briar Estate');
    assert.deepEqual(await page.evaluate(()=>__d01QA.summaries().map(x=>x.family)),['identity']);
    await page.getByRole('button',{name:/building compounds/i}).first().click();
    await page.locator('#compoundNameInput').fill('Briar Court');
    const members=page.locator('#compoundMemberList input[type="checkbox"]');
    assert.ok(await members.count()>=2);
    await members.nth(0).check();
    await members.nth(1).check();
    await page.locator('#compoundSaveGroup').click();
    const accepted=JSON.stringify(await readCity(page));
    assert.equal(await page.evaluate(()=>__d01QA.length()),2);
    assert.deepEqual(await page.evaluate(()=>__d01QA.summaries().map(x=>x.family)),['identity','compound']);
    assert.equal(await page.locator('#workspaceHistoryListD01 li').count(),2);
    // A local Undo button must not navigate an unrelated family's transaction.
    assert.equal(await page.locator('#identityUndoButton').isDisabled(),true);
    assert.equal(await page.locator('#propertySplitUndoE2').isDisabled(),true);
    assert.equal(await page.locator('#propertyMergeUndoE3').isDisabled(),true);
    assert.match(await page.locator('#workspaceUndoButton').innerText(),/compound/i);
    await page.locator('#workspaceUndoButton').click();
    assert.equal(await page.evaluate(()=>__d01QA.length()),2);
    assert.equal(await page.evaluate(id=>__buildingQA.state().project.city.properties
      .find(p=>p.id===id).buildingCompounds??null,propertyId),null);
    assert.equal(await page.evaluate(()=>__d01QA.blocked()),false,
      'Accepted compound Undo must not resurrect a stale group membership draft');
    await page.locator('#workspaceUndoButton').click();
    assert.equal(JSON.stringify(await readCity(page)),original);
    await page.locator('#workspaceRedoButtonD01').click();
    assert.equal(await page.evaluate(id=>__buildingQA.state().project.city.properties
      .find(p=>p.id===id).customName,propertyId),'Briar Estate');
    await page.locator('#workspaceRedoButtonD01').click();
    assert.equal(JSON.stringify(await readCity(page)),accepted);
    // Unsaved compound names and member selections are drafts too: global
    // history must block instead of silently losing these local edits.
    await page.locator('#compoundNameInput').fill('Pending rename');
    assert.equal(await page.evaluate(()=>__d01QA.blocked()),true);
    assert.equal(await page.locator('#workspaceUndoButton').isDisabled(),true);
    assert.equal(await page.evaluate(()=>__d01QA.move('undo')),false);
    await page.locator('#compoundNameInput').fill('Briar Court');
    assert.equal(await page.evaluate(()=>__d01QA.blocked()),false);
    const firstMember=page.locator('#compoundMemberList input[type="checkbox"]').first();
    await firstMember.uncheck();
    assert.equal(await page.evaluate(()=>__d01QA.blocked()),true);
    await firstMember.check();
    assert.equal(await page.evaluate(()=>__d01QA.blocked()),false);
    assert.equal(await page.locator('#workspaceUndoButton').isDisabled(),false);
    await page.locator('#compoundDx').fill('3');
    const blocked=await page.evaluate(()=>__d01QA.move('undo'));
    assert.equal(blocked,false,'A pending compound preview must block accepted global Undo');
    assert.equal(JSON.stringify(await readCity(page)),accepted);
    await page.locator('#compoundReset').click();
    assert.equal(await page.evaluate(()=>__d01QA.blocked()),false);
    assert.ok(await page.evaluate(()=>__d01QA.can('undo')));
    assert.deepEqual(errors,[]);
    console.log('PASS D01 '+name+' unified identity/compound Undo, Redo, draft gate');
  }finally{await browser.close();}
}
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
  await exerciseD01(name,engine);
}
