// A1: immutable, transient selection references. Never own project geometry.
export const SELECTION_LIMIT_A1 = 256;
export function selectionRefA1(ref) {
  if (!ref || typeof ref.kind !== 'string' || !ref.kind || ref.kind.length > 64 ||
      typeof ref.id !== 'string' || !ref.id || ref.id.length > 128)
    throw new Error('Invalid selection reference.');
  return Object.freeze({kind:ref.kind,id:ref.id});
}
export function sameSelectionRefA1(a,b) {
  return a===b || Boolean(a && b && a.kind===b.kind && a.id===b.id);
}
export function makeSelectionSetA1(items=[],primary=null) {
  if (!Array.isArray(items) || items.length>SELECTION_LIMIT_A1) throw Error('Invalid selection size.');
  const refs=[],keys=new Set();
  for (const item of items) {
    const ref=selectionRefA1(item),key=JSON.stringify([ref.kind,ref.id]);
    if(keys.has(key)) throw Error('Duplicate selection reference.');
    if(refs.length && refs[0].kind!==ref.kind) throw Error('Mixed selection kinds are not supported.');
    keys.add(key);refs.push(ref);
  }
  const focus=primary===null ? refs.at(-1)??null : refs.find(ref=>sameSelectionRefA1(ref,primary));
  if(primary!==null&&!focus)throw Error('Primary selection must belong to the set.');
  return Object.freeze({items:Object.freeze(refs),primary:focus});
}
export function selectionSingletonA1(set) {
  return set?.items.length===1 ? set.items[0] : null;
}
export function selectionTransitionA1(set,action,{canGroup=()=>true,exists=()=>true}={}) {
  if(action.type==='clear')return {ok:true,selection:makeSelectionSetA1()};
  if(action.type==='reconcile') {
    const items=set.items.filter(exists);
    return {ok:true,selection:makeSelectionSetA1(items,items.some(ref=>sameSelectionRefA1(ref,set.primary))?set.primary:null)};
  }
  if(!['replace','toggle'].includes(action.type))throw Error('Unknown selection action.');
  if(action.type==='replace'&&action.ref===null)return {ok:true,selection:makeSelectionSetA1()};
  const ref=selectionRefA1(action.ref);
  if(!exists(ref))return {ok:false,selection:set,reason:'That record is no longer available.'};
  if(action.type==='replace')return {ok:true,selection:makeSelectionSetA1([ref])};
  const found=set.items.some(item=>sameSelectionRefA1(item,ref));
  if(found){
    const items=set.items.filter(item=>!sameSelectionRefA1(item,ref));
    return {ok:true,selection:makeSelectionSetA1(items,sameSelectionRefA1(ref,set.primary)?null:set.primary)};
  }
  if(set.items.length && (set.items[0].kind!==ref.kind || !canGroup(ref.kind)))
    return {ok:false,selection:set,reason:'Choose compatible objects of the same type, or click to replace the selection.'};
  if(set.items.length>=SELECTION_LIMIT_A1)
    return {ok:false,selection:set,reason:'Selection limit reached.'};
  return {ok:true,selection:makeSelectionSetA1([...set.items,ref],ref)};
}

export const WORKSPACE_SECTIONS = Object.freeze([{
  id: 'city',
  label: 'City',
  title: 'City layout'
}, {
  id: 'landscape',
  label: 'Landscape',
  title: 'Landscape'
}, {
  id: 'districts',
  label: 'Districts',
  title: 'Neighborhoods'
}, {
  id: 'defenses',
  label: 'Defenses',
  title: 'Fortifications'
}]);
export function workspaceInitialState() {
  return {
    section: 'city',
    toolsCollapsed: false,
    inspectorCollapsed: false,
    inspectorPinned: false,
    selectionSet: makeSelectionSetA1(),
    selection: null
  };
}
export function workspaceInspectorVisible(state) {
  return !state.inspectorCollapsed && (state.inspectorPinned || state.selection !== null);
}
export function workspaceSelectionEqual(a, b) {
  return sameSelectionRefA1(a,b);
}
// Navigation and selection describe the workspace only. They never own or
// mutate a generated city, an editor definition, or a geometry history.
export function workspaceTransition(state, action) {
  switch (action.type) {
    case 'navigate':
      if (!WORKSPACE_SECTIONS.some(s => s.id === action.section)) throw new Error('Unknown workspace section.');
      return {
        ...state, section: action.section, toolsCollapsed: false
      };
    case 'tools':
      return {
        ...state, toolsCollapsed: action.collapsed
      };
    case 'pin':
      return {
        ...state, inspectorPinned: !state.inspectorPinned, inspectorCollapsed: false
      };
    case 'inspector':
      return {
        ...state, inspectorCollapsed: action.collapsed, inspectorPinned: !action.collapsed && !state.selection ? true : state.inspectorPinned
      };
    case 'road-selection-a1': {
      const set=makeSelectionSetA1(action.set.items,action.set.primary);
      if(set.items.some(ref=>!['road','junction'].includes(ref.kind)) ||
         (set.items.length>1 && set.items[0].kind!=='road')) throw Error('Invalid road selection.');
      // The legacy inspector only understands non-road singleton references.
      return {...state,selectionSet:set,selection:null};
    }
    case 'select': {
      const selection = action.selection;
      if (selection !== null && (!selection || typeof selection.kind !== 'string' || !selection.kind || selection.kind.length > 64 || typeof selection.id !== 'string' || !selection.id || selection.id.length > 128)) throw new Error('Invalid workspace selection.');
      const set=makeSelectionSetA1(selection?[selection]:[]);
      return {
        ...state,
        selectionSet:set,
        selection: selectionSingletonA1(set),
        inspectorCollapsed: selection && (!workspaceSelectionEqual(state.selection, selection) || action.reveal) ? false : state.inspectorCollapsed
      };
    }
    default:
      throw new Error('Unknown workspace action.');
  }
}
