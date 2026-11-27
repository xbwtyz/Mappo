import { riFreeze } from './road-impact-model.js';

// Only call on an independently replayed candidate. Never present a
// search-provided ledger as the review of what will actually be accepted.
export function spatialRoadReviewSummary(before,after){
  const retired=[],added=[],frontageSwitches=[],scaledBuildings=[];
  let demolishedFootprint=0,regeneratedFootprint=0,scaleLoss=0;
  for(const collection of ['properties','plots','buildings']){
    const a=new Map(before.city[collection].map(row=>[row.id,row]));
    const b=new Map(after.city[collection].map(row=>[row.id,row]));
    for(const [id,old] of a){
      const next=b.get(id);
      if(!next){
        retired.push({collection,id});
        if(collection==='buildings')demolishedFootprint+=old.area;
      }else{
        if(collection==='properties'&&old.frontageRoadId!==next.frontageRoadId)
          frontageSwitches.push({propertyId:id,from:old.frontageRoadId,to:next.frontageRoadId});
        if(collection==='buildings'&&old.area-next.area>1e-6){
          const footprintLoss=old.area-next.area;
          scaledBuildings.push({buildingId:id,factor:Math.sqrt(next.area/old.area),footprintLoss});
          scaleLoss+=footprintLoss;
        }
      }
    }
    for(const [id,row] of b)if(!a.has(id)){
      added.push({collection,id});
      if(collection==='buildings')regeneratedFootprint+=row.area;
    }
  }
  return riFreeze({retired,added,frontageSwitches,scaledBuildings,demolishedFootprint,
    regeneratedFootprint,scaleLoss});
}

export async function spatialRoadReviewFingerprint(projectJson){
  if(typeof projectJson!=='string'||!globalThis.crypto?.subtle)
    throw Error('Spatial review fingerprint unavailable.');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(projectJson));
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
