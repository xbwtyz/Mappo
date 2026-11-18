import { copyJson } from '../data/project-format.js';
import { propertyDividerFractions3I, propertyGeometryPreview3I } from '../core/property-geometry.js';

// Draft boundaries and plot divisions exist only inside this in-memory session.
export class PropertyEditSession3I {
  constructor(changed = () => {}) {
    this.changed=changed; this.active=null; this.selectedCorner=null; this.selectedDivider=0; this.drag=null;
    this.validation=null;
  }
  get isActive(){return Boolean(this.active);}
  get propertyId(){return this.active?.propertyId??null;}
  get boundary(){return this.active?.boundary??null;}
  get dividers(){return this.active?.dividers??null;}
  get isPending(){return Boolean(this.active && (JSON.stringify(this.active.boundary)!==JSON.stringify(this.active.originalBoundary)
    ||JSON.stringify(this.active.dividers)!==JSON.stringify(this.active.originalDividers)));}
  source(city){return city?.properties?.find(p=>p.id===this.propertyId)??null;}
  previewFor(city){return this.isActive && this.source(city)?copyJson(this.active.boundary):null;}
  plotsFor(city){
    if(!this.isActive)return null;
    try{return propertyGeometryPreview3I(city,this.propertyId,this.boundary,this.dividers).plots;}
    catch{return null;}
  }
  start(city,propertyId){
    const property=city?.properties?.find(item=>item.id===propertyId);
    if(!property || property.boundary?.length!==4)return false;
    let dividers;
    try{dividers=propertyDividerFractions3I(city,property);}
    catch{return false;}
    const boundary=copyJson(property.boundary);
    this.active={propertyId,boundary,dividers,
      originalBoundary:copyJson(boundary),originalDividers:[...dividers]};
    this.selectedCorner=null;this.selectedDivider=0;this.drag=null;this.validation=null;
    this.changed();return true;
  }
  selectCorner(index){
    if(!this.isActive||!Number.isInteger(index)||index<0||index>3)return false;
    this.selectedCorner=index;this.changed();return true;
  }
  setCorner(index,point){
    if(!this.isActive || !Number.isInteger(index)||index<0||index>3
      || !Number.isFinite(point?.x)||!Number.isFinite(point?.y)
      ||Math.abs(point.x)>=10000||Math.abs(point.y)>=10000)return false;
    this.active.boundary[index]={x:point.x,y:point.y};
    this.selectedCorner=index;this.validation=null;this.changed();return true;
  }
  setDivider(index,ratio){
    if(!this.isActive||!Number.isInteger(index)||index<0||index>=this.dividers.length
      ||!Number.isFinite(ratio)||ratio<=0||ratio>=1)return false;
    this.active.dividers[index]=ratio;this.selectedDivider=index;
    this.validation=null;this.changed();return true;
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
    this.selectedCorner=null;this.selectedDivider=0;this.drag=null;this.validation=null;
    this.changed();return true;
  }
  stop(){
    if(!this.isActive)return false;
    this.active=null;this.selectedCorner=null;this.selectedDivider=0;this.drag=null;this.validation=null;
    this.changed();return true;
  }
}
