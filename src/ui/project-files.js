import {
  createProjectDocument,
  encodeProjectDocument,
  decodeProjectDocument,
  projectFilename
} from '../data/project-format.js';
import { exportFilename4F } from '../core/export-filenames-4f.js';
import {
  openBrowserRecovery
} from '../data/recovery-store.js';
import {
  readProjectFile,
  downloadProjectText
} from '../data/file-io.js';

export class ProjectFiles {
  constructor({
    getElement,
    capture,
    apply,
    openRecovery = openBrowserRecovery,
    download = downloadProjectText,
    clock = () => new Date().toISOString(),
    delay = 800,
    timers = globalThis,
    onStatus = () => {}
  }) {
    this.$ = getElement;
    this.capture = capture;
    this.apply = apply;
    this.openRecovery = openRecovery;
    this.download = download;
    this.clock = clock;
    this.delay = delay;
    this.timers = timers;
    this.onStatus = onStatus;
    this.base = null;
    this.store = null;
    this.timer = null;
    this.ready = false;
    this.suspended = false;
    this.revision = 0;
    this.recoveredRevision = -1;
    this.downloadRevision = -1;
    this.pending = null;
    this.importSequence = 0;
    this.busy = false;
    this.writeQueue = Promise.resolve();
    this.lastError = null;
    this.applying = false;
    this.opening = false;
  }
  status(message, error = false) {
    this.$('fileStatus').textContent = message;
    this.$('fileStatus').classList.toggle('error', error);
    this.onStatus({
      message,
      error,
      pending: this.pending,
      recovery: this.suspended && !this.$('recoveryChoice').hidden
    });
  }
  captureDocument() {
    const state = this.capture();
    const document = createProjectDocument(state.project, state.workspace, this.base, this.clock());
    if (!this.base) this.base = document;
    return document;
  }
  changed() {
    if (this.applying) return;
    this.revision++;
    if (!this.ready || this.suspended) return;
    if (!this.store) {
      this.status('Changes in this page — download a project copy.', true);
      return;
    }
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.flush().catch(() => {});
    }, this.delay);
    this.status(this.store ? 'Changes pending browser recovery…' : 'Changes in this page — download a project copy.', !this.store);
  }
  get needsUnloadWarning() {
    return this.revision > 0 && this.revision > this.downloadRevision && this.revision > this.recoveredRevision;
  }
  async start() {
    try {
      this.store = await this.openRecovery();
      const stored = await this.store.read();
      let recoverable = 0;
      for (const [key, label] of [
          ['current', 'Latest recovery'],
          ['backup', 'Previous recovery']
        ]) {
        const button = this.$(key === 'current' ? 'restoreRecoveryButton' : 'restoreBackupButton');
        button.disabled = true;
        if (stored[key]) {
          try {
            const doc = decodeProjectDocument(stored[key]);
            this[key + 'Recovery'] = doc;
            button.disabled = false;
            button.textContent = `${label}: ${doc.project.city.name}`;
            recoverable++;
          } catch (error) {
            this.status(`${label} could not be read: ${error.message}`, true);
          }
        }
      }
      this.ready = true;
      if (recoverable) {
        this.suspended = true;
        this.$('recoveryChoice').hidden = false;
        this.status('A recovery copy is available. Restore it or keep this city to resume recovery saving.');
      } else {
        this.status('Browser recovery ready. Download project for a portable copy.');
        this.changed();
      }
    } catch (error) {
      this.ready = true;
      this.lastError = error;
      this.status(error.message, true);
    }
  }
  flush() {
    if (!this.ready || this.suspended || !this.store) return Promise.reject(new Error('Browser recovery is not currently available.'));
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
    const operation = this.writeQueue.catch(() => {}).then(async () => {
      const revision = this.revision,
        document = this.captureDocument(),
        text = encodeProjectDocument(document);
      const savedState = await this.store.save(text);
      this.base = document;
      this.recoveredRevision = revision;
      this.lastError = null;
      if (savedState.backup) {
        try {
          this.backupRecovery = decodeProjectDocument(savedState.backup);
          this.$('restoreBackupButton').disabled = false;
        } catch {}
      }
      this.currentRecovery = document;
      this.$('restoreRecoveryButton').disabled = false;
      if (this.revision === revision) this.status(`Recovery saved in this browser at ${new Date(document.savedAt).toLocaleTimeString()}. Download a portable copy when you want to keep a version.`);
      return document;
    }).catch(error => {
      this.lastError = error;
      this.status(`Recovery failed: ${error.message} Download project to keep this version.`, true);
      throw error;
    });
    this.writeQueue = operation;
    return operation;
  }
  keepCurrent() {
    this.suspended = false;
    this.$('recoveryChoice').hidden = true;
    this.changed();
  }
  async saveDownload() {
    try {
      await this.writeQueue.catch(() => {});
      const revision = this.revision,
        document = this.captureDocument(),
        text = encodeProjectDocument(document);
      const name=exportFilename4F(this.$('exportFilename4F')?.value,projectFilename(document),'project');
      await this.download(text, name);
      this.base = document;
      this.downloadRevision = revision;
      this.status('Project download requested. Keep the .mappo.json file to reopen this exact city in another build.');
      return document;
    } catch (error) {
      this.status(`Download failed: ${error.message}`, true);
      return null;
    }
  }
  async stageFile(file) {
    if (this.opening) {
      this.status('A project is opening. Please wait before choosing another file.');
      return;
    }
    this.pending = null;
    this.$('loadPreview').hidden = true;
    const sequence = ++this.importSequence;
    this.busy = true;
    try {
      const text = await readProjectFile(file),
        document = decodeProjectDocument(text);
      if (sequence !== this.importSequence) return;
      this.stageDocument(document, 'file');
    } catch (error) {
      if (sequence === this.importSequence) this.status(`Could not open project: ${error.message}`, true);
    } finally {
      if (sequence === this.importSequence) this.busy = false;
    }
  }
  stageDocument(document, source) {
    if (this.opening) return;
    if (source !== 'file') {
      this.importSequence++;
      this.busy = false;
    }
    this.pending = {
      document,
      source
    };
    this.$('loadPreview').hidden = false;
    const project = document.project;
    this.$('loadSummary').textContent = `${project.city.name} · ${project.city.buildings.length} buildings · saved ${new Date(document.savedAt).toLocaleString()}${document.workspace.editor.dirty?' · includes unfinished edits':''}. Opening replaces the current workspace; download it first if you want a separate copy.`;
    this.status('Project validated. Review it, then choose Open project.');
  }
  cancelLoad() {
    if (this.opening) return;
    this.busy = false;
    this.importSequence++;
    this.pending = null;
    this.$('loadPreview').hidden = true;
    this.status('Open cancelled. Current city retained.');
  }
  async openPending() {
    if (!this.pending || this.busy) return false;
    const selected = this.pending;
    this.busy = true;
    this.opening = true;
    let outgoing, oldBase = this.base;
    try {
      outgoing = this.captureDocument();
      // Make a best-effort recovery of the outgoing workspace before replacing it.
      if (this.store && !this.suspended) {
        try {
          await this.flush();
        } catch {}
      }
      // Re-validate the immutable staged payload immediately before applying.
      const document = decodeProjectDocument(encodeProjectDocument(selected.document));
      this.suspended = true;
      this.applying = true;
      this.apply(document);
      this.applying = false;
      this.base = document;
      this.pending = null;
      this.$('loadPreview').hidden = true;
      this.$('recoveryChoice').hidden = true;
      this.revision++;
      this.downloadRevision = selected.source === 'file' ? this.revision : -1;
      this.recoveredRevision = -1;
      this.suspended = false;
      this.ready = true;
      // Report project-open completion after recovery settles, so autosave cannot
      // immediately replace the confirmation shown to the user.
      let recoveryError = null;
      if (this.store) {
        try {
          await this.flush();
        } catch (error) {
          recoveryError = error;
        }
      }
      const recoveryDetail = recoveryError
        ? ` Browser recovery failed: ${recoveryError.message} Download a portable copy to preserve this project.`
        : this.store ? ' Browser recovery updated.' : ' Download a portable copy to preserve this project.';
      this.status(`Opened ${document.project.city.name}. Saved geometry restored without regeneration.${recoveryDetail}`, Boolean(recoveryError));
      return true;
    } catch (error) {
      try {
        if (outgoing) {
          this.applying = true;
          this.apply(outgoing);
          this.base = oldBase;
        }
      } catch {}
      this.status(`Could not apply project: ${error.message} Current city retained.`, true);
      return false;
    } finally {
      this.applying = false;
      this.opening = false;
      this.suspended = false;
      this.busy = false;
    }
  }
  bind() {
    this.$('saveProjectButton').addEventListener('click', () => this.saveDownload());
    this.$('loadProjectButton').addEventListener('click', () => this.$('projectFileInput').click());
    this.$('projectFileInput').addEventListener('change', event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) this.stageFile(file);
    });
    this.$('openProjectButton').addEventListener('click', () => this.openPending());
    this.$('cancelLoadButton').addEventListener('click', () => this.cancelLoad());
    this.$('restoreRecoveryButton').addEventListener('click', () => {
      if (this.currentRecovery) this.stageDocument(this.currentRecovery, 'recovery');
    });
    this.$('restoreBackupButton').addEventListener('click', () => {
      if (this.backupRecovery) this.stageDocument(this.backupRecovery, 'recovery');
    });
    this.$('keepCurrentButton').addEventListener('click', () => this.keepCurrent());
  }
}
