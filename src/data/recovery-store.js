import {
  decodeProjectDocument,
  encodeProjectDocument
} from './project-format.js';

const STORAGE_KEY = 'mappo:recovery:v1';
const DB_NAME = 'mappo-project-recovery';
const STORE_NAME = 'snapshots';
export const RECOVERY_CONFLICT = 'Another Mappo tab changed recovery. Download your project to keep it, then reload this page.';

function recoveryContent(document) {
  const { savedAt, appVersion, ...content } = document;
  return JSON.stringify(content);
}

function nextRecoveryState(previous, text, expectedToken, known, content) {
  if ((previous?.token ?? null) !== expectedToken) throw new Error(RECOVERY_CONFLICT);
  let current = null,
    backup = previous?.backup ?? null;
  if (known && previous?.current === known.text) {
    current = known.text;
  } else if (previous?.current) {
    try {
      decodeProjectDocument(previous.current);
      current = previous.current;
    } catch (error) {
      if (/newer|unsupported/i.test(error.message)) throw new Error('Recovery belongs to an unsupported or newer Mappo build. It has been preserved. Download this project to keep your current work.');
    }
  }
  if (current) {
    const before = current === known?.text ? known.content : recoveryContent(JSON.parse(current));
    const after = content ?? recoveryContent(JSON.parse(text));
    if (before === after) return previous;
  }
  return {
    token: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    current: text,
    backup: current || backup
  };
}

export class RecoveryStore {
  #knownCurrent = null;

  constructor(adapter) {
    this.adapter = adapter;
    this.token = null;
    this.queue = Promise.resolve();
    this.initialized = false;
  }
  async read() {
    const state = await this.adapter.read();
    this.token = state?.token ?? null;
    this.initialized = true;
    return {
      current: state?.current ?? null,
      backup: state?.backup ?? null
    };
  }
  save(text) {
    return this.#save(text);
  }
  async saveDocument(document) {
    const text = encodeProjectDocument(document);
    const state = await this.#save(text, recoveryContent(document));
    return { text, state };
  }
  #save(text, content) {
    const operation = this.queue.catch(() => {}).then(async () => {
      if (!this.initialized) await this.read();
      const state = await this.adapter.update(previous =>
        nextRecoveryState(previous, text, this.token, this.#knownCurrent, content));
      this.token = state.token;
      // Remember only exact bytes produced by the encoder and committed by storage.
      if (content !== undefined && state.current === text) this.#knownCurrent = { text, content };
      else if (this.#knownCurrent?.text !== state.current) this.#knownCurrent = null;
      return state;
    });
    this.queue = operation;
    return operation;
  }
}

export function localStorageRecoveryAdapter(storage) {
  const read = () => {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('Browser recovery storage is unreadable. Download your project and use a fresh browser storage location.');
    }
  };
  return {
    label: 'browser storage',
    async read() {
      return read();
    },
    async update(transform) {
      const next = transform(read());
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    }
  };
}

export function indexedDbRecoveryAdapter(indexedDB) {
  let connection;

  function connect() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onerror = () => reject(request.error || new Error('Browser recovery database could not open.'));
      request.onblocked = () => reject(new Error('Close other Mappo tabs to upgrade browser recovery.'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });
    return connection;
  }
  async function transaction(write, transform) {
    const db = await connect();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, write ? 'readwrite' : 'readonly'),
        store = tx.objectStore(STORE_NAME);
      let result, problem;
      tx.oncomplete = () => resolve(result ?? null);
      tx.onabort = () => reject(problem || tx.error || new Error('Browser recovery transaction was not completed.'));
      tx.onerror = () => {};
      const request = store.get('workspace');
      request.onsuccess = () => {
        try {
          result = write ? transform(request.result ?? null) : request.result ?? null;
          if (write) store.put(result, 'workspace');
        } catch (error) {
          problem = error;
          tx.abort();
        }
      };
    });
  }
  return {
    label: 'browser database',
    read: () => transaction(false),
    update: transform => transaction(true, transform)
  };
}

export async function openBrowserRecovery(environment = globalThis) {
  try {
    if (environment.indexedDB) {
      const adapter = indexedDbRecoveryAdapter(environment.indexedDB);
      await adapter.read();
      return new RecoveryStore(adapter);
    }
  } catch {
    /* file:// storage policies can prohibit IndexedDB. Try atomic localStorage writes. */ }
  let storage;
  try {
    storage = environment.localStorage;
  } catch {}
  if (!storage) throw new Error('Browser recovery is unavailable here. Use Download project to keep your work.');
  const adapter = localStorageRecoveryAdapter(storage);
  await adapter.read();
  return new RecoveryStore(adapter);
}
