import { IdentityEditor, identityRecord, identityChanges, customizedIdentityCounts, IDENTITY_USE_PRESETS } from '../core/identity.js';

import { renderBuildingUseOptions } from './building-use.js';

export class IdentityWorkspace {
  constructor({ drafts, getElement, shell, getCity, commit, historyMove = null, historyCan = null, canChangeBuildingUse = () => true, changed = () => {} }) {
    Object.assign(this, { draftEngine: drafts, $: getElement, shell, getCity, commit, historyMove, historyCan, canChangeBuildingUse, changed });
    this.editor = new IdentityEditor();
    this.drafts = new Map();
    this.mounted = null;
    this.rebuildAction = null;
    this.message = '';
  }
  key(ref) { return ref ? `${ref.kind}:${ref.id}` : ''; }
  ref() { return ['property', 'building'].includes(this.shell.state.selection?.kind) ? this.shell.state.selection : null; }
  fields() {
    const useChoice = this.$('identityUseInput').value;
    return {
      customName: this.$('identityNameInput').value,
      customUse: useChoice === 'other' ? this.$('identityOtherUseInput').value : useChoice,
      useChoice,
      ...(this.mounted?.kind === 'building' ? {
        buildingType: this.$('identityBuildingType').value,
        previousBuildingType: this.mounted.previousBuildingType
      } : {})
    };
  }
  pending(draft, record, ref) {
    try {
      if (draft.useChoice === 'other' && !draft.customUse.trim()) return true;
      return identityChanges(record, ref, draft).fields.length > 0;
    } catch { return true; }
  }
  stash() {
    const record = identityRecord(this.getCity(), this.mounted);
    if (!record) return;
    const draft = this.fields(), key = this.key(this.mounted);
    if (this.pending(draft, record, this.mounted)) this.drafts.set(key, draft);
    else this.drafts.delete(key);
  }
  hasPending() {
    this.stash();
    for (const [key, draft] of this.drafts) {
      const split = key.indexOf(':');
      const ref = { kind: key.slice(0, split), id: key.slice(split + 1) };
      const record = identityRecord(this.getCity(), ref);
      if (!record || !this.pending(draft, record, ref)) this.drafts.delete(key);
    }
    return this.drafts.size > 0;
  }
  showMessage(text, error = false) {
    this.message = text;
    this.$('identityStatus').textContent = text;
    this.$('identityStatus').classList.toggle('error', error);
  }
  render({ reload = false } = {}) {
    this.stash();
    const ref = this.ref(), record = identityRecord(this.getCity(), ref);
    this.$('identityInspector').hidden = !record;
    if (!record) { this.draftEngine?.close('identity'); this.mounted = null; return; }
    const building = ref.kind === 'building';
    this.$('identityBuildingTypeGroup').hidden = !building;
    if (building) renderBuildingUseOptions(this.$('identityBuildingType'), record.type, true);
    if (reload || this.key(ref) !== this.key(this.mounted)) {
      const draft = this.drafts.get(this.key(ref));
      const use = draft?.customUse ?? record.customUse ?? '';
      this.$('identityNameInput').value = draft?.customName ?? record.customName ?? '';
      this.$('identityUseInput').value = draft?.useChoice ?? (use && !IDENTITY_USE_PRESETS.includes(use) ? 'other' : use);
      this.$('identityOtherUseInput').value = use && !IDENTITY_USE_PRESETS.includes(use) ? use : '';
      this.mounted = { ...ref, previousBuildingType: draft?.previousBuildingType ?? record.type };
      this.$('identityBuildingType').value = draft?.buildingType ?? '';
      this.showMessage(draft ? 'Unapplied identity changes.' : 'Changes apply only to this ' + ref.kind + '.');
    }
    if (building && !this.$('identityBuildingType').value) this.mounted.previousBuildingType = record.type;
    this.$('identityEditorTitle').textContent = ref.kind === 'property' ? 'Edit property identity' : 'Edit building identity';
    this.$('identityOtherUseGroup').hidden = this.$('identityUseInput').value !== 'other';
    this.$('identityUndoButton').disabled = this.historyCan ? !this.historyCan('undo') : !this.editor.history.length;
    if(this.$('identityRedoButtonD01'))this.$('identityRedoButtonD01').disabled = !this.historyCan?.('redo');
    this.$('identityDraftState').textContent = this.syncDraft()?.dirty ? 'Unapplied changes' : 'Up to date';
    if (this.rebuildAction) this.updateRebuildWarning();
  }
  syncDraft(issues = []) {
    const ref = this.ref(), record = identityRecord(this.getCity(), ref), fields = this.fields();
    const dirty = Boolean(record && this.pending(fields, record, ref));
    const state = this.draftEngine?.sync('identity', { staged: true, key: this.key(ref),
      intent: JSON.stringify(fields), dirty: dirty || issues.length > 0, issues, target: ref });
    this.$('identityInspector').setAttribute('data-draft-state', state?.status ?? (dirty ? 'pending' : 'clean'));
    return state ?? { dirty };
  }
  apply() {
    this.syncDraft();
    return this.draftEngine ? this.draftEngine.apply('identity', current => current() && this.commitDraft(),
      { validateOnApply: true }) : this.commitDraft();
  }
  commitDraft() {
    try {
      const ref = this.ref();
      if (!ref || this.key(ref) !== this.key(this.mounted)) throw new Error('Select the property or building again before applying.');
      const input = this.fields();
      if (input.useChoice === 'other' && !input.customUse.trim()) throw new Error('Enter a descriptive use for Other, or choose no override.');
      const city = this.getCity();
      const record = identityRecord(city, ref);
      const typeChanged = Boolean(input.buildingType && input.buildingType !== record?.type);
      if (typeChanged && !this.canChangeBuildingUse())
        throw new Error('Finish or cancel the active map edit before applying building use.');
      const fields = identityChanges(record, ref, input).fields;
      const next = this.editor.apply(city, ref, input);
      if(this.historyMove)this.editor.reset(); // canonical ledger handles accepted Undo/Redo
      this.drafts.delete(this.key(ref));
      this.mounted = null;
      this.commit(next, { ref, fields });
      this.render({ reload: true });
      this.showMessage(typeChanged ? 'Building use applied.' : 'Identity applied.');
      for (const id of ['identityNameInput', 'identityOtherUseInput']) this.$(id).setAttribute('aria-invalid', 'false');
      this.changed();
      return true;
    } catch (error) {
      this.syncDraft([{ code: 'identity-edit', message: error.message }]);
      this.showMessage(error.message, true);
      this.$('identityNameInput').setAttribute('aria-invalid', String(/name/i.test(error.message)));
      this.$('identityOtherUseInput').setAttribute('aria-invalid', String(/use|Other/i.test(error.message)));
      return false;
    }
  }
  undo() {
    if(this.historyMove)return this.historyMove('undo');
    try {
      this.stash();
      const entry = this.editor.history.at(-1);
      if (entry?.fields.includes('type') && !this.canChangeBuildingUse())
        throw new Error('Finish or cancel the active map edit before undoing building use.');
      const target = entry?.ref;
      const next = this.editor.undo(this.getCity());
      // Undo affects accepted identity only; preserve independently pending fields.
      this.mounted = null;
      this.commit(next);
      this.render({ reload: true });
      this.showMessage(`Identity edit undone for ${target.kind} ${target.id}. Other editor histories are unchanged.`);
      this.changed();
      return true;
    } catch (error) { this.showMessage(error.message, true); return false; }
  }
  discard() {
    const ref = this.ref();
    this.drafts.delete(this.key(ref));
    this.mounted = null;
    this.render({ reload: true });
    this.showMessage('Unapplied identity changes discarded.');
    this.changed();
  }
  updateRebuildWarning() {
    const counts = customizedIdentityCounts(this.getCity());
    this.$('identityRebuildMessage').textContent = `Rebuilding replaces customized properties (${counts.properties}) and buildings (${counts.buildings}). Their names and descriptive uses, plus pending identity drafts (${this.drafts.size}), will be discarded. Keep editing to apply drafts and download a project copy before rebuilding.`;
  }
  requestRebuild(action) {
    const counts = customizedIdentityCounts(this.getCity());
    if (!this.hasPending() && !counts.properties && !counts.buildings) return action();
    this.rebuildAction = action;
    this.updateRebuildWarning();
    this.$('identityRebuildWarning').hidden = false;
    this.$('identityCancelRebuildButton').focus?.();
    return false;
  }
  reset() {
    this.editor.reset(); this.drafts.clear(); this.mounted = null; this.rebuildAction = null;
    this.$('identityRebuildWarning').hidden = true;
    this.$('identityInspector').hidden = true;
  }
  bind() {
    for (const id of ['identityNameInput', 'identityUseInput', 'identityOtherUseInput', 'identityBuildingType'])
      for (const event of ['input', 'change']) this.$(id).addEventListener(event, () => {
        this.stash(); this.render(); this.showMessage('Unapplied identity changes. Choose Apply identity to save them.'); this.changed();
      });
    this.$('identityApplyButton').addEventListener('click', () => this.apply());
    this.$('identityDiscardButton').addEventListener('click', () =>
      this.draftEngine ? this.draftEngine.cancel('identity', () => this.discard()) : this.discard());
    this.$('identityUndoButton').addEventListener('click', () => this.undo());
    this.$('identityRedoButtonD01')?.addEventListener('click', () => this.historyMove?.('redo'));
    this.$('identityCancelRebuildButton').addEventListener('click', () => {
      this.rebuildAction = null; this.$('identityRebuildWarning').hidden = true;
    });
    this.$('identityConfirmRebuildButton').addEventListener('click', () => {
      const action = this.rebuildAction;
      this.rebuildAction = null; this.$('identityRebuildWarning').hidden = true;
      if (action) action();
    });
  }
}
