// Detached experimental retirement of whole generated property groups.
// Never changes the original city, production policy, or production Apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject} from '../src/core/city-model.js';
import {prepareRoadGroupIntentB1,readRoadGroupTopologyB1} from '../src/core/road-intent-c1.js';
import {prepareRoadGroupReflowB1} from '../src/core/neighborhood-reflow.js';
import {createLareContext} from '../src/core/reconciliation-context.js';
import {createLareBudget} from '../src/core/reconciliation-budget.js';
import {verifyLareGroupPreservation} from '../src/core/reconciliation-preservation.js';
import {validateStoredProject} from '../src/data/project-validation.js';
import {defaultWorkspace,createProjectDocument,encodeProjectDocument,decodeProjectDocument} from '../src/data/project-format.js';
import {reconcileRoadWorkspace} from '../src/editor/road-workspace.js';
import {AcceptedEditHistoryD01} from '../src/core/accepted-edit-history-d01.js';
import {classifyRoadProvenance,stampRoadGenerated} from '../src/core/road-provenance.js';
import {polygonSignedArea} from '../src/core/geometry.js';
import {riBudget,riReporter} from '../src/core/road-impact-model.js';
import {inspectRoadDependencies,inspectRoadContextReferences} from '../src/core/road-impact-dependencies.js';

