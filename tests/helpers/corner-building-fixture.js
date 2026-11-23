import { createProject } from '../../src/core/city-model.js';
import { polygonSignedArea } from '../../src/core/geometry.js';
import { deriveOccupiedPlots, reattachFrontage } from '../../src/editor/building-application.js';
import { writeSimpleBuildingS10, hydrateBuildingS10 } from '../../src/core/building-project-s10.js';

export function cornerBuildingFixture() {
  const project=createProject({morphology:'linear',seed:'mappo-001',size:'medium'});
  const {city}=project;
  const property=city.properties.find(row=>row.id==='PROP-00233');
  const building=city.buildings.find(row=>row.id==='BLD-00254');
  const obstacle=city.buildings.find(row=>row.id==='BLD-00252');
  city.buildings=city.buildings.filter(row=>row.id!=='BLD-00253');
  property.buildingIds=property.buildingIds.filter(id=>id!=='BLD-00253');
  for(const [row,x,y,w,h] of [[obstacle,-167,-28,42,5],[building,-146,-16,4,4]]){
    const footprint=[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
    const shape=writeSimpleBuildingS10(row,{footprint,holes:[],area:polygonSignedArea(footprint),orientation:0});
    Object.assign(row,{geometry:shape.geometry,components:shape.components,area:shape.area,orientation:0});
    hydrateBuildingS10(row,true);
    row.plotIds=deriveOccupiedPlots(city,property,row);
    const {entrance,accessPath}=reattachFrontage(city,row);
    Object.assign(row,{entrance,accessPath});
  }
  return {project,building,property,sideRoadId:'RD-0218',dy:-19};
}
