import { polygonSignedArea } from '../core/geometry.js';
import { shapeWellFormed, shapeContained, shapesOverlapInterior } from '../core/building-validation.js';
import { segmentDistance, STREET_WIDTHS, STREET_EDGE_WIDTH, PROPERTY_SETBACK } from '../core/placement.js';
import { propertyGeometryPreview3I, propertyLocalBounds3I } from '../core/property-geometry.js';
import { convexPropertyPolygon024, partitionPropertyPolygon024, propertyPolygonPreview024 } from '../core/property-polygons-024.js';
import { classifyRoadProvenance } from '../core/road-provenance.js';
import { deriveOccupiedPlots } from './building-application.js';
import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';

const E4_PLOT_BASE_FIELDS=new Set(['id','blockId','propertyId','frontageRoadId','boundary']);
const e4Annotated=plot=>Boolean(plot&&Object.keys(plot).some(key=>!E4_PLOT_BASE_FIELDS.has(key)));

const giCross=(a,b,c)=>(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
const giConvex=points=>points.length===4&&points.every((p,i)=>giCross(p,points[(i+1)%4],points[(i+2)%4])>1e-7);
const giIssue=(issues,code,message,targetId=null)=>issues.push({code,message,targetId});
const giSame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Pure inspect-on-every-preview; no mutation or JSON save/round-trip until Apply.
export function inspectPropertyEdit3I(project,session){
  const issues=[], city=project?.city, property=session?.source(city);
  if(!session?.isActive||!city||!property){
    giIssue(issues,'selection','The selected property is no longer available.');
    return {ok:false,status:'invalid',issues,preview:null};
  }
  let preview=null;
  try{preview=session.polygonMode?propertyPolygonPreview024(city,property.id,session.boundary):propertyGeometryPreview3I(city,property.id,session.boundary,session.dividers,session.plotIds);}
  catch(error){
    giIssue(issues,'subdivision',error.message);
    return {ok:false,status:'invalid',issues,preview:null};
  }
  const change=session.countChange;
  if(change){
    const sourceId=change.kind==='split'?change.sourceId:change.retiredId;
    const sourcePlot=city.plots.find(p=>p.id===sourceId&&p.propertyId===property.id);
    if(!sourcePlot)giIssue(issues,'identity','The source plot is missing or belongs to another property.',sourceId);
    else if(e4Annotated(sourcePlot)&&!session.approved)
      giIssue(issues,'authorization','Authorize the '+(change.kind==='split'?'scope change of':'retirement of')+
        ' authored plot '+sourceId+'; its original record will be preserved in history.',sourceId);
    if(change.kind==='split'&&city.plots.some(p=>p.id===change.newId))
      giIssue(issues,'identity','The new plot ID is already in use.',change.newId);
  }
  const polygon=preview.boundary;
  if(!shapeWellFormed(polygon)||(!session.polygonMode&&!giConvex(polygon)))
    giIssue(issues,'shape',session.polygonMode
      ?'Property must remain a simple, positively wound polygon with 3–12 corners and no holes.'
      :'Property must remain a non-self-intersecting convex four-corner parcel.');
  if(session.polygonMode){
    const oldPlots=property.plotIds.map(id=>city.plots.find(p=>p.id===id&&p.propertyId===property.id));
    if(oldPlots.some(plot=>!plot||e4Annotated(plot)))
      giIssue(issues,'authorship','An authored or unknown plot record cannot be silently retiled. Keep its geometry or use a supported four-corner edit.',property.id);
    else if(session.isPending){
      let derived=false;
      try{
        const currentCells=partitionPropertyPolygon024(property.boundary);
        derived=currentCells.length===oldPlots.length&&currentCells.every((cell,i)=>giSame(cell,oldPlots[i].boundary));
      }catch{}
      const generated=classifyRoadProvenance(property,oldPlots)==='generated';
      if(preview.retiredPlotIds?.length && !(generated||derived))
        giIssue(issues,'authorship','This edit would retire a plot whose generated origin cannot be verified.',property.id);
      if(property.plotCountHistoryE4 && preview.retiredPlotIds?.length)
        giIssue(issues,'history','Finish or preserve the accepted plot-count history before retiring a plot.',property.id);
    }
    const [front0,front1]=polygon,frame=property.frame;
    if(!front0||!front1||!frame?.inward||!frame?.tangent||
       Math.hypot(front1.x-front0.x,front1.y-front0.y)<7 ||
       Math.abs((front1.x-front0.x)*frame.inward.x+
         (front1.y-front0.y)*frame.inward.y)>1e-4)
      giIssue(issues,'frontage','An irregular property must retain one straight, valid street-facing edge.',property.frontageRoadId);
  }
  const block=city.blocks.find(b=>b.id===property.blockId);
  const nodes=new Map(city.nodes.map(n=>[n.id,n]));
  const blockBoundary=block?.vertices.map(id=>nodes.get(id));
  if(!blockBoundary?.every(Boolean)||!shapeContained(polygon,blockBoundary))
    giIssue(issues,'block','Property extends beyond its parent street block.',property.blockId);
  if(blockBoundary?.every(Boolean)){
    const edgeRoads=new Map(city.roads.map(r=>[[r.a,r.b].sort().join(':'),r]));
    for(let i=0;i<block.vertices.length;i++){
      const road=edgeRoads.get([block.vertices[i],block.vertices[(i+1)%block.vertices.length]].sort().join(':'));
      if(!road||!Object.hasOwn(STREET_WIDTHS,road.kind)){
        giIssue(issues,'frontage','The street edge could not be resolved.');break;
      }
      const margin=(STREET_WIDTHS[road.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK;
      for(let j=0;j<polygon.length;j++){
        if(segmentDistance(polygon[j],polygon[(j+1)%polygon.length],
            blockBoundary[i],blockBoundary[(i+1)%blockBoundary.length])<margin-1e-5){
          giIssue(issues,'setback','Property crosses the required setback from street '+road.id+'.',road.id);
          break;
        }
      }
    }
  }
  for(const neighbor of city.properties){
    if(neighbor.id===property.id||neighbor.blockId!==property.blockId)continue;
    if(shapesOverlapInterior(polygon,neighbor.boundary)){
      giIssue(issues,'neighbor','Property overlaps neighboring '+neighbor.id+'.',neighbor.id);
      break;
    }
  }
  for(const plot of preview.plots){
    if(!shapeWellFormed(plot.boundary)||!(session.polygonMode?convexPropertyPolygon024(plot.boundary):giConvex(plot.boundary))){
      giIssue(issues,'plot','A plot subdivision is too narrow, reversed, or non-convex.',plot.id);break;
    }
  }
  if(Math.abs(preview.area-preview.total)>.02)
    giIssue(issues,'tiling','Plot subdivisions do not completely cover the property.');
  for(const building of city.buildings){
    if(building.propertyId!==property.id)continue;
    if(!shapeContained(building.footprint,polygon)){
      giIssue(issues,'building','Building '+building.id+' would extend outside the edited property.',building.id);
      break;
    }
  }
  return {ok:issues.length===0,status:issues.length?'invalid':'valid',issues,preview};
}

// Apply is one transaction: entire project cloned; parent, plots, building-to-
// plot links and open-space area reconciled; schema+portable checks gate commit.
export function preparePropertyApply3I(project,workspace,session){
  const inspected=inspectPropertyEdit3I(project,session);
  if(!inspected.ok)return {...inspected,candidate:null};
  if(!session.isPending)return {ok:false,status:'unchanged',issues:[{code:'unchanged',message:'The property preview has no changes to apply.'}],preview:inspected.preview,candidate:null};
  try{
    const candidate=copyJson(project),city=candidate.city;
    const original=city.properties.find(p=>p.id===session.propertyId);
    const preview=inspected.preview;
    original.boundary=copyJson(preview.boundary);
    original.frontage=copyJson([preview.boundary[0],preview.boundary[1]]);
    original.area=polygonSignedArea(preview.boundary);
    original.local=propertyLocalBounds3I(original,preview.boundary);
    const change=session.countChange;
    if(session.polygonMode){
      const retained=new Set(preview.plots.map(p=>p.id));
      const oldPlots=original.plotIds.map(id=>city.plots.find(plot=>plot.id===id&&plot.propertyId===original.id));
      if(oldPlots.some(p=>!p||e4Annotated(p)))throw Error('Authored or missing plots cannot be retiled.');
      const accepted=project.city.properties.find(p=>p.id===original.id);
      const acceptedPlots=accepted.plotIds.map(id=>project.city.plots.find(plot=>plot.id===id&&plot.propertyId===accepted.id));
      const generated=classifyRoadProvenance(accepted,acceptedPlots)==='generated';
      let derived=false;
      try{
        const cells=partitionPropertyPolygon024(accepted.boundary);
        derived=cells.length===acceptedPlots.length&&cells.every((cell,i)=>giSame(cell,acceptedPlots[i].boundary));
      }catch{}
      if(original.plotIds.some(id=>!retained.has(id))&&!(generated||derived))
        throw Error('A plot with unknown authorship would be retired.');
      city.plots=city.plots.filter(plot=>plot.propertyId!==original.id||retained.has(plot.id));
      for(const row of preview.plots){
        if(city.plots.some(p=>p.id===row.id))continue;
        if(project.city.plots.some(p=>p.id===row.id))
          throw Error('Proposed plot ID collides with a different property.');
        city.plots.push({id:row.id,propertyId:original.id,
          blockId:original.blockId,frontageRoadId:original.frontageRoadId,
          boundary:copyJson(row.boundary)});
      }
      original.plotIds=preview.plotIds.slice();
    }else if(change){
      const history=original.plotCountHistoryE4;
      if(history!==undefined&&(!Array.isArray(history)||history.length>=20))
        throw new Error('Unsupported or full plot-count audit history; cannot overwrite it.');
      const sourceId=change.kind==='split'?change.sourceId:change.retiredId;
      const oldSource=city.plots.find(p=>p.id===sourceId&&p.propertyId===original.id);
      if(!oldSource)throw new Error('Original plot identity changed.');
      const receipt={operation:change.kind,retainedId:change.kind==='split'?change.sourceId:change.retainedId,
        newId:change.kind==='split'?change.newId:null,
        retiredId:change.kind==='merge'?change.retiredId:null,
        sourceRecord:copyJson(oldSource),previousPlotIds:copyJson(original.plotIds)};
      original.plotCountHistoryE4=[...(history??[]),receipt];
      if(change.kind==='merge'){
        city.plots=city.plots.filter(plot=>plot.id!==change.retiredId);
      }else{
        const source=city.plots.find(p=>p.id===change.sourceId);
        if(!source)throw new Error('Split plot identity changed.');
        city.plots.push({id:change.newId,propertyId:original.id,blockId:source.blockId,
          frontageRoadId:source.frontageRoadId,boundary:[]});
      }
      original.plotIds=[...session.plotIds];
    }
    for(const row of preview.plots){
      const plot=city.plots.find(p=>p.id===row.id);
      if(!plot||plot.propertyId!==original.id)throw new Error('The original plot ownership changed.');
      plot.boundary=copyJson(row.boundary);
    }
    for(const building of city.buildings){
      if(building.propertyId!==original.id)continue;
      building.plotIds=deriveOccupiedPlots(city,original,building);
      if(!building.plotIds.length)throw new Error('Edited plots no longer contain building '+building.id+'.');
    }
    const open=city.openSpaces.find(record=>record.blockId===original.blockId);
    const block=city.blocks.find(record=>record.id===original.blockId);
    if(open&&block)
      open.area=Math.max(0,block.area-city.properties.filter(p=>p.blockId===block.id).reduce((sum,p)=>sum+p.area,0));
    validateStoredProject(candidate);
    const saved=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace)));
    if(!giSame(candidate.city,saved.project.city))throw new Error('Portable project round-trip altered the accepted geometry.');
    return {ok:true,status:'valid',issues:[],preview,candidate:saved.project};
  }catch(error){
    return {ok:false,status:'invalid',issues:[{code:'project',message:'Property edit rejected: '+error.message}],preview:inspected.preview,candidate:null};
  }
}