const roadIds=['RD-0184','RD-0186'],baseOffset={x:-3.005274072121821,y:-37.39896113564458};
const hash=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const sorted=xs=>[...xs].sort();
const unique=xs=>[...new Set(xs)];
const inventory=(project,draft)=>{
  const context=createLareContext(project,draft,new Map(),createLareBudget());
  const city=project.city,props=new Map(city.properties.map(p=>[p.id,p])),plots=new Map(city.plots.map(p=>[p.id,p]));
  const buildings=new Map(city.buildings.map(b=>[b.id,b]));
  const eligible=new Map();
  for(const e of context.properties){
    const p=props.get(e.id),ownPlots=p.plotIds.map(id=>plots.get(id));
    if(e.policy.mode!=='adaptive'||e.policy.provenance!=='generated'||p.buildingCompounds?.length||
      classifyRoadProvenance(p,ownPlots)!=='generated'||e.buildings.some(b=>b.mode!=='rigid'||b.provenance!=='generated'))continue;
    if(p.buildingIds.some(id=>classifyRoadProvenance(buildings.get(id))!=='generated'))continue;
    eligible.set(p.id,{id:p.id,block:p.blockId,plots:p.plotIds.slice(),buildings:p.buildingIds.slice(),area:p.area,
      footprint:p.buildingIds.reduce((n,id)=>n+buildings.get(id).area,0)});
  }
  return eligible;
};
const removedSets=(eligible,ids)=>{
  assert.equal(unique(ids).length,ids.length,'Duplicate retirement');
  const rows=ids.map(id=>{assert.ok(eligible.has(id),'Protected or out-of-scope parcel: '+id);return eligible.get(id);});
  return {properties:sorted(ids),plots:sorted(rows.flatMap(r=>r.plots)),buildings:sorted(rows.flatMap(r=>r.buildings))};
};
// All surviving records and project metadata are checked for external
// references, including embedded generator snapshots. Fail closed on any
// exact retired ID token inside strings; never dissolve other dependencies.
function externalReference(value,retired){
  if(typeof value==='string'){
    for(const id of retired)if(value.includes(id))return id;
  }else if(value&&typeof value==='object'){
    for(const [k,v] of Object.entries(value)){
      if(retired.has(k))return k;
      const found=externalReference(v,retired);if(found)return found;
    }
  }
  return null;
}
function reduce(project,sets){
  const next=structuredClone(project),all=new Set(Object.values(sets).flat());
  for(const key of ['properties','plots','buildings']){
    const remove=new Set(sets[key]);
    next.city[key]=next.city[key].filter(row=>!remove.has(row.id));
    assert.equal(project.city[key].length-next.city[key].length,remove.size);
  }
  // A retained generated parcel may lose an explicitly reviewed child.
  // Change only the reciprocal membership and derived provenance snapshot.
  const removedBuildings=new Set(sets.buildings);
  const plots=new Map(next.city.plots.map(p=>[p.id,p]));
  for(const p of next.city.properties){
    const remaining=p.buildingIds.filter(id=>!removedBuildings.has(id));
    if(remaining.length!==p.buildingIds.length){
      assert.equal(classifyRoadProvenance(p,p.plotIds.map(id=>plots.get(id))),'generated');
      p.buildingIds=remaining;
      stampRoadGenerated(p,p.plotIds.map(id=>plots.get(id)));
    }
  }
  const ref=externalReference(next,all);
  if(ref)throw Error('Surviving reference to retired record: '+ref);
  const affected=new Set(project.city.properties.filter(p=>sets.properties.includes(p.id)).map(p=>p.blockId));
  const areas=new Map();
  for(const p of next.city.properties)areas.set(p.blockId,(areas.get(p.blockId)??0)+p.area);
  for(const o of next.city.openSpaces)if(affected.has(o.blockId)){
    o.area=Math.max(0,next.city.blocks.find(b=>b.id===o.blockId).area-(areas.get(o.blockId)??0));
  }
  validateStoredProject(next);
  return next;
}
function verifyOriginal(project,candidate,draft,reviewed){
  // Recompute the entire removal set from the original and final inventories;
  // no trust in the candidate solver's retirement ledger.
  const missing={};
  for(const key of ['properties','plots','buildings']){
    const now=new Set(candidate.city[key].map(r=>r.id));
    missing[key]=sorted(project.city[key].filter(r=>!now.has(r.id)).map(r=>r.id));
    assert.deepEqual(missing[key],reviewed[key],'Unreviewed retirement');
    assert.equal(candidate.city[key].length,project.city[key].length-missing[key].length);
  }
  const eligible=inventory(project,draft);
  const whole=removedSets(eligible,missing.properties);
  assert.deepEqual(whole.plots,missing.plots,'Plot retirement requires complete parcel retirement');
  const allowed=new Set([...eligible.values()].flatMap(p=>p.buildings));
  const removed=new Set(missing.buildings);
  assert.ok(whole.buildings.every(id=>removed.has(id)),'Retired parcel has surviving child');
  assert.ok(missing.buildings.every(id=>allowed.has(id)),'Unauthorized individual building removal');
  const reduced=reduce(project,missing);
  const reducedDraft=prepareRoadGroupIntentB1(reduced,roadIds,draft.offset);
  assert.deepEqual(reducedDraft.proposedNodes,draft.proposedNodes,'Different final road target');
  const violation=verifyLareGroupPreservation(reduced,candidate,reducedDraft,new Map(),createLareBudget());
  assert.equal(violation,null,JSON.stringify(violation));
  validateStoredProject(candidate);
  const context={roadIds:draft.changedRoadIds,junctionIds:draft.proposedNodes.map(n=>n.id),
    changedBlockIds:createLareContext(project,draft,new Map(),createLareBudget()).blockIds,acceptedValid:true};
  const {emit,items}=riReporter(),spend=riBudget();
  inspectRoadDependencies(candidate.city,candidate.city,context,emit,spend,project.city);
  inspectRoadContextReferences(project.city,candidate.city,context,emit,spend);
  const issues=items().filter(r=>r.severity!=='info'&&r.code!=='frontage-geometry'&&!(r.kind==='plot'&&r.code==='property-containment'));
  assert.deepEqual(issues,[],'Original infrastructure/land dependency failure');
}
function verifyHistory(project,candidate,sets){
  const ws=reconcileRoadWorkspace(defaultWorkspace(project),project.city,candidate.city);
  const reopened=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,ws)));
  assert.equal(hash(reopened.project),hash(candidate));assert.equal(hash(reopened.workspace),hash(ws));
  const history=new AcceptedEditHistoryD01();
  history.clear(project);
  assert.equal(history.record(project,candidate,{family:'road',operation:'research-retire-generated-parcels',
    label:'Research road and parcel retirement',targetIds:[...roadIds,...sets.properties,...sets.buildings]}).status,'recorded');
  const undo=history.prepare('undo',candidate,ws);assert.ok(undo.ok,undo.reason);
  assert.equal(hash(undo.candidate),hash(project));history.accept('undo',undo.entry,undo.candidate);
  const redo=history.prepare('redo',undo.candidate,undo.workspace);assert.ok(redo.ok,redo.reason);
  assert.equal(hash(redo.candidate),hash(candidate));history.accept('redo',redo.entry,redo.candidate);
}

