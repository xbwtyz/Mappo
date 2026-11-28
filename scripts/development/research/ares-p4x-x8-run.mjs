import {readFileSync,readdirSync} from 'node:fs';
import {G_MANIFEST,enumerateGSlots} from './ares-p4-g-corpus.mjs';
import {G_LOCKED_INVENTORY} from './ares-rtre-locked-recipes.mjs';
import {runR5Slot} from './ares-p4-g-run.mjs';
import {X34_IDS} from './ares-p4x-analytical.mjs';
import {X56_IDS} from './ares-p4x-hybrid.mjs';
import {X7_IDS,x7Recipe} from './ares-p4x-x7-scope.mjs';
import {RADIAL_IDS,radialRecipe} from './ares-p4x-radial-scope.mjs';
import {X_MANIFEST} from './ares-p4x-constraints.mjs';
import {runP4XAnalytical} from './ares-p4x-x34-run.mjs';
import {runP4XHybrid} from './ares-p4x-x56-run.mjs';
import {runP4XX7} from './ares-p4x-x7-run.mjs';
import {runP4XResidual} from './ares-p4x-residual-run.mjs';

const slots=new Map(enumerateGSlots().map(s=>[s.id,s]));
const historical=new Map();
const dir=new URL('../../../tests/fixtures/ares-p4-evidence/',import.meta.url);
for(const name of readdirSync(dir).filter(n=>/^p4r-r5-46077453323-\d+\.json$/.test(n)).sort()){
  const data=JSON.parse(readFileSync(new URL(name,dir),'utf8'));
  if(data.run!==46077453323||data.attempt!==1)throw Error('Unexpected R5 evidence identity.');
  for(const wrapper of data.rows){
    const row=wrapper.result;
    if(!row||wrapper.id!==row.id||historical.has(row.id)||!slots.has(row.id))throw Error('Invalid or duplicate R5 evidence row.');
    historical.set(row.id,row);
  }
}
const expectedRefusals=new Set(X_MANIFEST.cases.map(r=>r.id));
export function x8Route(id){
  const slot=slots.get(id);
  if(!slot)throw Error('Unknown frozen X8 slot.');
  const city=G_LOCKED_INVENTORY.rows.find(c=>c.id===slot.city),group=city.groups.find(g=>g.id===slot.group);
  const prior=historical.get(id);
  if(group.status!=='selected'){
    if(prior&&prior.category!==group.status)throw Error('X8 unavailable reference mismatch.');
    return {slot,source:city.source,selectedRoadIds:group.selectedRoadIds,arm:'unavailable',cap:0,minimum:null,expected:group.status};
  }
  if(!prior||prior.source!==city.source||JSON.stringify(prior.selectedRoadIds)!==JSON.stringify(group.selectedRoadIds)||JSON.stringify(prior.offset)!==JSON.stringify(slot.offset))throw Error('X8 missing or changed R5 reference.');
  let arm='R5',cap=4,minimum=null,expected=prior.category;
  if(expectedRefusals.has(id)){
    if(prior.category!=='search-refused')throw Error('X8 refusal reference changed.');
    if(RADIAL_IDS.includes(id)){arm='residual';({cap,minimum}=radialRecipe('g:'+id));expected='search-refused';}
    else if(X7_IDS.includes(id)){arm='X7';cap=minimum=x7Recipe('g:'+id).minimum;expected='geometry-recovered';}
    else if(X56_IDS.includes(id)){arm='X56';expected='geometry-recovered';}
    else if(X34_IDS.includes(id)){arm='X34';expected='geometry-recovered';}
    else throw Error('X8 missing qualified strategy.');
  }else if(['search-refused','work-limit','unverified','error'].includes(prior.category))throw Error('X8 unexpected R5 unresolved category.');
  return {slot,source:city.source,selectedRoadIds:group.selectedRoadIds,arm,cap,minimum,expected};
}
const runners={unavailable:runR5Slot,R5:runR5Slot,X34:runP4XAnalytical,X56:runP4XHybrid,X7:runP4XX7,residual:runP4XResidual};
export async function runX8Slot(id){
  const route=x8Route(id);
  // Exactly one fresh recipe-bound runner, with one search root and
  // its existing independent audit root. Never fall through or reset.
  const result=await runners[route.arm](id);
  return {id,arm:route.arm,cap:route.cap,minimum:route.minimum,expected:route.expected,
    source:route.source,selectedRoadIds:route.selectedRoadIds,offset:route.slot.offset,result};
}
export function x8Inventory(){return enumerateGSlots().map(s=>x8Route(s.id));}
export function x8R5Reference(id){return historical.get(id);}
