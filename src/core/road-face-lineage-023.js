import { roadFaceOverlapArea } from './road-face-geometry.js';
import { ROAD_FACE_WORK_LIMIT } from './road-faces.js';

// Detached, bounded evidence for changed ordinary road faces. No records or IDs are mutated.
const lineage023Compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const lineage023CloseArea = (a, b) => Math.abs(a-b) <= Math.max(0.02,Math.max(Math.abs(a),Math.abs(b))*1e-8);
const lineage023AllowedBlockFields = new Set(['id','vertices','area','ring','sector','usage','districtId']);

export function buildRoadFaceLineage023(acceptedCity, extraction, matching) {
  let spent=0;
  const spend=(n=1)=>{spent+=n;if(spent>ROAD_FACE_WORK_LIMIT)throw new Error('Lineage analysis exceeded its bounded work budget.');};
  const blocked=(code,message)=>({valid:false,faces:[],groups:[],reverse:[],issues:[{code,message}],workUnits:spent});
  if(!extraction?.valid||!matching?.valid||matching.added?.length||matching.removed?.length)
    return blocked('lineage-unproven','Complete accepted and proposed face matches are required.');
  try {
    const blocks=new Map(acceptedCity.blocks.map(b=>[b.id,b]));
    const nodes=new Map(acceptedCity.nodes.map(n=>[n.id,n]));
    const fresh=new Map(extraction.faces.filter(f=>f.kind==='block').map(f=>[f.key,f]));
    const mapped=new Map(), groups=[], reverse=new Map();
    const link=(id,key)=>{if(!reverse.has(id))reverse.set(id,new Set());reverse.get(id).add(key);};
    const source=(b,overlap,area)=>({
      blockId:b.id,overlapArea:overlap,ratioOfSuccessor:overlap/area,
      districtId:b.districtId??null,usage:b.usage,
      hasOpaqueFields:Object.keys(b).some(key=>!lineage023AllowedBlockFields.has(key)),
    });
    // Preserve the old matcher’s proven one-to-one identities.
    for(const [relation,rows] of [['preserved',matching.preserved??[]],['reshaped',matching.changed??[]]])
      for(const row of rows.filter(r=>r.kind==='block')) {
        const b=blocks.get(row.id),f=fresh.get(row.candidateKey);
        if(!b||!f||mapped.has(f.key))throw new Error('A matched block has no unique proposed face.');
        mapped.set(f.key,{candidateKey:f.key,relation,faceArea:f.area,
          predecessors:[source(b,row.overlapArea??f.area,f.area)],
          eligibleDistrictIds:[b.districtId??null],eligibleUsages:[b.usage],
          choiceRequired:{district:false,usage:false},areaVerified:true});
        link(b.id,f.key);
      }
    // For structural changes, derive per-successor choices from its own
    // positively overlapping sources, never the full transitive group.
    for(const [relation,entries] of [
      ['split',matching.split??[]],['merge',matching.merged??[]],
      ['many-to-many',matching.ambiguous??[]]
    ])for(const entry of entries) {
      const previous=entry.oldIds.map(id=>blocks.get(id));
      const proposed=entry.candidateKeys.map(key=>fresh.get(key));
      if(previous.some(b=>!b)||proposed.some(f=>!f))
        throw new Error('An ambiguous group contains a missing or protected face.');
      let total=0;
      for(const f of proposed) {
        if(mapped.has(f.key))throw new Error('A successor face is assigned more than once.');
        const predecessors=[];let covered=0;
        for(const b of previous) {
          spend();
          const polygon=b.vertices.map(id=>nodes.get(id));
          if(polygon.some(p=>!p))throw new Error('An accepted face has a missing vertex.');
          const overlap=roadFaceOverlapArea(polygon,f.polygon,spend);
          if(overlap<=1e-6)continue;
          predecessors.push(source(b,overlap,f.area));
          covered+=overlap;total+=overlap;link(b.id,f.key);
        }
        if(!predecessors.length || covered>f.area+Math.max(0.02,f.area*1e-8))
          throw new Error('A successor lacks positive or geometrically consistent ancestry.');
        predecessors.sort((a,b)=>lineage023Compare(a.blockId,b.blockId));
        const districts=[...new Set(predecessors.map(p=>p.districtId))].sort(lineage023Compare);
        const usages=[...new Set(predecessors.map(p=>p.usage))].sort(lineage023Compare);
        mapped.set(f.key,{candidateKey:f.key,relation,faceArea:f.area,predecessors,
          eligibleDistrictIds:districts,eligibleUsages:usages,
          choiceRequired:{district:districts.length>1,usage:usages.length>1},
          // Existing same-owner boundary reshapes may gain or lose area. Do
          // not mistake their partial overlap for an unsafe cross-owner edit.
          areaVerified:lineage023CloseArea(covered,f.area)});
      }
      if(!lineage023CloseArea(total,entry.overlapArea))
        throw new Error('A face group has inconsistent measured overlap.');
      const closed=lineage023CloseArea(total,entry.oldArea)&&
        lineage023CloseArea(total,entry.newArea);
      // The existing matcher only labels a split/merge when closed. A
      // many-to-many group can instead be a valid area-changing road reshape.
      if(['split','merge'].includes(relation)&&!closed)
        throw new Error('A split or merge has incomplete area closure.');
      if(previous.some(b=>!reverse.has(b.id)))
        throw new Error('An accepted predecessor has no surviving successor.');
      groups.push({relation,oldIds:[...entry.oldIds].sort(lineage023Compare),
        candidateKeys:[...entry.candidateKeys].sort(lineage023Compare),
        oldArea:entry.oldArea,newArea:entry.newArea,overlapArea:total,areaConserved:closed});
    }
    if(mapped.size!==fresh.size||acceptedCity.blocks.some(b=>!reverse.has(b.id)))
      throw new Error('Every accepted and proposed ordinary face must have one complete lineage.');
    return {valid:true,faces:[...mapped.values()].sort((a,b)=>lineage023Compare(a.candidateKey,b.candidateKey)),
      groups:groups.sort((a,b)=>lineage023Compare(a.candidateKeys[0],b.candidateKeys[0])),
      reverse:[...reverse].map(([oldId,keys])=>({oldId,candidateKeys:[...keys].sort(lineage023Compare)}))
        .sort((a,b)=>lineage023Compare(a.oldId,b.oldId)),issues:[],workUnits:spent};
  }catch(error){return blocked('lineage-unproven',error.message);}
}
