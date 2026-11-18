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
    selection: null
  };
}
export function workspaceInspectorVisible(state) {
  return !state.inspectorCollapsed && (state.inspectorPinned || state.selection !== null);
}
export function workspaceSelectionEqual(a, b) {
  return a === b || Boolean(a && b && a.kind === b.kind && a.id === b.id);
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
    case 'select': {
      const selection = action.selection;
      if (selection !== null && (!selection || typeof selection.kind !== 'string' || !selection.kind || selection.kind.length > 64 || typeof selection.id !== 'string' || !selection.id || selection.id.length > 128)) throw new Error('Invalid workspace selection.');
      return {
        ...state,
        selection: selection ? {
          kind: selection.kind,
          id: selection.id
        } : null,
        inspectorCollapsed: selection && (!workspaceSelectionEqual(state.selection, selection) || action.reveal) ? false : state.inspectorCollapsed
      };
    }
    default:
      throw new Error('Unknown workspace action.');
  }
}
