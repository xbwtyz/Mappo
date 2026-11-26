import { preparePropertyCreationE1 } from './property-creation-e1.js';
import { copyJson } from '../data/project-format.js';

// Detached host adapter. E1 remains the sole geometry/ownership authority;
// the accepted session is the sole allocator and history authority.
const idaPropertyCreationRequests=()=>[{type:'property',key:'new-property'},{type:'plot',key:'initial-plot'}];
function idaPropertyCreationIntent(draft){
  const keys=['blockId','roadId','u','width','depth'];
  if(!draft||typeof draft!=='object'||Array.isArray(draft)||
     Reflect.ownKeys(draft).length!==keys.length||keys.some(k=>!Object.hasOwn(draft,k))||
     !['blockId','roadId'].every(k=>typeof draft[k]==='string'&&draft[k])||
     !['u','width','depth'].every(k=>typeof draft[k]==='number'&&Number.isFinite(draft[k])))
    throw Error('A valid property creation intent is required.');
  return copyJson(draft);
}
function idaPropertyCreationPrepare(project,workspace,draft,context,receipt){
  return preparePropertyCreationE1(project,workspace,draft,{identityReservation:{context,receipt}});
}
export function previewAllocatedPropertyCreation(session,workspace,draft){
  const input=idaPropertyCreationIntent(draft),{project,context}=session.read();
  const receipt=session.reserve(idaPropertyCreationRequests());
  return {context,receipt,result:idaPropertyCreationPrepare(project,workspace,input,context,receipt)};
}
export function commitAllocatedPropertyCreation(session,workspace,draft,reservation){
  const input=idaPropertyCreationIntent(draft),{project,context}=session.read();
  const receipt=reservation?.receipt;
  if(!reservation?.context||JSON.stringify(context)!==JSON.stringify(reservation.context))
    throw Error('Stale property creation reservation.');
  const result=idaPropertyCreationPrepare(project,workspace,input,context,receipt);
  if(!result.ok)throw Error(result.issues?.[0]?.message??'Property creation refused.');
  return session.commit({
    requests:idaPropertyCreationRequests(),receipt,candidateCity:result.candidate.city,
    transaction:{family:'property',operation:'property-creation',label:'Create property',
      targetIds:[result.propertyId,result.plotId]},
    validateDomain:(before,after)=>{
      const fresh=idaPropertyCreationPrepare(before,workspace,input,context,receipt);
      return fresh.ok&&JSON.stringify(fresh.candidate)===JSON.stringify(after);
    }
  });
}
