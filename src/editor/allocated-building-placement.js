import { prepareBuildingStructure3H } from './building-structures.js';
import { copyJson } from '../data/project-format.js';

// Detached host-side manual placement adapter. Caller supplies the trusted
// session and authored placement intent, never a worker-approved candidate.
const idaBuildingRequests=()=>[{type:'building',key:'manual-building'}];
function idaBuildingIntent(intent){
  if(!intent||typeof intent!=='object'||Array.isArray(intent)||
     typeof intent.propertyId!=='string'||!intent.propertyId||
     !intent.spec||intent.courtyard?.only||
     Object.keys(intent).some(key=>!['propertyId','spec','courtyard'].includes(key)))
    throw Error('A manual building creation intent is required.');
  return copyJson(intent);
}
function idaBuildingPrepare(project,workspace,intent,context,receipt){
  const id=receipt?.allocations?.[0]?.id;
  return prepareBuildingStructure3H(project,workspace,{
    ...intent,operation:'add',buildingId:id
  },{identityReservation:{context,receipt}});
}
// Preview reservations are pure and can be discarded without consuming IDs.
export function previewAllocatedBuildingPlacement(session,workspace,intent){
  const input=idaBuildingIntent(intent),{project,context}=session.read();
  const receipt=session.reserve(idaBuildingRequests());
  return {context,receipt,result:idaBuildingPrepare(project,workspace,input,context,receipt)};
}
// On Apply, reconstruct the domain candidate from the trusted current state
// and original intent. The coordinator separately validates allocation,
// membership, full project and D01 capacity before atomic publication.
export function commitAllocatedBuildingPlacement(session,workspace,intent,reservation){
  const input=idaBuildingIntent(intent),{project,context}=session.read();
  const receipt=reservation?.receipt;
  if(!reservation?.context||JSON.stringify(context)!==JSON.stringify(reservation.context))
    throw Error('Stale building placement reservation.');
  const result=idaBuildingPrepare(project,workspace,input,context,receipt);
  if(!result.ok)throw Error(result.issues?.[0]?.message??'Building placement refused.');
  return session.commit({
    requests:idaBuildingRequests(),receipt,candidateCity:result.candidate.city,
    transaction:{family:'building',operation:'building-structure',label:'Place building',
      targetIds:[input.propertyId,receipt.allocations[0].id]},
    validateDomain:(before,after)=>{
      const fresh=idaBuildingPrepare(before,workspace,input,context,receipt);
      return fresh.ok&&JSON.stringify(fresh.candidate)===JSON.stringify(after);
    }
  });
}
