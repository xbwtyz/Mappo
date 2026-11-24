// Existing editor hosts keep their controls and detailed diagnostic views.
// The same draft state drives their Apply button in every Inspector view.
export function syncDraftControls(engine, domain, draft, panel, apply) {
  const state = engine.sync(domain, draft);
  return renderDraftControls(state, panel, apply);
}

export function renderDraftControls(state, panel, apply) {
  panel.setAttribute('data-draft-state', state.status);
  panel.setAttribute('data-draft-dirty', String(state.dirty));
  if (apply) apply.disabled = !state.canApply;
  return state;
}