// Exact Round 19 witnesses from hosted job 138867109855, not the private save.
const seeds=[
  {
    "irregularProperties": false,
    "scale": 1,
    "sets": {
      "properties": [
        "PROP-00119",
        "PROP-00120",
        "PROP-00121",
        "PROP-00122",
        "PROP-00123",
        "PROP-00124",
        "PROP-00125",
        "PROP-00126",
        "PROP-00127",
        "PROP-00128",
        "PROP-00129",
        "PROP-00130",
        "PROP-00131",
        "PROP-00132",
        "PROP-00133",
        "PROP-00134",
        "PROP-00135",
        "PROP-00136",
        "PROP-00137",
        "PROP-00172",
        "PROP-00173",
        "PROP-00174",
        "PROP-00175",
        "PROP-00176",
        "PROP-00177"
      ],
      "plots": [
        "PLOT-00175",
        "PLOT-00176",
        "PLOT-00177",
        "PLOT-00178",
        "PLOT-00179",
        "PLOT-00180",
        "PLOT-00181",
        "PLOT-00182",
        "PLOT-00183",
        "PLOT-00184",
        "PLOT-00185",
        "PLOT-00186",
        "PLOT-00187",
        "PLOT-00188",
        "PLOT-00189",
        "PLOT-00190",
        "PLOT-00191",
        "PLOT-00192",
        "PLOT-00193",
        "PLOT-00194",
        "PLOT-00195",
        "PLOT-00196",
        "PLOT-00197",
        "PLOT-00198",
        "PLOT-00199",
        "PLOT-00249",
        "PLOT-00250",
        "PLOT-00251",
        "PLOT-00252",
        "PLOT-00253",
        "PLOT-00254",
        "PLOT-00255",
        "PLOT-00256"
      ],
      "buildings": [
        "BLD-00134",
        "BLD-00135",
        "BLD-00136",
        "BLD-00137",
        "BLD-00138",
        "BLD-00139",
        "BLD-00140",
        "BLD-00141",
        "BLD-00142",
        "BLD-00143",
        "BLD-00144",
        "BLD-00145",
        "BLD-00146",
        "BLD-00147",
        "BLD-00148",
        "BLD-00149",
        "BLD-00150",
        "BLD-00151",
        "BLD-00152",
        "BLD-00153",
        "BLD-00154",
        "BLD-00155",
        "BLD-00156",
        "BLD-00157",
        "BLD-00158",
        "BLD-00195",
        "BLD-00196",
        "BLD-00197",
        "BLD-00198",
        "BLD-00199",
        "BLD-00200"
      ]
    },
    "fingerprint": "708ba30a1f9396382fc0896d4c8b7fed519d5c834a8aee4402b918b45f64ac29"
  },
  {
    "irregularProperties": false,
    "scale": 0.75,
    "sets": {
      "properties": [
        "PROP-00119",
        "PROP-00120",
        "PROP-00121",
        "PROP-00122",
        "PROP-00123",
        "PROP-00124",
        "PROP-00125",
        "PROP-00126",
        "PROP-00127",
        "PROP-00128",
        "PROP-00129",
        "PROP-00132",
        "PROP-00133",
        "PROP-00134",
        "PROP-00135",
        "PROP-00137"
      ],
      "plots": [
        "PLOT-00175",
        "PLOT-00176",
        "PLOT-00177",
        "PLOT-00178",
        "PLOT-00179",
        "PLOT-00180",
        "PLOT-00181",
        "PLOT-00182",
        "PLOT-00183",
        "PLOT-00184",
        "PLOT-00185",
        "PLOT-00186",
        "PLOT-00187",
        "PLOT-00190",
        "PLOT-00191",
        "PLOT-00192",
        "PLOT-00193",
        "PLOT-00194",
        "PLOT-00195",
        "PLOT-00196",
        "PLOT-00199"
      ],
      "buildings": [
        "BLD-00134",
        "BLD-00135",
        "BLD-00136",
        "BLD-00137",
        "BLD-00138",
        "BLD-00139",
        "BLD-00140",
        "BLD-00141",
        "BLD-00142",
        "BLD-00143",
        "BLD-00144",
        "BLD-00145",
        "BLD-00146",
        "BLD-00149",
        "BLD-00150",
        "BLD-00151",
        "BLD-00152",
        "BLD-00153",
        "BLD-00154",
        "BLD-00155",
        "BLD-00156",
        "BLD-00158"
      ]
    },
    "fingerprint": "1ebae8eba84f6d4d4c71ed1c16723168989eba934383c0274888efb20958d399"
  },
  {
    "irregularProperties": false,
    "scale": -0.5,
    "sets": {
      "properties": [
        "PROP-00162",
        "PROP-00164",
        "PROP-00165",
        "PROP-00166",
        "PROP-00167",
        "PROP-00169",
        "PROP-00170",
        "PROP-00171",
        "PROP-00173",
        "PROP-00175",
        "PROP-00176",
        "PROP-00177"
      ],
      "plots": [
        "PLOT-00235",
        "PLOT-00237",
        "PLOT-00238",
        "PLOT-00239",
        "PLOT-00240",
        "PLOT-00241",
        "PLOT-00242",
        "PLOT-00246",
        "PLOT-00247",
        "PLOT-00248",
        "PLOT-00252",
        "PLOT-00254",
        "PLOT-00255",
        "PLOT-00256"
      ],
      "buildings": [
        "BLD-00185",
        "BLD-00187",
        "BLD-00188",
        "BLD-00189",
        "BLD-00190",
        "BLD-00192",
        "BLD-00193",
        "BLD-00194",
        "BLD-00196",
        "BLD-00198",
        "BLD-00199",
        "BLD-00200"
      ]
    },
    "fingerprint": "d9b069542d80a2f0d7a4ff3ec6de0b5fdaa0710d5b8940f2fa821053322b9be3"
  },
  {
    "irregularProperties": false,
    "scale": -1,
    "sets": {
      "properties": [
        "PROP-00162",
        "PROP-00163",
        "PROP-00164",
        "PROP-00165",
        "PROP-00166",
        "PROP-00167",
        "PROP-00168",
        "PROP-00169",
        "PROP-00170",
        "PROP-00171",
        "PROP-00172",
        "PROP-00173",
        "PROP-00175",
        "PROP-00176",
        "PROP-00177"
      ],
      "plots": [
        "PLOT-00235",
        "PLOT-00236",
        "PLOT-00237",
        "PLOT-00238",
        "PLOT-00239",
        "PLOT-00240",
        "PLOT-00241",
        "PLOT-00242",
        "PLOT-00243",
        "PLOT-00244",
        "PLOT-00245",
        "PLOT-00246",
        "PLOT-00247",
        "PLOT-00248",
        "PLOT-00249",
        "PLOT-00250",
        "PLOT-00251",
        "PLOT-00252",
        "PLOT-00254",
        "PLOT-00255",
        "PLOT-00256"
      ],
      "buildings": [
        "BLD-00185",
        "BLD-00186",
        "BLD-00187",
        "BLD-00188",
        "BLD-00189",
        "BLD-00190",
        "BLD-00191",
        "BLD-00192",
        "BLD-00193",
        "BLD-00194",
        "BLD-00195",
        "BLD-00196",
        "BLD-00198",
        "BLD-00199",
        "BLD-00200"
      ]
    },
    "fingerprint": "7e09dcef74e55561204fc93a09df9949bac7be15c47ee00907523af12dbd4270"
  },
  {
    "irregularProperties": true,
    "scale": 1,
    "sets": {
      "properties": [
        "PROP-00119",
        "PROP-00120",
        "PROP-00121",
        "PROP-00122",
        "PROP-00123",
        "PROP-00124",
        "PROP-00125",
        "PROP-00126",
        "PROP-00127",
        "PROP-00128",
        "PROP-00129",
        "PROP-00130",
        "PROP-00131",
        "PROP-00132",
        "PROP-00133",
        "PROP-00134",
        "PROP-00135",
        "PROP-00136",
        "PROP-00137",
        "PROP-00172",
        "PROP-00173",
        "PROP-00174",
        "PROP-00175",
        "PROP-00176",
        "PROP-00177"
      ],
      "plots": [
        "PLOT-00197",
        "PLOT-00198",
        "PLOT-00199",
        "PLOT-00200",
        "PLOT-00201",
        "PLOT-00202",
        "PLOT-00203",
        "PLOT-00204",
        "PLOT-00205",
        "PLOT-00206",
        "PLOT-00207",
        "PLOT-00208",
        "PLOT-00209",
        "PLOT-00210",
        "PLOT-00211",
        "PLOT-00212",
        "PLOT-00213",
        "PLOT-00214",
        "PLOT-00215",
        "PLOT-00216",
        "PLOT-00217",
        "PLOT-00218",
        "PLOT-00219",
        "PLOT-00220",
        "PLOT-00221",
        "PLOT-00222",
        "PLOT-00223",
        "PLOT-00281",
        "PLOT-00282",
        "PLOT-00283",
        "PLOT-00284",
        "PLOT-00285",
        "PLOT-00286",
        "PLOT-00287",
        "PLOT-00288",
        "PLOT-00289",
        "PLOT-00290",
        "PLOT-00291",
        "PLOT-00292"
      ],
      "buildings": [
        "BLD-00134",
        "BLD-00135",
        "BLD-00136",
        "BLD-00137",
        "BLD-00138",
        "BLD-00139",
        "BLD-00140",
        "BLD-00141",
        "BLD-00142",
        "BLD-00143",
        "BLD-00144",
        "BLD-00145",
        "BLD-00146",
        "BLD-00147",
        "BLD-00148",
        "BLD-00149",
        "BLD-00150",
        "BLD-00151",
        "BLD-00152",
        "BLD-00153",
        "BLD-00154",
        "BLD-00155",
        "BLD-00156",
        "BLD-00157",
        "BLD-00158",
        "BLD-00195",
        "BLD-00196",
        "BLD-00197",
        "BLD-00198",
        "BLD-00199",
        "BLD-00200"
      ]
    },
    "fingerprint": "400d6750bc2f35eebfa6201b563ab181a4fe523a000dd1e817b36aa66829285e"
  },
  {
    "irregularProperties": true,
    "scale": 0.75,
    "sets": {
      "properties": [
        "PROP-00119",
        "PROP-00120",
        "PROP-00121",
        "PROP-00122",
        "PROP-00123",
        "PROP-00124",
        "PROP-00125",
        "PROP-00126",
        "PROP-00127",
        "PROP-00128",
        "PROP-00129",
        "PROP-00132",
        "PROP-00133",
        "PROP-00134",
        "PROP-00135",
        "PROP-00137"
      ],
      "plots": [
        "PLOT-00197",
        "PLOT-00198",
        "PLOT-00199",
        "PLOT-00200",
        "PLOT-00201",
        "PLOT-00202",
        "PLOT-00203",
        "PLOT-00204",
        "PLOT-00205",
        "PLOT-00206",
        "PLOT-00207",
        "PLOT-00208",
        "PLOT-00209",
        "PLOT-00210",
        "PLOT-00211",
        "PLOT-00214",
        "PLOT-00215",
        "PLOT-00216",
        "PLOT-00217",
        "PLOT-00218",
        "PLOT-00219",
        "PLOT-00220",
        "PLOT-00223"
      ],
      "buildings": [
        "BLD-00134",
        "BLD-00135",
        "BLD-00136",
        "BLD-00137",
        "BLD-00138",
        "BLD-00139",
        "BLD-00140",
        "BLD-00141",
        "BLD-00142",
        "BLD-00143",
        "BLD-00144",
        "BLD-00145",
        "BLD-00146",
        "BLD-00149",
        "BLD-00150",
        "BLD-00151",
        "BLD-00152",
        "BLD-00153",
        "BLD-00154",
        "BLD-00155",
        "BLD-00156",
        "BLD-00158"
      ]
    },
    "fingerprint": "29ef7f8c39e07d868c5999582056c92a15ad6618db08e493c8afbaf5eea9897a"
  },
  {
    "irregularProperties": true,
    "scale": -0.5,
    "sets": {
      "properties": [
        "PROP-00162",
        "PROP-00164",
        "PROP-00165",
        "PROP-00166",
        "PROP-00167",
        "PROP-00169",
        "PROP-00170",
        "PROP-00171",
        "PROP-00173",
        "PROP-00175",
        "PROP-00176",
        "PROP-00177"
      ],
      "plots": [
        "PLOT-00265",
        "PLOT-00267",
        "PLOT-00268",
        "PLOT-00269",
        "PLOT-00270",
        "PLOT-00271",
        "PLOT-00272",
        "PLOT-00276",
        "PLOT-00277",
        "PLOT-00278",
        "PLOT-00279",
        "PLOT-00280",
        "PLOT-00284",
        "PLOT-00285",
        "PLOT-00286",
        "PLOT-00288",
        "PLOT-00289",
        "PLOT-00290",
        "PLOT-00291",
        "PLOT-00292"
      ],
      "buildings": [
        "BLD-00185",
        "BLD-00187",
        "BLD-00188",
        "BLD-00189",
        "BLD-00190",
        "BLD-00192",
        "BLD-00193",
        "BLD-00194",
        "BLD-00196",
        "BLD-00198",
        "BLD-00199",
        "BLD-00200"
      ]
    },
    "fingerprint": "a071ca8ec9a438b81b00678050e657cf7bc69ee2cf188bc61da087574f0e87b8"
  },
  {
    "irregularProperties": true,
    "scale": -1,
    "sets": {
      "properties": [
        "PROP-00162",
        "PROP-00163",
        "PROP-00164",
        "PROP-00165",
        "PROP-00166",
        "PROP-00167",
        "PROP-00168",
        "PROP-00169",
        "PROP-00170",
        "PROP-00171",
        "PROP-00172",
        "PROP-00173",
        "PROP-00175",
        "PROP-00176",
        "PROP-00177"
      ],
      "plots": [
        "PLOT-00265",
        "PLOT-00266",
        "PLOT-00267",
        "PLOT-00268",
        "PLOT-00269",
        "PLOT-00270",
        "PLOT-00271",
        "PLOT-00272",
        "PLOT-00273",
        "PLOT-00274",
        "PLOT-00275",
        "PLOT-00276",
        "PLOT-00277",
        "PLOT-00278",
        "PLOT-00279",
        "PLOT-00280",
        "PLOT-00281",
        "PLOT-00282",
        "PLOT-00283",
        "PLOT-00284",
        "PLOT-00285",
        "PLOT-00286",
        "PLOT-00288",
        "PLOT-00289",
        "PLOT-00290",
        "PLOT-00291",
        "PLOT-00292"
      ],
      "buildings": [
        "BLD-00185",
        "BLD-00186",
        "BLD-00187",
        "BLD-00188",
        "BLD-00189",
        "BLD-00190",
        "BLD-00191",
        "BLD-00192",
        "BLD-00193",
        "BLD-00194",
        "BLD-00195",
        "BLD-00196",
        "BLD-00198",
        "BLD-00199",
        "BLD-00200"
      ]
    },
    "fingerprint": "fe8d29239b1220df46c7cc51c86f89d8e62c6b126677fbd3872915db6646d1d9"
  }
];

