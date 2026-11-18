import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWorkspacePresentation, WORKSPACE_SECTION_IDS,
  WORKSPACE_DISCLOSURE_IDS, LANDSCAPE_CONTROL_IDS
} from '../src/core/workspace-presentation.js';

const valid = () => ({
  section:'landscape', toolsCollapsed:true, inspectorCollapsed:false,
  inspectorPinned:true, selection:{kind:'water',id:'lake-01'},
  sectionScroll:{city:120,landscape:56,defenses:4},
  inspectorScroll:18,
  disclosures:{startingShapeSettings:true,waterPanel:true,workspaceCityReport:false},
  landscape:{filter:'water',formCache:[
    {key:'water:lake-01',controls:{lakeSeedInput:'draft-seed',lakeRadiusInput:'42'}},
    {key:'landscape-add:lake',controls:{lakeSeedInput:'unfinished creation'}}
  ]},
  districts:{formCache:[{id:'district-1',name:'Unapplied name',color:'#12abef'}]}
});
test('optional schema-1 UI validates small, explicit and bounded presentation state',()=>{
  assert.equal(validateWorkspacePresentation(undefined),undefined);
  assert.deepEqual(validateWorkspacePresentation(valid()),valid());
  assert.equal(WORKSPACE_SECTION_IDS.length,4);
  assert.ok(WORKSPACE_DISCLOSURE_IDS.includes('districtGenerationSettings'));
  assert.ok(LANDSCAPE_CONTROL_IDS.includes('lakeRadiusInput'));
});
test('unsafe or malformed saved UI fails atomically before the current city is touched',()=>{
  for (const change of [
    u => {u.section='invalid'},
    u => {u.toolsCollapsed='no'},
    u => {u.selection={kind:'unknown',id:'no'}},
    u => {u.selection={kind:'landscape-add',id:'invalid'}},
    u => {u.sectionScroll.city=Infinity},
    u => {u.sectionScroll.city=-1},
    u => {u.inspectorScroll=NaN},
    u => {u.disclosures.waterPanel='yes'},
    u => {u.landscape.filter='bad'},
    u => {u.landscape.formCache[0].controls.badDomId='<script>'},
    u => {u.landscape.formCache.push({...u.landscape.formCache[0]})},
    u => {u.districts.formCache[0].color='invalid'},
    u => {u.districts.formCache[0].name='x'.repeat(65)}
  ]) {
    const ui=valid();
    change(ui);
    assert.throws(()=>validateWorkspacePresentation(ui), /Invalid|Too many/,JSON.stringify(ui));
  }
});
test('compatible unknown keys remain permitted for future workspace extensions',()=>{
  const ui=valid();
  ui.futureFeature={useful:true};
  ui.landscape.futureFeature='preserve';
  assert.deepEqual(validateWorkspacePresentation(ui),ui);
});
