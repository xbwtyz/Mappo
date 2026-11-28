import {createHash} from 'node:crypto';
import {generateSurvey} from '../../../src/generators/survey.js';
import {findCityCenter,insideOrOn} from '../../../src/core/boundary.js';
import {generateLayout} from '../../../src/generators/layout.js';
import {validateLayout} from '../../../src/core/validate-layout.js';
import {generateBuildings} from '../../../src/generators/buildings.js';
import {validateDevelopment} from '../../../src/core/validate-development.js';
import {buildRoadGraph} from '../../../src/core/road-graph.js';
import {generateSquarelessLayout} from './squareless-layout.mjs';
import {validateSquarelessLayout} from './squareless-layout-validation.mjs';
import {riFreeze} from '../../../src/core/road-impact-model.js';
const morphologies=['radial','organic','linear','planned'];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const SQUARE_PILOT=riFreeze(morphologies.flatMap(morphology=>['small','medium'].map(size=>({id:morphology+'-'+size,morphology,size,seed:'square-trial-pilot-v1-'+morphology+'-'+size}))));
function arm(recipe,survey,variant){
 const {seed,size,morphology}=recipe;
 let stage='layout';
 try{
  const l=variant==='control'?generateLayout(seed,size,survey,morphology):generateSquarelessLayout(seed,size,survey,morphology);
  stage='layout-validation';
  if(variant==='control')validateLayout(l,survey.boundary);else validateSquarelessLayout(l,survey.boundary);
  if(variant==='experimental'&&(Object.hasOwn(l,'plaza')||l.roads.some(r=>r.plaza)))throw Error('Square survived experimental generation.');
  stage='graph';const g=buildRoadGraph(l);
  if(!g.valid)return {status:'refused',stage,issues:g.issues.map(i=>i.code)};
  stage='development';const dev=generateBuildings(seed,l);validateDevelopment(l,dev);
  const degrees=[...g.adjacency.values()].map(x=>x.length),protectedRoads=l.roads.filter(r=>g.roadClasses.get(r.id).protected),protectedNodes=new Set(protectedRoads.flatMap(r=>[r.a,r.b]));
  return {status:'valid',source:hash([l,dev]),nodes:l.nodes.length,roads:l.roads.length,blocks:l.blocks.length,properties:dev.properties.length,buildings:dev.buildings.length,
   plazaRoads:l.roads.filter(r=>r.plaza).length,protectedRoads:protectedRoads.length,protectedNodes:protectedNodes.size,maxDegree:Math.max(...degrees),blockArea:l.blocks.reduce((sum,r)=>sum+r.area,0)};
 }catch(e){return {status:'refused',stage,reason:e.message};}
}
export function runSquarePilot(id){
 const recipe=SQUARE_PILOT.find(r=>r.id===id);if(!recipe)throw Error('Unknown square pilot recipe.');
 const survey=generateSurvey(recipe.seed,recipe.size,recipe.morphology),center=findCityCenter(survey.boundary);
 survey.anchors=[{id:'SITE-00',kind:'center',...center},...survey.anchors.slice(1).filter(p=>insideOrOn(p,survey.boundary))];
 const before=hash(survey),control=arm(recipe,structuredClone(survey),'control'),experimental=arm(recipe,structuredClone(survey),'experimental');
 if(hash(survey)!==before)throw Error('Pilot mutated shared survey.');
 return riFreeze({id,recipe,survey:before,control,experimental,authority:'none',roadRecovery:'not-evaluated',schema:'not-a-project'});
}
