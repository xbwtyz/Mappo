const LARE_CONFLICT_TYPES=Object.freeze(['geometric-obstruction','protected-content',
  'decision-required','unsupported-configuration','search-exhausted','work-limit','invalid-candidate']);
export function lareConflict(type,code,entityIds,message){
  if(!LARE_CONFLICT_TYPES.includes(type)||typeof code!=='string'||!code||
    !Array.isArray(entityIds)||entityIds.some(id=>typeof id!=='string'||!id)||
    typeof message!=='string'||!message)throw Error('Invalid reconciliation diagnostic.');
  return Object.freeze({type,code,entityIds:Object.freeze([...new Set(entityIds)].sort()),message,severity:'needs-review'});
}
