import { copyJson } from '../data/project-format.js';
import { FlexiblePlotDraft027 } from './plot-draft-027.js';
import { propertyDividerFractions3I, propertyGeometryPreview3I } from '../core/property-geometry.js';
import { propertyPolygonPreview024, PROPERTY_VERTEX_LIMIT_024 } from '../core/property-polygons-024.js';

// Draft boundaries and plot divisions exist only inside this in-memory session.
export class PropertyEditSession3I {
  constructor(changed = () => {}) {
    this.changed=changed; this.active=null; this.selectedCorner=null; this.selectedDivider=0; this.drag=null;
    this.validation=null;this.flexible=null;
  }
  get flexibleMode(){return Boolean(this.flexible);}
  get isActive(){return Boolean(this.active);}
  get propertyId(){return this.active?.propertyId??null;}
  get boundary(){return this.active?.boundary??null;}
  get dividers(){return this.active?.dividers??null;}
  get plotIds(){return this.active?.plotIds??null;}
  get countChange(){return this.active?.countChange??null;}
  get approved(){return Boolean(this.active?.approved);}
  get polygonMode(){return Boolean(this.active && (this.active.polygonEdited || this.active.originalBoundary.length!==4 || this.boundary.length!==4));}
  get isPending(){return Boolean(this.active && (JSON.stringify(this.active.boundary)!==JSON.stringify(this.active.originalBoundary)
    ||JSON.stringify(this.active.dividers)!==JSON.stringify(this.active.originalDividers)
    ||Boolean(this.active.countChange)||Boolean(this.flexible?.pending)));}
  source(city){return city?.properties?.find(p=>p.id===this.propertyId)??null;}
  previewFor(city){return this.isActive && this.source(city)?copyJson(this.active.boundary):null;}
  plotsFor(city){
    if(!this.isActive)return null;
    try{return this.flexible?copyJson(this.flexible.plots):(this.polygonMode?propertyPolygonPreview024(city,this.propertyId,this.boundary):propertyGeometryPreview3I(city,this.propertyId,this.boundary,this.dividers,this.plotIds)).plots;}
    catch{return null;}
  }
  start(city,propertyId){
    const property=city?.properties?.find(item=>item.id===propertyId);
    if(!property || !Array.isArray(property.boundary) ||
       property.boundary.length<3 || property.boundary.length>PROPERTY_VERTEX_LIMIT_024)return false;
    let dividers=[],polygonEdited=property.boundary.length!==4;
    if(property.boundary.length===4){
      try{dividers=propertyDividerFractions3I(city,property);}
      catch{polygonEdited=true;}
    }
    const boundary=copyJson(property.boundary);
    this.active={propertyId,boundary,dividers,plotIds:[...property.plotIds],countChange:null,approved:false,polygonEdited,
      originalBoundary:copyJson(boundary),originalDividers:[...dividers],originalPlotIds:[...property.plotIds]};
    this.selectedCorner=null;this.selectedDivider=0;this.drag=null;this.validation=null;
    this.flexible=null;this.changed();return true;
  }
  beginFlexible(city){
    if(!this.isActive||this.isPending)return false;
    try{this.flexible=new FlexiblePlotDraft027(city,this.source(city));this.validation=null;this.changed();return true;}
    catch(error){this.validation={ok:false,status:'invalid',issues:[{message:error.message}]};return false;}
  }
  splitFlexible(city){
    if(!this.flexible)return false;
    try{this.flexible.split(city);this.validation=null;this.changed();return true;}
    catch(error){this.flexible.error=error.message;this.changed();return false;}
  }
  mergeFlexible(){
    if(!this.flexible)return false;
    try{this.flexible.merge();this.validation=null;this.changed();return true;}
    catch(error){this.flexible.error=error.message;this.changed();return false;}
  }
  undoFlexible(){if(!this.flexible?.undo())return false;this.validation=null;this.changed();return true;}
  approveFlexible(value){if(!this.flexible)return false;this.flexible.approved=Boolean(value);this.validation=null;this.changed();return true;}
  updateFlexible(values){if(!this.flexible)return false;Object.assign(this.flexible,values);this.flexible.error='';this.validation=null;this.changed();return true;}
  selectCorner(index){
    if(!this.isActive||!Number.isInteger(index)||index<0||index>=this.boundary.length)return false;
    this.selectedCorner=index;this.changed();return true;
  }
  setCorner(index,point){
    if(!this.isActive || !Number.isInteger(index)||index<0||index>=this.boundary.length
      || !Number.isFinite(point?.x)||!Number.isFinite(point?.y)
      ||Math.abs(point.x)>=10000||Math.abs(point.y)>=10000)return false;
    this.active.boundary[index]={x:point.x,y:point.y};
    this.selectedCorner=index;this.validation=null;this.changed();return true;
  }
  // Insert on a rear/side edge. Edge 0->1 is reserved as the authoritative
  // road frontage; a new collinear handle can be dragged into a polygon.
  addVertex(index=this.selectedCorner??2){
    if(!this.isActive||this.flexible||this.active.countChange||this.boundary.length>=PROPERTY_VERTEX_LIMIT_024
       ||!Number.isInteger(index)||index<1||index>=this.boundary.length)return false;
    const a=this.boundary[index],b=this.boundary[(index+1)%this.boundary.length];
    this.boundary.splice(index+1,0,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    this.active.polygonEdited=true;
    this.active.dividers=[];this.selectedCorner=index+1;this.validation=null;this.changed();
    return true;
  }
  removeVertex(index=this.selectedCorner){
    if(!this.isActive||this.flexible||this.active.countChange||this.boundary.length<=3
      ||!Number.isInteger(index)||index<2||index>=this.boundary.length)return false;
    this.boundary.splice(index,1);this.active.polygonEdited=true;
    this.active.dividers=[];this.selectedCorner=Math.min(index,this.boundary.length-1);
    this.validation=null;this.changed();return true;
  }
  setDivider(index,ratio){
    if(!this.isActive||this.flexible||this.polygonMode||!Number.isInteger(index)||index<0||index>=this.dividers.length
      ||!Number.isFinite(ratio)||ratio<=0||ratio>=1)return false;
    this.active.dividers[index]=ratio;this.selectedDivider=index;
    this.validation=null;this.changed();return true;
  }
  // Only one structural plot-count change per Apply. The normal 3I draft remains active.
  addDivider(city,index=0){
    if(!this.isActive||this.flexible||this.polygonMode||this.active.countChange||!Number.isInteger(index)
      ||index<0||index>=this.plotIds.length)return false;
    const source=this.plotIds[index],sourcePlot=city?.plots?.find(p=>p.id===source&&p.propertyId===this.propertyId);
    if(!sourcePlot)return false;
    const left=index===0?0:this.dividers[index-1],right=index===this.dividers.length?1:this.dividers[index];
    if(right-left<.0004)return false;
    const used=new Set(city.plots.map(p=>p.id));
    let serial=1,id;
    do{id='PLOT-'+String(serial++).padStart(5,'0');}while(used.has(id)&&serial<50000);
    if(used.has(id))return false;
    this.dividers.splice(index,0,(left+right)/2);
    this.plotIds.splice(index+1,0,id);
    this.active.countChange={kind:'split',sourceId:source,newId:id};
    this.active.approved=false;this.selectedDivider=index;
    this.validation=null;this.changed();return true;
  }
  removeDivider(index=0){
    if(!this.isActive||this.flexible||this.polygonMode||this.active.countChange||!Number.isInteger(index)||
      index<0||index>=this.dividers.length)return false;
    const retainedId=this.plotIds[index],retiredId=this.plotIds[index+1];
    this.dividers.splice(index,1);this.plotIds.splice(index+1,1);
    this.active.countChange={kind:'merge',retainedId,retiredId};
    this.active.approved=false;this.selectedDivider=Math.min(index,this.dividers.length-1);
    this.validation=null;this.changed();return true;
  }
  approvePlotCount(value){
    if(!this.isActive||!this.active.countChange)return false;
    this.active.approved=Boolean(value);this.validation=null;this.changed();return true;
  }
  hitCorner(city,point,zoom=1){
    const preview=this.previewFor(city);
    if(!preview||!point)return null;
    const radius=12/Math.max(.18,zoom);
    let closest=null,distance=radius;
    preview.forEach((corner,i)=>{
      const d=Math.hypot(corner.x-point.x,corner.y-point.y);
      if(d<=distance){closest=i;distance=d;}
    });
    return closest;
  }
  reset(){
    if(!this.isActive)return false;
    this.active.boundary=copyJson(this.active.originalBoundary);
    this.active.dividers=[...this.active.originalDividers];
    this.active.plotIds=[...this.active.originalPlotIds];
    this.active.countChange=null;this.active.approved=false;this.active.polygonEdited=false;this.flexible=null;
    this.selectedCorner=null;this.selectedDivider=0;this.drag=null;this.validation=null;
    this.changed();return true;
  }
  stop(){
    if(!this.isActive)return false;
    this.active=null;this.flexible=null;this.selectedCorner=null;this.selectedDivider=0;this.drag=null;this.validation=null;
    this.changed();return true;
  }
}
