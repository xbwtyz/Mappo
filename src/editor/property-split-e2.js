import { copyJson,createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';
import { pointInPolygon, polygonSignedArea } from '../core/geometry.js';
import { shapeContained,shapeWellFormed } from '../core/building-validation.js';
import { clearance, segmentCuts } from '../core/boundary.js';
import { deriveOccupiedPlots } from './building-application.js';
import { classifyRoadProvenance } from '../core/road-provenance.js';
import { propertyLocalBounds3I } from '../core/property-geometry.js';
import { propertySplitDraftE2, propertySplitGeometryE2 } from '../core/property-split-geometry-e2.js';
import { PropertyCreationHistoryE1 } from './property-creation-e1.js';

// Structural history is the e2Same complete before/after transaction mechanism
// as E1; do not duplicate a second whole-project history implementation.
export const PropertySplitHistoryE2=PropertyCreationHistoryE1;
const e2Issue=(code,message,targetId=null)=>({code,message,targetId});
const e2Same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const e2PlotFields=new Set(['id','blockId','propertyId','frontageRoadId','boundary']);
function e2NextId(rows,prefix){
  const used=new Set(rows.map(row=>row.id));
  let n=1;
  for(const id of used)if(id.startsWith(prefix)&&/^\d+$/.test(id.slice(prefix.length)))
    n=Math.max(n,Number(id.slice(prefix.length))+1);
  if(!Number.isSafeInteger(n))throw Error('No safe record ID remains.');
  while(used.has(prefix+String(n).padStart(5,'0')))n++;
  return prefix+String(n).padStart(5,'0');
}
function e2StrictInterior(point,polygon){
  return pointInPolygon(point,polygon)&&clearance(point,polygon)>1e-6;
}
function e2RouteIntersectsPolygon(path,polygon){
  if(!Array.isArray(path)||path.length<2)return true;
  for(let i=0;i<path.length-1;i++){
    const a=path[i],b=path[i+1];
    if(![a?.x,a?.y,b?.x,b?.y].every(Number.isFinite))return true;
    const factors=[0,1];
    for(let j=0;j<polygon.length;j++)
      factors.push(...segmentCuts(a,b,polygon[j],polygon[(j+1)%polygon.length]));
    factors.sort((x,y)=>x-y);
    for(let k=0;k<factors.length-1;k++){
      const t=(factors[k]+factors[k+1])/2;
      if(e2StrictInterior({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},polygon))return true;
    }
  }
  return false;
}

export class PropertySplitSessionE2 {
  constructor(changed=()=>{}){this.changed=changed;this.propertyId=null;this.t=.5;this.drag=null;this.approved=new Set();this.validation=null;}
  get active(){return Boolean(this.propertyId);}
  start(city,id){
    const source=city?.properties?.find(p=>p.id===id);
    if(!source||source.boundary?.length!==4)return false;
    this.propertyId=id;this.t=.5;this.drag=null;this.approved.clear();this.validation=null;
    this.changed();return true;
  }
  setT(t){
    if(!this.active||!Number.isFinite(t)||t<=0||t>=1)return false;
    this.t=t;this.approved.clear();this.validation=null;this.changed();return true;
  }
  approve(id,value){
    if(!this.active)return false;
    if(value)this.approved.add(id);else this.approved.delete(id);
    this.validation=null;this.changed();return true;
  }
  reset(){if(!this.active)return false;this.t=.5;this.approved.clear();this.drag=null;this.validation=null;this.changed();return true;}
  stop(){if(!this.active)return false;this.propertyId=null;this.t=.5;this.drag=null;this.approved.clear();this.validation=null;this.changed();return true;}
  geometry(city){try{return this.active?propertySplitDraftE2(city,this.propertyId,this.t):null;}catch{return null;}}
}

// Fast inspect: produces shapes, ownership summary and blockers without writing
// accepted state or running the full O(city) schema validator on pointer frames.
export function inspectPropertySplitE2(project,session){
  const city=project?.city;
  if(!city||!session?.active)return {ok:false,status:'choose',issues:[e2Issue('selection','Choose a property to split.')],preview:null};
  let g;
  try{g=propertySplitGeometryE2(city,session.propertyId,session.t);}
  catch(e){return {ok:false,status:'invalid',issues:[e2Issue('geometry',e.message)],preview:null};}
  const issues=[], transfers=[],buildings=city.buildings.filter(b=>b.propertyId===g.propertyId);
  const source=city.properties.find(p=>p.id===g.propertyId);
  if(!source.frame||!source.local||source.frontageRoadId==null)
    issues.push(e2Issue('frontage','The accepted property has no verifiable frontage frame.',source.id));
  const sides=new Map();
  for(const building of buildings){
    const left=shapeContained(building.footprint,g.left),right=shapeContained(building.footprint,g.right);
    if(left===right){
      issues.push(e2Issue('building','Building '+(building.customName||building.id)+' crosses or touches the split ambiguously. Move the line instead.',building.id));continue;
    }
    const side=left?'left':'right';sides.set(building.id,side);
    const sibling=left?g.right:g.left;
    if(e2RouteIntersectsPolygon(building.accessPath,sibling))
      issues.push(e2Issue('access','Building '+(building.customName||building.id)+' has an access path through the other property.',building.id));
    if(right){
      const protectedRecord=classifyRoadProvenance(building)!=='generated';
      const accepted=session.approved?.has(building.id)??false;
      transfers.push({buildingId:building.id,name:building.customName||building.id,
        protected:protectedRecord,approved:accepted});
      if(protectedRecord&&!accepted)
        issues.push(e2Issue('authorization','Approve ownership transfer of protected building '+(building.customName||building.id)+'.',building.id));
    }
  }
  for(const fragment of g.fragments){
    const plot=city.plots.find(p=>p.id===fragment.originalId);
    if(!plot){issues.push(e2Issue('plot','A required existing plot disappeared.',fragment.originalId));break;}
    if(fragment.crossesCut&&Object.keys(plot).some(key=>!e2PlotFields.has(key))){
      issues.push(e2Issue('plot-metadata','Annotated plot '+plot.id+' cannot be safely split without new metadata rules.',plot.id));break;
    }
    if(!shapeWellFormed(fragment.boundary)||polygonSignedArea(fragment.boundary)<1e-5){
      issues.push(e2Issue('plot','A resulting plot fragment is invalid or too narrow.',fragment.originalId));break;
    }
  }
  return {ok:issues.length===0,status:issues.length?'invalid':'valid',issues,
    preview:{...g,transfers,sides:[...sides],plotFragmentCount:g.fragments.length,buildingsLeft:buildings.filter(b=>sides.get(b.id)==='left').length,
      buildingsRight:buildings.filter(b=>sides.get(b.id)==='right').length}};
}

// Assemble a fresh clone and pass a second, independent project validation and
// format-1 / schema-9 encode/decode gate; the caller owns a separate stale-rev check.
export function preparePropertySplitE2(project,workspace,session){
  const inspection=inspectPropertySplitE2(project,session);
  if(!inspection.ok)return {...inspection,candidate:null};
  try{
    const candidate=copyJson(project),city=candidate.city,g=inspection.preview;
    const source=city.properties.find(p=>p.id===g.propertyId);
    const newPropertyId=e2NextId(city.properties,'PROP-');
    const existingIds=city.plots.map(p=>p.id);
    const leftPlots=[],rightPlots=[],plotMapping=[];
    for(const oldId of source.plotIds){
      const old=city.plots.find(p=>p.id===oldId),fragments=g.fragments.filter(f=>f.originalId===oldId);
      if(!old||!fragments.length)throw Error('Source plot identity was not preserved.');
      const crosses=fragments.length===2;
      for(const fragment of fragments){
        const isRight=fragment.side==='right';
        const fragmentId=crosses&&isRight?e2NextId(existingIds.map(id=>({id})),'PLOT-'):oldId;
        if(crosses&&isRight)existingIds.push(fragmentId);
        const base=crosses&&isRight
          ?{id:fragmentId,blockId:source.blockId,propertyId:newPropertyId,
            frontageRoadId:source.frontageRoadId,boundary:copyJson(fragment.boundary)}
          :{...old,id:fragmentId,propertyId:isRight?newPropertyId:source.id,
            boundary:copyJson(fragment.boundary)};
        const oldIndex=city.plots.findIndex(p=>p.id===oldId);
        if(crosses&&isRight)city.plots.push(base);
        else city.plots[oldIndex]=base;
        (isRight?rightPlots:leftPlots).push(fragmentId);
        plotMapping.push({sourceId:oldId,successorId:fragmentId,side:fragment.side});
      }
    }
    const lineage={operation:'frontage-to-rear',sourceId:source.id,
      successors:[source.id,newPropertyId],retainedSide:'left'};
    const oldHistory=source.propertySplitHistoryE2;
    if(oldHistory!==undefined&&!Array.isArray(oldHistory))
      throw Error('Existing property split-lineage metadata has an unsupported form.');
    const history=[...(oldHistory??[]),lineage];
    const right={
      id:newPropertyId,blockId:source.blockId,districtId:source.districtId??null,
      plotIds:rightPlots,buildingIds:[],boundary:copyJson(g.right),
      frontageRoadId:source.frontageRoadId,frontage:copyJson(g.right.slice(0,2)),
      area:g.areaRight,usage:source.usage,frame:copyJson(source.frame),
      local:propertyLocalBounds3I(source,g.right),
      roadProvenance:{source:'user-split-e2'},propertySplitHistoryE2:[lineage]
    };
    const left={...source,plotIds:leftPlots,buildingIds:[],boundary:copyJson(g.left),
      frontage:copyJson(g.left.slice(0,2)),area:g.areaLeft,
      local:propertyLocalBounds3I(source,g.left),
      roadProvenance:{source:'user-split-e2'},propertySplitHistoryE2:history};
    const index=city.properties.findIndex(p=>p.id===source.id);
    city.properties[index]=left;city.properties.push(right);
    const sides=new Map(g.sides);
    const movements=[];
    for(const building of city.buildings.filter(b=>b.propertyId===source.id)){
      const side=sides.get(building.id);
      if(!side)throw Error('Building ownership is unresolved.');
      const owner=side==='left'?left:right;
      const originalId=building.propertyId;
      building.propertyId=owner.id;
      const plots=deriveOccupiedPlots(city,owner,building);
      if(!plots.length)throw Error('Building '+building.id+' occupies no verified resulting plot.');
      building.plotIds=plots;
      owner.buildingIds.push(building.id);
      if(owner.id!==originalId)movements.push({buildingId:building.id,from:originalId,to:owner.id});
    }
    // No recalculation of open-space totals: area is exactly conserved.
    validateStoredProject(candidate);
    const restored=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace))).project;
    if(!e2Same(candidate.city,restored.city))throw Error('Portable save/load changed the split project.');
    return {...inspection,ok:true,status:'valid',candidate:restored,
      newPropertyId,sourcePropertyId:source.id,plotMapping,movements,lineage};
  }catch(e){
    return {...inspection,ok:false,status:'invalid',issues:[e2Issue('project','Split Apply rejected: '+e.message)],candidate:null};
  }
}
