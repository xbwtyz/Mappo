import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSelectionSetA1, selectionTransitionA1, selectionSingletonA1, workspaceInitialState, workspaceTransition, SELECTION_LIMIT_A1 } from '../src/core/workspace-state.js';
const ref=(id,kind='road')=>({kind,id});
const action=(set,type,item)=>selectionTransitionA1(set,{type,ref:item},{canGroup:kind=>kind==='road'});

test('A1 ordered selection is immutable and primary follows the last added member',()=>{
  const original=makeSelectionSetA1([ref('A')]);
  let set=action(original,'toggle',ref('B')).selection;
  assert.deepEqual(set.items,[ref('A'),ref('B')]);assert.deepEqual(set.primary,ref('B'));
  assert.equal(selectionSingletonA1(set),null);
  set=action(set,'toggle',ref('B')).selection;
  assert.deepEqual(selectionSingletonA1(set),ref('A'));assert.deepEqual(set.primary,ref('A'));
  assert.deepEqual(original.items,[ref('A')]);
  assert.ok(Object.isFrozen(original.items)&&Object.isFrozen(original.items[0]));
  assert.equal(action(set,'toggle',ref('A')).selection.primary,null);
});
test('A1 incompatible, missing and duplicate references cannot alter membership',()=>{
  const set=makeSelectionSetA1([ref('A')]);
  for(const item of [ref('A','junction'),ref('B','property')]){
    const result=action(set,'toggle',item);assert.equal(result.ok,false);assert.equal(result.selection,set);
  }
  assert.equal(selectionTransitionA1(set,{type:'toggle',ref:ref('missing')},{exists:()=>false}).selection,set);
  assert.throws(()=>makeSelectionSetA1([ref('A'),ref('A')]));
  assert.throws(()=>makeSelectionSetA1([ref('A')],ref('B')));
  const full=makeSelectionSetA1(Array.from({length:SELECTION_LIMIT_A1},(_,i)=>ref(String(i))));
  assert.equal(action(full,'toggle',ref('extra')).ok,false);
});
test('A1 reconciliation removes retired IDs and retains valid primary or deterministic fallback',()=>{
  const set=makeSelectionSetA1([ref('A'),ref('B'),ref('C')]);
  const result=selectionTransitionA1(set,{type:'reconcile'},{exists:r=>r.id!=='C'});
  assert.deepEqual(result.selection.items,[ref('A'),ref('B')]);assert.deepEqual(result.selection.primary,ref('B'));
  assert.deepEqual(selectionTransitionA1(set,{type:'clear'}).selection,makeSelectionSetA1());
});
test('A1 workspace stores one selection set and exposes only the supported singleton view',()=>{
  let state=workspaceInitialState();
  state=workspaceTransition(state,{type:'select',selection:ref('P','property')});
  assert.deepEqual(state.selection,ref('P','property'));assert.equal(state.selection,state.selectionSet.items[0]);
  state=workspaceTransition(state,{type:'road-selection-a1',set:makeSelectionSetA1([ref('A'),ref('B')])});
  assert.equal(state.selection,null);assert.equal(state.selectionSet.items.length,2);
  state=workspaceTransition(state,{type:'select',selection:null});
  assert.equal(state.selectionSet.items.length,0);
});