const restoreGroup=(sets,group,withBuildings)=>({
  properties:sets.properties.filter(id=>id!==group.id),
  plots:sets.plots.filter(id=>!group.plots.includes(id)),
  buildings:withBuildings?sets.buildings.filter(id=>!group.buildings.includes(id)):sets.buildings.slice()
});
const count=sets=>({properties:sets.properties.length,plots:sets.plots.length,buildings:sets.buildings.length});
for(const irregularProperties of [false,true])
test('detached monotone restoration: '+(irregularProperties?'irregular':'regular'),{timeout:600000},()=>{
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  validateStoredProject(project);
  const before=hash(project),summary={irregularProperties,attempted:0,retained:0,
    improved:0,restoredProperties:0,restoredPlots:0,restoredBuildings:0};
  const byBuilding=new Map(project.city.buildings.map(b=>[b.id,b]));
  for(const seed of seeds.filter(s=>s.irregularProperties===irregularProperties)){
    const {scale}=seed,offset={x:baseOffset.x*scale,y:baseOffset.y*scale};
    const draft=prepareRoadGroupIntentB1(project,roadIds,offset);
    const eligible=inventory(project,draft);
    const parent=new Map([...eligible.values()].flatMap(p=>p.buildings.map(id=>[id,p.id])));
    const attempts=[],seen=new Set();
    const trial=(sets,label)=>{
      sets=Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,sorted(v)]));
      const key=JSON.stringify(sets);if(seen.has(key))return null;seen.add(key);
      let reduced;
      try{reduced=reduce(project,sets);}
      catch(error){attempts.push({label,...count(sets),outcome:'reduction-refused',message:error.message});return null;}
      const reducedBefore=hash(reduced);
      const result=prepareRoadGroupReflowB1(reduced,roadIds,offset);
      assert.equal(hash(reduced),reducedBefore);assert.equal(hash(project),before);
      if(!result.candidateProject){
        attempts.push({label,...count(sets),outcome:'reflow-refused',issues:result.unresolved.map(i=>i.code)});
        return null;
      }
      verifyOriginal(project,result.candidateProject,draft,sets);
      attempts.push({label,...count(sets),outcome:'accepted'});
      return {sets,candidate:result.candidateProject};
    };
    let best=trial(seed.sets,'round19-exact');
    assert.ok(best,'Prior witness lost');
    assert.equal(hash(best.candidate),seed.fingerprint,'Exact prior fingerprint changed');
    const original=count(best.sets),rank=ids=>ids.slice().sort((a,b)=>eligible.get(b).footprint-eligible.get(a).footprint||a.localeCompare(b));
    // Each accepted step only restores records. It never removes an
    // additional surviving building or sacrifices an existing witness.
    for(const id of rank(best.sets.properties).slice(0,18)){
      const next=trial(restoreGroup(best.sets,eligible.get(id),true),'whole:'+id);
      if(next)best=next;
    }
    const whole=count(best.sets);
    for(const id of rank(best.sets.properties).slice(0,14)){
      const next=trial(restoreGroup(best.sets,eligible.get(id),false),'empty-shell:'+id);
      if(next)best=next;
    }
    const shell=count(best.sets);
    const buildingOrder=best.sets.buildings.filter(id=>!best.sets.properties.includes(parent.get(id)))
      .sort((a,b)=>byBuilding.get(b).area-byBuilding.get(a).area||a.localeCompare(b));
    for(const id of buildingOrder.slice(0,12)){
      const next=trial({...best.sets,buildings:best.sets.buildings.filter(x=>x!==id)},'child:'+id);
      if(next)best=next;
    }
    const final=count(best.sets);
    for(const k of Object.keys(original))assert.ok(final[k]<=original[k],'Restoration increased destruction');
    for(const k of Object.keys(best.sets))assert.ok(best.sets[k].every(id=>seed.sets[k].includes(id)),'New retirement introduced');
    verifyOriginal(project,best.candidate,draft,best.sets);
    const replay=prepareRoadGroupReflowB1(reduce(project,best.sets),roadIds,offset);
    assert.ok(replay.candidateProject);assert.equal(hash(replay.candidateProject),hash(best.candidate));
    verifyHistory(project,best.candidate,best.sets);
    for(const key of ['properties','plots','buildings'])if(best.sets[key].length){
      const wrong={...best.sets,[key]:best.sets[key].slice(1)};
      assert.throws(()=>verifyOriginal(project,best.candidate,draft,wrong),'Unreviewed removal accepted: '+key);
    }
    summary.attempted++;summary.retained++;
    const restored={properties:original.properties-final.properties,plots:original.plots-final.plots,buildings:original.buildings-final.buildings};
    if(Object.values(restored).some(n=>n>0))summary.improved++;
    summary.restoredProperties+=restored.properties;summary.restoredPlots+=restored.plots;summary.restoredBuildings+=restored.buildings;
    assert.equal(hash(project),before);
    console.log('RESTORATION_CASE '+JSON.stringify({irregularProperties,scale,original,whole,shell,final,restored,
      removed:best.sets,footprintLoss:best.sets.buildings.reduce((n,id)=>n+byBuilding.get(id).area,0),
      fingerprint:hash(best.candidate),attempts}));
  }
  console.log('RESTORATION_SUMMARY '+JSON.stringify(summary));
  assert.equal(summary.retained,4);
});
