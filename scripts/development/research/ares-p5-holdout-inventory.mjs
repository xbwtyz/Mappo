import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createProject} from '../../../src/core/city-model.js';
import {buildRoadGraph} from '../../../src/core/road-graph.js';
import {validateStoredProject} from '../../../src/data/project-validation.js';
import {APP_VERSION,PROJECT_SCHEMA_VERSION} from '../../../src/core/version.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {riFreeze} from '../../../src/core/road-impact-model.js';
import {G_MANIFEST,selectGCorpusGroup} from './ares-p4-g-corpus.mjs';

// Stage 1: freeze inputs on GitHub before enabling recovery. No solver,
// permission, editable city, caller seed/offset or candidate output.
export const HOLDOUT_MANIFEST=riFreeze(JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p5-holdout-v1.json',import.meta.url),'utf8')));
const byId=new Map(HOLDOUT_MANIFEST.rows.map(r=>[r.id,r]));
const groups=new Map(G_MANIFEST.groups.map(r=>[r.id,r]));
export function holdoutRecipe(id){
  if(typeof id!=='string'||!byId.has(id))throw Error('Unknown frozen holdout ID.');
  return byId.get(id);
}
export function materializeHoldoutCity(id){
  const row=holdoutRecipe(id);
  if(APP_VERSION!==HOLDOUT_MANIFEST.appVersion||PROJECT_SCHEMA_VERSION!==HOLDOUT_MANIFEST.schemaVersion)throw Error('Holdout version changed.');
  const project=createProject(row.options);validateStoredProject(project);
  if(project.options.size!==row.options.size||project.options.morphology!==row.options.morphology)throw Error('Holdout recipe normalization changed.');
  return project;
}
export function inventoryHoldoutCase(id){
  const row=holdoutRecipe(id),project=materializeHoldoutCity(id),before=aresReplayJson(project);
  const graph=buildRoadGraph(project.city);
  if(!graph.valid)throw Error('Invalid fresh holdout source '+id);
  const sequence=[...new Set([row.preferredGroup,'eight-chain','five-chain','five-branch','quad','eight-loop','pentagon'])];
  const attempts=[];
  let chosen=null;
  for(const group of sequence){
    const result=selectGCorpusGroup(graph,groups.get(group));
    attempts.push(result);
    if(result.status==='selected'){chosen=result;break;}
  }
  if(aresReplayJson(project)!==before)throw Error('Holdout inventory mutated source.');
  return riFreeze({id,source:createHash('sha256').update(Buffer.from(before,'utf8')).digest('hex'),
    options:row.options,offset:row.offset,preferredGroup:row.preferredGroup,group:chosen?.id??null,
    selection:chosen?'selected':attempts.some(x=>x.status==='selection-limit')?'selection-limit':'selection-unavailable',
    selectedRoadIds:chosen?.selectedRoadIds??[],nodeCount:project.city.nodes.length,roadCount:project.city.roads.length,
    propertyCount:project.city.properties?.length??null,attempts});
}
