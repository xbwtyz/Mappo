import {
  CURRENT_FORMAT_VERSION,
  CURRENT_APP_VERSION,
  migrateProjectData
} from './migrations.js';
import {
  MAX_PROJECT_BYTES,
  validateJsonTree,
  validateStoredProject,
  validateWorkspace,
  requireRecord,
  requireText
} from './project-validation.js';
import {
  boundsOf
} from '../core/geometry.js';

export const PROJECT_FORMAT = 'mappo-project';
export function copyJson(value) {
  return JSON.parse(JSON.stringify(value));
}
export function utf8Size(text) {
  return new TextEncoder().encode(text).byteLength;
}
export function newDocumentId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `mappo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
export function defaultWorkspace(project) {
  const bounds = boundsOf(project.city.survey.boundary);
  return {
    schemaVersion: 1,
    editor: {
      boundary: copyJson(project.city.survey.boundary),
      center: copyJson(project.options.center),
      closed: true,
      dirty: false,
      history: [],
      mode: 'pan'
    },
    controls: {
      seed: project.seed,
      size: project.options.size,
      morphology: project.options.morphology,
      preset: project.options.morphology
    },
    view: {
      camera: {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
        zoom: 1
      },
      layers: {
        buildings: true,
        properties: false,
        plots: false,
        districtColors: project.city.districtState?.status === 'assigned',
        districtBorders: project.city.districtState?.status === 'assigned',
        districtLabels: project.city.districtState?.status === 'assigned'
      },
      fitOnLoad: true
    }
  };
}
export function createProjectDocument(project, workspace = defaultWorkspace(project), base = null, now = new Date().toISOString()) {
  const document = base ? copyJson(base) : {
    format: PROJECT_FORMAT,
    formatVersion: CURRENT_FORMAT_VERSION,
    documentId: newDocumentId(),
    createdAt: now,
    extensions: {}
  };
  document.appVersion = CURRENT_APP_VERSION;
  document.savedAt = now;
  document.project = copyJson(project);
  // Preserve opaque future workspace fields while replacing known state.
  const previous = document.workspace || {};
  document.workspace = {
    ...previous,
    ...copyJson(workspace),
    editor: {
      ...(previous.editor || {}),
      ...copyJson(workspace.editor)
    },
    controls: {
      ...(previous.controls || {}),
      ...copyJson(workspace.controls)
    },
    districtEditor: {
      ...(previous.districtEditor || {}),
      ...(copyJson(workspace.districtEditor || {})),
      ...((workspace.districtEditor?.controls !== undefined || previous.districtEditor?.controls !== undefined) ? {
        controls: {
          ...(previous.districtEditor?.controls || {}),
          ...(copyJson(workspace.districtEditor?.controls || {}))
        }
      } : {})
    },
    view: {
      ...(previous.view || {}),
      ...copyJson(workspace.view),
      camera: {
        ...(previous.view?.camera || {}),
        ...copyJson(workspace.view.camera)
      },
      layers: {
        ...(previous.view?.layers || {}),
        ...copyJson(workspace.view.layers)
      }
    }
  };
  if (workspace.districtEditor === undefined && previous.districtEditor === undefined) delete document.workspace.districtEditor;
  return document;
}

function validateDocument(document) {
  requireRecord(document, 'Project file');
  if (document.format !== PROJECT_FORMAT) throw new Error('This is not a Mappo project file.');
  if (document.formatVersion !== CURRENT_FORMAT_VERSION) throw new Error('This file uses an unsupported save format. Open it in a newer Mappo build.');
  requireText(document.documentId, 'Document ID', 200);
  requireText(document.appVersion, 'Saving app version', 100);
  for (const key of ['createdAt', 'savedAt'])
    if (typeof document[key] !== 'string' || !Number.isFinite(Date.parse(document[key]))) throw new Error(`Invalid ${key} timestamp.`);
  validateStoredProject(document.project);
  validateWorkspace(document.workspace, document.project);
  if (document.extensions !== undefined) requireRecord(document.extensions, 'Extensions');
  return document;
}
export function encodeProjectDocument(document) {
  validateJsonTree(document);
  validateDocument(document);
  const text = JSON.stringify(document);
  if (utf8Size(text) > MAX_PROJECT_BYTES) throw new Error('Project exceeds this build’s 20 MiB file limit.');
  return text;
}
export function decodeProjectDocument(text) {
  if (typeof text !== 'string') throw new Error('The project file could not be read as text.');
  if (utf8Size(text) > MAX_PROJECT_BYTES) throw new Error('This project is larger than the 20 MiB limit.');
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (clean.startsWith('<')) throw new Error('Choose a .mappo.json project file, not the standalone HTML app.');
  let document;
  try {
    document = JSON.parse(clean);
  } catch {
    throw new Error('The file is incomplete or is not valid JSON. Your current city has not been changed.');
  }
  validateJsonTree(document);
  if (document && document.format === undefined && document.city && document.schemaVersion) {
    const project = migrateProjectData(document);
    document = createProjectDocument(project);
  } else {
    requireRecord(document, 'Project file');
    if (document.format !== PROJECT_FORMAT) throw new Error('This is not a Mappo project file.');
    if (document.formatVersion !== CURRENT_FORMAT_VERSION) throw new Error('This file uses a newer or unsupported save format. Use a compatible Mappo build.');
    document.project = migrateProjectData(document.project);
  }
  return validateDocument(document);
}
export function projectFilename(document) {
  const name = document.project.city.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'mappo-city';
  return `${name}-${new Date(document.savedAt).toISOString().slice(0,10)}.mappo.json`;
}
