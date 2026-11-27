import { readFileSync } from 'node:fs';
import { createProject } from '../../../src/core/city-model.js';
import { WaterEditor } from '../../../src/editor/water.js';
import { TerrainEditor } from '../../../src/editor/terrain.js';
import { buildRoadGraph } from '../../../src/core/road-graph.js';
import { resolveRoadGroupB1 } from '../../../src/core/road-group-b1.js';
import { normalizeSpatialRoadGroup } from '../../../src/core/spatial-recovery-road-adapter.js';
import { validateStoredProject } from '../../../src/data/project-validation.js';
import { createAresDiagnosticContext } from '../../../src/core/ares-diagnostic-contract.js';
import { APP_VERSION } from '../../../src/core/version.js';
import { riFreeze } from '../../../src/core/road-impact-model.js';

// Frozen research inputs only; not a runtime fixture generator or solver.
export const ARES_P3_MANIFEST=riFreeze(JSON.parse(readFileSync(
  new URL('../../../tests/fixtures/ares-p3-matched-standard.json',import.meta.url),'utf8')));
function mixed(options){
  const base=createProject(options),water=new WaterEditor();
  water.generateCoastline(base.options.boundary,base.options.center,{seed:'mountains',direction:'east'});
  water.generate(base.options.boundary,base.options.center,{seed:'mountains',width:24});
  water.generateLakeDraft(base.options.boundary,base.options.center,{seed:'mountains',radius:18});
  const wet=createProject({...base.options,seed:base.seed,water:water.definition()});
  const terrain=new TerrainEditor();
  terrain.generate(base.options.boundary,base.options.center,{seed:'mixed-mountains',placement:'inside',size:40,
    water:{features:wet.city.waterFeatures,bridges:wet.city.bridges}});
  return createProject({...wet.options,seed:wet.seed,water:water.definition(),terrain:terrain.definition(),fortifications:{enabled:true}});
}
function select(graph,selection){
  if(Array.isArray(selection.ids))return [...selection.ids];
  if(selection.firstEligiblePair!==true)throw Error('Unknown P3 selection recipe.');
  for(const incident of graph.incidentRoads.values())for(let i=0;i<incident.length;i++)for(let j=i+1;j<incident.length;j++){
    const ids=[incident[i],incident[j]];
    if(resolveRoadGroupB1(graph,ids).eligible)return ids;
  }
  throw Error('No eligible P3 road pair.');
}
export function materializeAresP3Case(id){
  const c=ARES_P3_MANIFEST.cases.find(row=>row.id===id);
  if(!c)throw Error('Unknown frozen P3 case.');
  if(APP_VERSION!==ARES_P3_MANIFEST.appVersion)throw Error('P3 source version changed.');
  const project=c.recipe==='mixed'?mixed(c.options):createProject(c.options);
  validateStoredProject(project);
  const graph=buildRoadGraph(project.city),ids=select(graph,c.selection);
  if(!resolveRoadGroupB1(graph,ids).eligible)throw Error('Frozen P3 selection ineligible: '+id);
  let offset=c.offset;
  if(offset.towardRiverMidpoint){
    const r=graph.roadsById.get(ids[0]),a=graph.nodesById.get(r.a),b=graph.nodesById.get(r.b);
    const river=project.city.waterFeatures.find(f=>f.kind==='river');
    if(!river)throw Error('Missing frozen river.');
    const point=river.path[Math.floor(river.path.length/2)];
    offset={x:point.x-(a.x+b.x)/2,y:point.y-(a.y+b.y)/2};
  }
  const context=createAresDiagnosticContext({version:1,sessionId:'ares-p3-'+id,sourceVersion:APP_VERSION,
    operation:normalizeSpatialRoadGroup(project,1,ids,offset,c.permissions)});
  return {case:c,project,context,limits:ARES_P3_MANIFEST.rootLimits[c.permissions.destruction?'destruction':'preservation']};
}
