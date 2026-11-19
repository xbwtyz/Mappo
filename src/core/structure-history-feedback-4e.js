// Dev 4e: action-specific labels and messages come from existing session
// history entries; no history records or UI metadata are persisted.
const operations = Object.freeze({
  add: ['Remove the added building', 'Re-add the building'],
  replace: ['Restore the previous building', 'Reapply the building replacement'],
  delete: ['Restore the deleted building', 'Delete the building again'],
  clear: ['Restore all cleared buildings', 'Clear all buildings again']
});
export function describeStructureChange4E(entry,direction='undo') {
  if(!entry || !['undo','redo'].includes(direction))return null;
  const action=operations[entry.operation]?.[direction==='undo'?0:1] ??
    (direction==='undo'?'Undo the structural edit':'Redo the structural edit');
  const before=entry.before?.rows?.length,after=entry.after?.rows?.length;
  const difference=Number.isInteger(before)&&Number.isInteger(after)?Math.abs(before-after):null;
  const id=entry.propertyId??'selected property';
  const count=entry.operation==='clear'&&difference!==null?difference+' building'+(difference===1?'':'s')+' on ':'';
  const label=(direction==='undo'?'Undo ':'Redo ')+(entry.operation==='clear'?'clear':entry.operation??'structure');
  const description=action+(count?' ('+count+id+')':' on '+id)+'.';
  return {label,description,operation:entry.operation,propertyId:id,count:difference};
}
