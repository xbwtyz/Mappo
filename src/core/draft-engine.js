const INACTIVE = Object.freeze({ status: 'inactive', dirty: false, canApply: false, diagnostics: Object.freeze([]) });
const SEVERITIES = new Set(['blocker', 'decision', 'warning', 'info']);
const ISSUE_TARGET_KINDS = Object.freeze({ building: 'building', collision: 'building', neighbor: 'property',
  property: 'property', frontage: 'road', access: 'road', setback: 'road', block: 'block', plot: 'plot' });

export function draftDiagnostic(domain, issue, sourceRevision, fallbackTarget) {
  const { code, message, severity, target, related, remedy, kind, id } = issue;
  return Object.freeze({
    code, domain, message,
    severity: SEVERITIES.has(severity) ? severity : 'blocker',
    target: target ?? (id || issue.targetId ? { kind: kind ?? ISSUE_TARGET_KINDS[code], id: id ?? issue.targetId } : fallbackTarget),
    related: related ?? issue.relatedIds ?? (issue.blockerId ? [{ id: issue.blockerId }] : undefined),
    remedy, sourceRevision,
  });
}

// Runtime only. Domain editors supply draft intent and validation evidence and
// prepare their accepted transactions. This engine owns which revision can Apply.
export class DraftEngine {
  #sessions = new Map();
  #interactive = null;
  #nextSession = 0;
  #getProject;

  constructor(getProject) {
    this.#getProject = getProject;
  }

  sync(domain, { active = true, staged = false, baseline, key, intent,
    dirty = false, checking = false, ready = false, stale = false, issues = [], target, candidate, validatedIntent = intent } = {}) {
    if (!active) {
      this.close(domain);
      return INACTIVE;
    }
    if (!staged && this.#interactive && this.#interactive !== domain) return INACTIVE;
    if (!staged) this.#interactive = domain;
    let session = this.#sessions.get(domain);
    const sameSession = session && session.key === key;
    const accepted = baseline ?? (sameSession && !staged ? session.baseline : this.#getProject());
    if (!sameSession || session.baseline !== accepted) {
      session = { id: ++this.#nextSession, key, baseline: accepted, revision: 0 };
      this.#sessions.set(domain, session);
    }
    if (session.intent !== intent || session.dirty !== Boolean(dirty)) {
      session.intent = intent;
      session.revision++;
      session.applying = null;
      session.candidate = undefined;
      session.rejectedIssues = undefined;
    }
    session.dirty = Boolean(dirty);
    session.checking = checking;
    session.validationRevision = ready && !checking && validatedIntent === intent ? session.revision : null;
    session.stale = stale;
    session.target = target;
    session.diagnostics = Object.freeze((session.rejectedIssues ?? issues)
      .map(issue => draftDiagnostic(domain, issue, session.revision, target)));
    if (session.validationRevision === null || stale) session.candidate = undefined;
    else if (candidate !== undefined) session.candidate = candidate;
    return this.read(domain);
  }

  read(domain) {
    const session = this.#sessions.get(domain);
    if (!session) return INACTIVE;
    const stale = session.stale || session.baseline !== this.#getProject();
    const blocked = session.diagnostics.some(issue => issue.severity === 'blocker' || issue.severity === 'decision');
    const status = stale ? 'stale' : session.applying ? 'applying' : session.checking ? 'checking'
      : !session.dirty ? 'clean' : blocked ? 'blocked' : session.validationRevision === session.revision ? 'valid' : 'pending';
    return Object.freeze({ status, dirty: session.dirty, canApply: status === 'valid',
      diagnostics: session.diagnostics, session: session.id, revision: session.revision,
      validationRevision: session.validationRevision,
      candidate: status === 'valid' ? session.candidate : undefined });
  }

  interactive() {
    return this.#interactive === null ? INACTIVE : this.read(this.#interactive);
  }

  isCurrent(domain, token) {
    const session = this.#sessions.get(domain);
    return Boolean(token && session && token.session === session.id && token.revision === session.revision &&
      session.baseline === this.#getProject() && !session.stale);
  }

  reject(domain, issues = []) {
    const session = this.#sessions.get(domain);
    if (!session || !issues.length) return;
    session.rejectedIssues = issues;
    session.diagnostics = Object.freeze(issues.map(issue => draftDiagnostic(domain, issue, session.revision, session.target)));
  }

  close(domain) {
    this.#sessions.delete(domain);
    if (this.#interactive === domain) this.#interactive = null;
  }

  clear() {
    this.#sessions.clear();
    this.#interactive = null;
  }

  canLeave(domain, confirm) {
    const draft = this.read(domain);
    return draft.status !== 'applying' && (!draft.dirty || confirm());
  }

  reset(domain, reset) {
    if (this.read(domain).status === 'applying') return false;
    this.close(domain);
    return reset();
  }

  cancel(domain, cancel, confirm = () => true) {
    return this.canLeave(domain, confirm) ? this.reset(domain, cancel) : false;
  }

  apply(domain, accept, { validateOnApply = false, onChange = () => {} } = {}) {
    const draft = this.read(domain);
    if (!draft.canApply && !(validateOnApply && ['pending', 'clean'].includes(draft.status))) return false;
    const session = this.#sessions.get(domain);
    const token = Object.freeze({ session: draft.session, revision: draft.revision });
    const current = () => this.isCurrent(domain, token) && session.applying === token;
    session.applying = token;
    const finish = () => {
      if (session.applying !== token) return;
      session.applying = null;
      onChange();
    };
    try {
      const result = accept(current, draft);
      if (result?.then) {
        onChange();
        return Promise.resolve(result).finally(finish);
      }
      finish();
      return result;
    } catch (error) {
      finish();
      throw error;
    }
  }
}
