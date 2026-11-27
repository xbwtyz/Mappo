import { createSpatialOperation, spatialRefKey } from './spatial-recovery-contract.js';
import { verifySpatialRetirementWitness } from './spatial-recovery-road-adapter.js';
import { riCompare, riEqual, riFreeze } from './road-impact-model.js';

// Detached W4 audit foundation. Each entry is an actual independently
// replayable retirement candidate relative to the ORIGINAL accepted city.
// No transient search ledger or assertion of an ID can authorize or certify
// retirement. This proves supplied transitions, not completeness of an
// untrusted history. Capture/completeness and UI binding are separate gates.
// One caller-owned independent audit budget, never a new budget per entry.
export const SRE_RESTORATION_AUDIT_VERSION=1;
export const SRE_RESTORATION_AUDIT_MAX_WITNESSES=16;
const sreAuditCollections=['properties','plots','buildings'];
const sreAuditSort=(a,b)=>riCompare(spatialRefKey(a),spatialRefKey(b));
export async function verifySpatialRestorationAudit(project,input,trail,finalBasis,budget){
  const op=createSpatialOperation(input);
  if(!op.permissions.destruction||!budget?.spend||
     !Array.isArray(trail)||!trail.length||trail.length>SRE_RESTORATION_AUDIT_MAX_WITNESSES||
     !finalBasis||!riEqual(trail.at(-1),finalBasis))
    throw Error('Invalid or incomplete restoration audit basis.');
  const retirement=createSpatialOperation({...op,permissions:{...op.permissions,regeneration:false}});
  const original=new Map(),gross=new Map(),seen=new Set(),transitions=[];
  for(const collection of sreAuditCollections){
    for(const row of project.city[collection]){
      budget.spend();const ref={collection,id:row.id};original.set(spatialRefKey(ref),row);
    }
  }
  let previous=new Map();
  for(const delta of trail){
    budget.spend();
    if(!delta||!Array.isArray(delta.retired)||!delta.retired.length||
      !Array.isArray(delta.added)||delta.added.length)
      throw Error('Restoration audit requires nonempty retirement-only witnesses.');
    // Independent original-to-candidate replay checks intent, eligibility,
    // retained geometry, identity and permissions. Do not trust delta lists.
    const candidate=await verifySpatialRetirementWitness(project,retirement,delta,budget);
    if(seen.has(delta.candidateFingerprint))throw Error('Duplicate restoration audit witness.');
    seen.add(delta.candidateFingerprint);
    const current=new Map();
    for(const collection of sreAuditCollections){
      const surviving=new Set();
      for(const row of candidate.city[collection]){budget.spend();surviving.add(row.id);}
      for(const row of project.city[collection]){
        budget.spend();
        if(!surviving.has(row.id)){
          const ref={collection,id:row.id},key=spatialRefKey(ref);
          current.set(key,ref);gross.set(key,ref);
        }
      }
    }
    const newlyRetired=[...current].filter(([k])=>!previous.has(k)).map(([,r])=>r).sort(sreAuditSort);
    const restored=[...previous].filter(([k])=>!current.has(k)).map(([,r])=>r).sort(sreAuditSort);
    // Geometry-only refinement need not consume a second audit entry.
    transitions.push({candidateFingerprint:delta.candidateFingerprint,newlyRetired,restored});
    previous=current;
  }
  const grossRetired=[...gross.values()].sort(sreAuditSort);
  const restored=grossRetired.filter(r=>!previous.has(spatialRefKey(r)));
  const finalRetired=[...previous.values()].sort(sreAuditSort);
  const footprint=refs=>refs.reduce((sum,ref)=>{
    budget.spend();return sum+(ref.collection==='buildings'?original.get(spatialRefKey(ref)).area:0);
  },0);
  return riFreeze({version:SRE_RESTORATION_AUDIT_VERSION,
    finalBasisFingerprint:finalBasis.candidateFingerprint,transitions,grossRetired,restored,finalRetired,
    grossRetiredFootprint:footprint(grossRetired),restoredFootprint:footprint(restored),finalRetiredFootprint:footprint(finalRetired)});
}
