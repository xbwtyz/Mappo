import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createProject} from '../../../src/core/city-model.js';
import {generateSurvey} from '../../../src/generators/survey.js';
import {findCityCenter,insideOrOn,clearance} from '../../../src/core/boundary.js';
import {generateLayout} from '../../../src/generators/layout.js';
import {validateLayout} from '../../../src/core/validate-layout.js';
import {generateSquarelessLayout} from './squareless-layout.mjs';
import {validateSquarelessLayout} from './squareless-layout-validation.mjs';
import {generateBuildings} from '../../../src/generators/buildings.js';
import {validateDevelopment} from '../../../src/core/validate-development.js';
import {generateDistricts} from '../../../src/generators/districts.js';
import {prepareWater} from '../../../src/generators/water.js';
import {validateWaterDefinition} from '../../../src/core/water-model.js';
import {validateTerrainCity} from '../../../src/core/terrain-model.js';
import {stampRoadGenerated} from '../../../src/core/road-provenance.js';
import {migrateSchema9ProjectS10,hydrateProjectS10} from '../../../src/core/building-project-s10.js';
import {migrateSchema10ProjectS11} from '../../../src/data/migrate-schema11.js';
import {validateStoredProject} from '../../../src/data/project-validation.js';
import {buildRoadGraph} from '../../../src/core/road-graph.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {APP_VERSION,PROJECT_SCHEMA_VERSION} from '../../../src/core/version.js';
import {riFreeze} from '../../../src/core/road-impact-model.js';
import {selectSquareTrialChain} from './square-trial-movement-pilot.mjs';
const hash=x=>createHash('sha256').update(aresReplayJson(x)).digest('hex');
const manifest=riFreeze(JSON.parse(readFileSync(new URL('../../../tests/fixtures/square-trial-tournament-v1.json',import.meta.url),'utf8')));
if(manifest.version!==1||manifest.appVersion!==APP_VERSION||manifest.schemaVersion!==PROJECT_SCHEMA_VERSION||manifest.rows.length!==100||new Set(manifest.rows.map(r=>r.id)).size!==100||new Set(manifest.rows.map(r=>r.seed)).size!==100||manifest.morphologies.length!==4||manifest.morphologies.some(m=>manifest.rows.filter(r=>r.morphology===m).length!==25))throw Error('Square trial manifest identity mismatch.');
export const SQUARE_TOURNAMENT_IDS=Object.freeze(manifest.rows.map(r=>r.id));
function recipe(id){
 const r=manifest.rows.find(r=>r.id===id);
 if(!r)throw Error('Unknown square tournament recipe.');
 if(!['small','medium','large'].includes(r.size)||![4,5].includes(r.count)||!['central','middle'].includes(r.stratum)||!Number.isInteger(r.angleIndex)||r.angleIndex<0||r.angleIndex>7||![r.offset.x,r.offset.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=100)||(r.offset.x===0&&r.offset.y===0))throw Error('Invalid frozen recipe.');
 return r;
}
function surveyFor(r){
 const s=generateSurvey(r.seed,r.size,r.morphology),center=findCityCenter(s.boundary);
 if(!insideOrOn(center,s.boundary)||clearance(center,s.boundary)<18)throw Error('Invalid town center.');
 s.anchors=[{id:'SITE-00',kind:'center',...center},...s.anchors.slice(1).filter(p=>insideOrOn(p,s.boundary))];return s;
}
// Independent experimental generation; a failed control cannot prevent
// the experimental arm from being measured. Same dry generation stages
// and canonical migrations, but never a valid persisted squareless save.
function detachedDryLandscape(city){
 // Existing water city validator dereferences mandatory plaza.center before
 // its dry early return. Reproduce its dry-only checks with the survey
 // anchor instead. Wet/terrain fixtures are not admitted by this adapter.
 const state=city.waterState;
 if(!state||state.version!==1||state.status!=='dry'||typeof state.seed!=='string'||state.seed.length>64||state.algorithm!=='ribbon-v1')throw Error('Invalid detached dry water state.');
 for(const k of ['waterFeatures','bridges','waterFaces','terrainFeatures','terrainPasses','terrainFaces'])if(!Array.isArray(city[k])||city[k].length)throw Error('Detached trial is dry only.');
 validateWaterDefinition(city.waterFeatures,city.bridges,city.survey.boundary,city.survey.anchors[0]);
 if(city.roads.some(r=>r.waterBoundary||r.bridgeId||r.bank))throw Error('Dry cities cannot contain water topology.');
 validateTerrainCity(city);
}
const hubId='BLK-TRIAL-HUB';
function squareless(r,survey,adaptive=false){
 const center=survey.anchors[0],water=prepareWater();
 let l=adaptive?generateLayout(r.seed,r.size,survey,r.morphology):generateSquarelessLayout(r.seed,r.size,survey,r.morphology);
 if(adaptive)validateLayout(l,survey.boundary);else validateSquarelessLayout(l,survey.boundary);
 const dev=generateBuildings(r.seed,l);validateDevelopment(l,dev);
 if(adaptive){
  if(r.morphology!=='radial'||!l.plaza)throw Error('Adaptive hub only allowed for radial trial.');
  const {plaza,...rest}=l;
  // Retain EXACT original perimeter/vertices and all surrounding land.
  // Represent hub as undeveloped ordinary block, not a protected plaza.
  // No new properties/buildings are generated on the reserved hub.
  l={...rest,roads:rest.roads.map(x=>x.plaza?{...x,plaza:false}:x),blocks:[...rest.blocks,{id:hubId,vertices:[...plaza.vertices],area:plaza.area,ring:0,sector:rest.blocks.length,usage:'unassigned'}]};
  dev.openSpaces.push({id:'OPEN-'+hubId,blockId:hubId,kind:'undeveloped',area:plaza.area});
  validateSquarelessLayout(l,survey.boundary);
  if(dev.properties.some(x=>x.blockId===hubId)||dev.buildings.some(x=>x.blockId===hubId))throw Error('Adaptive hub developed.');
 }
 if(Object.hasOwn(l,'plaza')||l.roads.some(x=>x.plaza))throw Error('Experimental plaza survived.');
 let city={id:'city-'+r.seed.slice(0,24),name:'Trial '+r.id,survey,waterState:water.state,waterFeatures:[],bridges:[],terrainFeatures:[],terrainPasses:[],
  ...l,...dev,districts:[],districtState:{version:1,status:'unassigned'},walls:[],gates:[],towers:[],fortificationState:{version:1,status:'unbuilt',enabled:false}};
 detachedDryLandscape(city);
 city=generateDistricts(city,{seed:r.seed,count:'auto'});
 const plots=new Map(city.plots.map(p=>[p.id,p]));
 for(const p of city.properties)stampRoadGenerated(p,p.plotIds.map(id=>plots.get(id)));
 for(const b of city.buildings)stampRoadGenerated(b);
 const project=hydrateProjectS10(migrateSchema10ProjectS11(migrateSchema9ProjectS10({schemaVersion:9,generatorVersion:APP_VERSION,seed:r.seed,
  options:{size:r.size,morphology:r.morphology,boundary:survey.boundary.map(p=>({...p})),center:{x:center.x,y:center.y}},city})));
 let rejected=false;try{validateStoredProject(project);}catch(e){if(!/square/i.test(e.message))throw e;rejected=true;}
 if(!rejected)throw Error('Squareless project unexpectedly passed stored validation.');
 return project;
}
export function materializeSquareTournamentArm(id,arm){
 const r=recipe(id),survey=surveyFor(r);
 if(arm==='control'){
  const p=createProject({seed:r.seed,size:r.size,morphology:r.morphology});validateStoredProject(p);
  if(hash(p.city.survey)!==hash(survey))throw Error('Control survey mismatch.');
  return p;
 }
 if(arm==='experimental')return squareless(r,survey);
 if(arm==='adaptive'&&r.morphology==='radial')return squareless(r,survey,true);
 throw Error('Unknown square tournament arm.');
}
function inventory(r,arm,target){
 let project;
 try{project=materializeSquareTournamentArm(r.id,arm);}catch(e){if(e instanceof TypeError||e instanceof ReferenceError||e instanceof SyntaxError)throw e;return {status:'generation-refused',reason:e.message};}
 const source=hash(project),g=buildRoadGraph(project.city);
 if(!g.valid)return {status:'graph-refused',source,issues:g.issues.map(x=>x.code)};
 const selection=selectSquareTrialChain(g,target,r.count);
 const protectedRoads=[...g.roadsById.values()].filter(x=>g.roadClasses.get(x.id).protected);
 if(hash(project)!==source)throw Error('Tournament selection mutated source.');
 const hub=arm==='adaptive'?project.city.blocks.find(x=>x.id===hubId):null;
 if(arm==='adaptive'&&!hub)throw Error('Missing adaptive hub.');
 return {status:selection.status,source,selection,...(hub?{hub:{id:hub.id,vertices:hub.vertices,area:hub.area,roadIds:project.city.roads.filter(r=>hub.vertices.some((v,i)=>{const n=hub.vertices[(i+1)%hub.vertices.length];return r.a===v&&r.b===n||r.b===v&&r.a===n;})).map(r=>r.id)}}:{}),nodes:g.nodesById.size,roads:g.roadsById.size,blocks:project.city.blocks.length,
  properties:project.city.properties.length,buildings:project.city.buildings.length,protectedRoads:protectedRoads.length,
  protectedNodes:new Set(protectedRoads.flatMap(x=>[x.a,x.b])).size,maxDegree:Math.max(...[...g.adjacency.values()].map(x=>x.length))};
}
export function inventorySquareTournament(id){
 const r=recipe(id),survey=surveyFor(r),center=survey.anchors[0],scale=survey.nominalRadius,angle=r.angleIndex*Math.PI/4;
 const target={x:center.x+(r.stratum==='middle'?scale*.38*Math.cos(angle):0),y:center.y+(r.stratum==='middle'?scale*.38*Math.sin(angle):0)};
 const c=inventory(r,'control',target),e=inventory(r,'experimental',target),a=c.selection,b=e.selection;
 const separation=a?.centroid&&b?.centroid?Math.hypot(a.centroid.x-b.centroid.x,a.centroid.y-b.centroid.y):null;
 const matched=c.status==='selected'&&e.status==='selected'&&separation<=scale*.25&&a.distance<=scale*.55&&b.distance<=scale*.55&&Math.max(a.length,b.length)<=2*Math.min(a.length,b.length);
 const adaptive=r.morphology==='radial'?inventory(r,'adaptive',target):null;
 const match=(x,y)=>x.status==='selected'&&y.status==='selected'&&Math.hypot(x.selection.centroid.x-y.selection.centroid.x,x.selection.centroid.y-y.selection.centroid.y)<=scale*.25&&x.selection.distance<=scale*.55&&y.selection.distance<=scale*.55&&Math.max(x.selection.length,y.selection.length)<=2*Math.min(x.selection.length,y.selection.length);
 return riFreeze({id,recipe:r,survey:hash(survey),target,matched,separation,control:c,experimental:e,...(adaptive?{adaptive,adaptiveMatchedControl:match(c,adaptive),adaptiveMatchedExperimental:match(e,adaptive)}:{}),authority:'none',recovery:'not-run'});
}
