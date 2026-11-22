import { copyJson } from '../data/project-format.js';
import { splitConvexPlot027,mergeConvexPlots027,validatePlotTiling027 } from '../core/plot-partition-027.js';

const baseFields=new Set(['id','propertyId','blockId','frontageRoadId','boundary']);
export const annotatedPlot027=plot=>Boolean(plot&&Object.keys(plot).some(k=>!baseFields.has(k)));
export class FlexiblePlotDraft027 {
  constructor(city,property){
    this.propertyId=property.id;
    this.parent=copyJson(property.boundary);
    this.baseline=JSON.stringify(city);
    this.plots=property.plotIds.map(id=>{
      const p=city.plots.find(x=>x.id===id&&x.propertyId===property.id);
      if(!p)throw Error('Original plot list is incomplete.');
      return {id,boundary:copyJson(p.boundary)};
    });
    validatePlotTiling027(property.boundary,this.plots);
    this.operations=[];this.selectedId=this.plots[0].id;this.otherId='';
    this.edgeA=0;this.edgeB=Math.min(2,this.plots[0].boundary.length-1);
    this.ratioA=.5;this.ratioB=.5;this.retain='first';this.approved=false;this.error='';
  }
  get pending(){return this.operations.length>0;}
  get selected(){return this.plots.find(p=>p.id===this.selectedId)??null;}
  requireSpace(){if(this.operations.length>=12)throw Error('Apply before adding more than 12 draft operations.');}
  cut(){
    if(!this.selected)throw Error('Choose a plot first.');
    return splitConvexPlot027(this.selected.boundary,this.edgeA,this.ratioA,this.edgeB,this.ratioB);
  }
  split(city){
    this.requireSpace();
    const source=this.selected,part=this.cut();
    const used=new Set([...city.plots.map(p=>p.id),...this.plots.map(p=>p.id)]);
    let serial=1,id;
    do{id='PLOT-'+String(serial++).padStart(5,'0');}while(used.has(id)&&serial<50000);
    if(used.has(id))throw Error('No unused plot identifier available.');
    const index=this.plots.indexOf(source),keep=this.retain==='second'?1:0,before=copyJson(this.plots);
    const proposed=copyJson(this.plots);
    proposed.splice(index,1,...part.plots.map((boundary,i)=>({id:i===keep?source.id:id,boundary})));
    validatePlotTiling027(this.parent,proposed);
    this.plots=proposed;
    this.operations.push({kind:'split',sourceId:source.id,retainedId:source.id,createdId:id,before});
    this.selectedId=source.id;this.otherId='';this.edgeA=0;this.edgeB=Math.min(2,this.selected.boundary.length-1);
    this.approved=false;this.error='';return id;
  }
  merge(){
    this.requireSpace();
    const a=this.selected,b=this.plots.find(p=>p.id===this.otherId);
    if(!a||!b||a===b)throw Error('Select two distinct plots.');
    const boundary=mergeConvexPlots027(a.boundary,b.boundary);
    const keep=this.retain==='second'?b:a,removed=keep===a?b:a,before=copyJson(this.plots);
    const first=Math.min(this.plots.indexOf(a),this.plots.indexOf(b));
    const proposed=this.plots.filter(p=>p!==a&&p!==b);
    proposed.splice(first,0,{id:keep.id,boundary});
    validatePlotTiling027(this.parent,proposed);
    this.plots=proposed;
    this.operations.push({kind:'merge',sources:[a.id,b.id],retainedId:keep.id,retiredId:removed.id,before});
    this.selectedId=keep.id;this.otherId='';this.edgeA=0;this.edgeB=Math.min(2,boundary.length-1);
    this.approved=false;this.error='';return removed.id;
  }
  undo(){
    const op=this.operations.pop();if(!op)return false;
    this.plots=copyJson(op.before);
    this.selectedId=this.plots.some(p=>p.id===this.selectedId)?this.selectedId:this.plots[0].id;
    this.edgeA=0;this.edgeB=Math.min(2,this.selected.boundary.length-1);
    this.approved=false;this.error='';return true;
  }
  authorizations(city){
    const original=city.properties.find(p=>p.id===this.propertyId);
    return (original?.plotIds??[]).filter(id=>{
      const source=city.plots.find(p=>p.id===id&&p.propertyId===this.propertyId);
      const target=this.plots.find(p=>p.id===id);
      return annotatedPlot027(source)&&(!target||JSON.stringify(source.boundary)!==JSON.stringify(target.boundary));
    });
  }
}
