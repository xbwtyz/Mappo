import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createProject} from '../../../src/core/city-model.js';
import {generateLayout} from '../../../src/generators/layout.js';
import {generateSquarelessLayout} from './squareless-layout.mjs';
import {validateLayout} from '../../../src/core/validate-layout.js';
import {validateSquarelessLayout} from './squareless-layout-validation.mjs';
import {generateBuildings} from '../../../src/generators/buildings.js';
import {validateDevelopment} from '../../../src/core/validate-development.js';
import {generateDistricts} from '../../../src/generators/districts.js';
import {stampRoadGenerated} from '../../../src/core/road-provenance.js';
import {migrateBuildingRecordS10,hydrateProjectS10} from '../../../src/core/building-project-s10.js';
import {createIdentityAllocationState} from '../../../src/core/identity-allocation.js';
import {validateStoredProject} from '../../../src/data/project-validation.js';
import {buildRoadGraph} from '../../../src/core/road-graph.js';
import {normalizeSpatialRoadGroup} from '../../../src/core/spatial-recovery-road-adapter.js';
import {createAresDiagnosticContext} from '../../../src/core/ares-diagnostic-contract.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {observeAresRtreGeometry} from '../../../src/core/ares-rtre-geometry.js';
import {observeAresRtreNeighborhood} from '../../../src/core/ares-rtre-neighborhood.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {APP_VERSION} from '../../../src/core/version.js';
import {riFreeze} from '../../../src/core/road-impact-model.js';
import {materializeSquarePilotLayouts} from './square-trial-pilot.mjs';
const lock=riFreeze(JSON.parse(readFileSync(new URL('../../../tests/fixtures/square-trial-admission-v1.json',import.meta.url),'utf8')));
if(lock.version!==1||lock.generation.run!==46114917704||lock.movement.run!==46115161509||lock.rows.length!==8)throw Error('Square pilot lock identity mismatch.');
const hash=x=>createHash('sha256').update(x).digest('hex'),raw=x=>hash(JSON.stringify(x));
export const SQUARE_ADMISSION_CASES=Object.freeze(lock.rows.map(r=>r.id));
// Recipe-only fixture admission; no arbitrary saved project or supplied
// coordinates, scope or provenance. The squareless arm is a transient
// canonical-record representation for internal road observers only. Its
// schema-shaped data deliberately remains INVALID for the persisted contract.
export function materializeSquareAdmission(id){
 const row=lock.rows.find(r=>r.id===id);if(!row)throw Error('Frozen square admission ID required.');
 const {recipe,survey}=materializeSquarePilotLayouts(row.pilot),{seed,size,morphology}=recipe;
 if(raw(survey)!==row.survey)throw Error('Square survey lock mismatch.');
 const l=row.arm==='control'?generateLayout(seed,size,survey,morphology):generateSquarelessLayout(seed,size,survey,morphology);
 if(row.arm==='control')validateLayout(l,survey.boundary);else validateSquarelessLayout(l,survey.boundary);
 const dev=generateBuildings(seed,l);validateDevelopment(l,dev);
 if(raw([l,dev])!==row.rawSource)throw Error('Square raw source lock mismatch.');
 const base=createProject({seed,size,morphology});
 validateStoredProject(base);
 let project=base;
 if(row.arm==='experimental'){
  if(Object.hasOwn(l,'plaza')||l.roads.some(r=>r.plaza))throw Error('Experimental plaza present.');
  const city={...base.city,...l,...dev,districts:[],districtState:{version:1,status:'unassigned'}};
  delete city.plaza;
  const assigned=generateDistricts(city,{seed,count:'auto'}),plots=new Map(assigned.plots.map(p=>[p.id,p]));
  for(const p of assigned.properties)stampRoadGenerated(p,p.plotIds.map(id=>plots.get(id)));
  assigned.buildings=assigned.buildings.map(b=>{stampRoadGenerated(b);return migrateBuildingRecordS10(b);});
  project=hydrateProjectS10({...base,city:assigned,identityAllocation:createIdentityAllocationState()});
  // Fail closed if the experimental model unexpectedly becomes acceptable
  // to the production save validator. No fake plaza and no migration policy.
  let rejected=false;try{validateStoredProject(project);}catch(e){if(!/square/i.test(e.message))throw e;rejected=true;}
  if(!rejected)throw Error('Experimental squareless source accepted by stored validator.');
 }
 if(raw(project.city.nodes)!==raw(l.nodes)||raw(project.city.roads)!==raw(l.roads))throw Error('Square canonical road source mismatch.');
 if(!buildRoadGraph(project.city).valid)throw Error('Square canonical graph invalid.');
 const context=createAresDiagnosticContext({version:1,sessionId:'square:'+id,sourceVersion:APP_VERSION,
  operation:normalizeSpatialRoadGroup(project,1,row.selected,row.offset,{})});
 return {row,project,context,source:hash(aresReplayJson(project))};
}
export async function inspectSquareAdmission(id){
 const f=materializeSquareAdmission(id),b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768}),before=aresReplayJson(f.project,b);
 const geometry=await observeAresRtreGeometry(f.project,f.context,{mode:'adaptive'},b);
 const neighborhood=await observeAresRtreNeighborhood(f.project,f.context,{mode:'adaptive'},{maxObjects:10000,maxHops:6},b);
 if(geometry.snapshotFingerprint!==f.source||neighborhood.snapshotFingerprint!==f.source||aresReplayJson(f.project,b)!==before)throw Error('Square observer source mismatch.');
 return riFreeze({id,source:f.source,rawSource:f.row.rawSource,authority:'none',storedProject:f.row.arm==='control',matched:f.row.matched,
  geometryStatus:geometry.status,diagnostics:geometry.diagnostics.map(d=>d.code),requested:geometry.requested,
  neighborhoodStatus:neighborhood.status,entries:neighborhood.entries.length,omitted:neighborhood.omittedRefs.length,writable:neighborhood.writableRefs.length,stats:b.snapshot()});
}
