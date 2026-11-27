import { readFileSync } from 'node:fs';
import { G_MANIFEST,enumerateGSlots,materializeGCorpusCity } from './ares-p4-g-corpus.mjs';
import { createAresDiagnosticContext } from '../../../src/core/ares-diagnostic-contract.js';
import { normalizeSpatialRoadGroup } from '../../../src/core/spatial-recovery-road-adapter.js';
import { APP_VERSION } from '../../../src/core/version.js';
import { aresReplayJson } from '../../../src/core/ares-diagnostic-replay.js';
import { riFreeze } from '../../../src/core/road-impact-model.js';
import { materializeAresP3Case } from './ares-p3-fixtures.mjs';

const inventory=riFreeze(JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4-g-frozen-inventory.json',import.meta.url),'utf8')));
const original=riFreeze(JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p3-frozen-identities.json',import.meta.url),'utf8')));
export const G_LOCKED_INVENTORY=inventory;
const slots=new Map(enumerateGSlots().map(s=>['g:'+s.id,s]));
export function lockedRtreCase(id){
  if(typeof id!=='string')throw Error('Frozen RTRE recipe ID required, not a city.');
  const old=original.rows.find(r=>r.id===id);
  if(old)return old;
  const slot=slots.get(id);
  if(!slot)throw Error('Unknown frozen RTRE recipe.');
  const city=inventory.rows.find(r=>r.id===slot.city),group=city?.groups.find(g=>g.id===slot.group);
  if(group?.status!=='selected')throw Error('Frozen G group unavailable.');
  return riFreeze({id,source:city.source,limits:G_MANIFEST.search.root,slot,selectedRoadIds:group.selectedRoadIds});
}
export function materializeLockedRtreCase(id){
  const lock=lockedRtreCase(id);
  if(!lock.slot)return materializeAresP3Case(id);
  const project=materializeGCorpusCity(lock.slot.city);
  const operation=normalizeSpatialRoadGroup(project,1,[...lock.selectedRoadIds],lock.slot.offset,G_MANIFEST.permissions);
  if(aresReplayJson(operation.editedRefs.map(r=>r.id))!==aresReplayJson(lock.selectedRoadIds)||
     operation.editedRefs.some(r=>r.collection!=='roads')||
     aresReplayJson(operation.geometry.offset)!==aresReplayJson(lock.slot.offset)||
     aresReplayJson(operation.permissions)!==aresReplayJson(G_MANIFEST.permissions))
    throw Error('Frozen G operation differs from preregistered intent.');
  const context=createAresDiagnosticContext({version:1,sessionId:id,sourceVersion:APP_VERSION,operation});
  return {project,context,limits:lock.limits};
}
