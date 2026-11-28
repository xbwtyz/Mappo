import {readFileSync} from 'node:fs';
import {materializeSquareTournamentArm,SQUARE_TOURNAMENT_IDS} from './square-trial-tournament-inventory.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {createHash} from 'node:crypto';
import {riFreeze} from '../../../src/core/road-impact-model.js';
const files=['a','b'].map(s=>JSON.parse(readFileSync(new URL('../../../tests/fixtures/square-trial-tournament-inventory-'+s+'.json',import.meta.url),'utf8')));
if(files.some(f=>f.version!==1||f.source!=='ccd4a2a7e56182de84f0b12ccfb88856808805da'||f.run!==46117157086||f.aggregate!==140893788456)||files[0].rows.length!==52||files[1].rows.length!==48)throw Error('Tournament archive provenance mismatch.');
const rows=files.flatMap(f=>f.rows),byId=new Map(rows.map(r=>[r.id,r]));
if(rows.length!==100||byId.size!==100||SQUARE_TOURNAMENT_IDS.some(id=>!byId.has(id)))throw Error('Tournament archive incomplete.');
const arms=new Map();
for(const r of rows){
 if(r.authority!=='none'||r.recovery!=='not-run'||r.recipe.id!==r.id||Boolean(r.adaptive)!==r.id.startsWith('radial-'))throw Error('Invalid tournament input row.');
 for(const arm of ['control','experimental',...(r.adaptive?['adaptive']:[])]){
  const x=r[arm],id='sq:tournament:'+r.id+':'+arm;
  if(x.status!=='selected'||x.selection.ids.length!==r.recipe.count||new Set(x.selection.ids).size!==r.recipe.count||!/^[a-f0-9]{64}$/.test(x.source))throw Error('Tournament source not admitted.');
  arms.set(id,riFreeze({id,city:r.id,arm,source:x.source,selectedRoadIds:x.selection.ids,offset:r.recipe.offset,matched:r.matched,adaptiveMatchedControl:r.adaptiveMatchedControl??null,adaptiveMatchedExperimental:r.adaptiveMatchedExperimental??null,...(x.hub?{hub:x.hub}:{})}));
 }
}
if(arms.size!==225)throw Error('Tournament arm count mismatch.');
export const SQUARE_TOURNAMENT_CASES=Object.freeze([...arms.keys()].sort());
export function squareTournamentFrozenRow(id){
 if(typeof id!=='string'||!arms.has(id))throw Error('Unknown frozen tournament arm.');
 return arms.get(id);
}
export function materializeFrozenSquareTournament(id){
 const row=squareTournamentFrozenRow(id),project=materializeSquareTournamentArm(row.city,row.arm);
 if(createHash('sha256').update(aresReplayJson(project)).digest('hex')!==row.source)throw Error('Tournament source fingerprint mismatch.');
 return project;
}
