import { IdentityEditor, identityRecord, identitySnapshot, customizedIdentityCounts, IDENTITY_USE_PRESETS, normalizeIdentity } from '../core/identity.js';

export class IdentityWorkspace {
  constructor({ getElement, shell, getCity, commit, changed = () => {} }) {
    Object.assign(this, { $: getElement, shell, getCity, commit, changed });
    this.editor = new IdentityEditor();
    this.drafts = new Map();
    this.mounted = null;
    this.rebuildAction = null;
    this.message = '';
  }
  key(ref) { return ref ? `${ref.kind}:${ref.id}` : ''; }
  ref() { return ['property', 'building'].includes(this.shell.state.selection?.kind) ? this.shell.state.selection : null; }
  fields() {
    return { customName: this.$('identityNameInput').value,
      customUse: this.$('identityUseInput').value === 'other' ? this.$('identityOtherUseInput').value : this.$('identityUseInput').value,
      useChoice: this.$('identityUseInput').value };
  }
  pending(draft, record) {
    try {
      if (draft.useChoice === 'other' && !draft.customUse.trim()) return true;
      return JSON.stringify(normalizeIdentity(draft)) !== JSON.stringify(normalizeIdentity(identitySnapshot(record)));
    } catch { return true; }
  }
  stash() {
    const record = identityRecord(this.getCity(), this.mounted);
    if (!record) return;
    const draft = this.fields(), key = this.key(this.mounted);
    if (this.pending(draft, record)) this.drafts.set(key, draft);
    else this.drafts.delete(key);
  }
  hasPending() {
    this.stash();
    for (const [key, draft] of this.drafts) {
      const split = key.indexOf(':');
      const record = identityRecord(this.getCity(), { kind: key.slice(0, split), id: key.slice(split + 1) });
      if (!record || !this.pending(draft, record)) this.drafts.delete(key);
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
    if (!record) { this.mounted = null; return; }
    if (reload || this.key(ref) !== this.key(this.mounted)) {
      const draft = this.drafts.get(this.key(ref));
      const use = draft?.customUse ?? record.customUse ?? '';
      this.$('identityNameInput').value = draft?.customName ?? record.customName ?? '';
      this.$('identityUseInput').value = draft?.useChoice ?? (use && !IDENTITY_USE_PRESETS.includes(use) ? 'other' : use);
      this.$('identityOtherUseInput').value = use && !IDENTITY_USE_PRESETS.includes(use) ? use : '';
      this.mounted = { ...ref };
      this.showMessage(draft ? 'Unapplied identity changes.' : 'Changes apply only to this ' + ref.kind + '.');
    }
    this.$('identityEditorTitle').textContent = ref.kind === 'property' ? 'Edit property identity' : 'Edit building identity';
    this.$('identityOtherUseGroup').hidden = this.$('identityUseInput').value !== 'other';
    this.$('identityUndoButton').disabled = !this.editor.history.length;
    this.$('identityDraftState').textContent = this.pending(this.fields(), record) ? 'Unapplied changes' : 'Up to date';
    if (this.rebuildAction) this.updateRebuildWarning();
  }
  apply() {
    try {
      const ref = this.ref();
      if (!ref || this.key(ref) !== this.key(this.mounted)) throw new Error('Select the property or building again before applying.');
      const input = this.fields();
      if (input.useChoice === 'other' && !input.customUse.trim()) throw new Error('Enter a descriptive use for Other, or choose no override.');
      const next = this.editor.apply(this.getCity(), ref, input);
      this.drafts.delete(this.key(ref));
      this.mounted = null;
      this.commit(next);
      this.render({ reload: true });
      this.showMessage('Identity applied. Generated data and geometry are unchanged.');
      for (const id of ['identityNameInput', 'identityOtherUseInput']) this.$(id).setAttribute('aria-invalid', 'false');
      this.changed();
      return true;
    } catch (error) {
      this.showMessage(error.message, true);
      this.$('identityNameInput').setAttribute('aria-invalid', String(/name/i.test(error.message)));
      this.$('identityOtherUseInput').setAttribute('aria-invalid', String(/use|Other/i.test(error.message)));
      return false;
    }
  }
  undo() {
    try {
      this.stash();
      const target = this.editor.history.at(-1)?.ref;
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
    for (const id of ['identityNameInput', 'identityUseInput', 'identityOtherUseInput'])
      for (const event of ['input', 'change']) this.$(id).addEventListener(event, () => {
        this.stash(); this.render(); this.showMessage('Unapplied identity changes. Choose Apply identity to save them.'); this.changed();
      });
    this.$('identityApplyButton').addEventListener('click', () => this.apply());
    this.$('identityDiscardButton').addEventListener('click', () => this.discard());
    this.$('identityUndoButton').addEventListener('click', () => this.undo());
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
