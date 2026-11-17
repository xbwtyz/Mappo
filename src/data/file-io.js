import {
  MAX_PROJECT_BYTES
} from './project-validation.js';

export async function readProjectFile(file) {
  if (!file) throw new Error('Choose a project file first.');
  if (!Number.isFinite(file.size) || file.size > MAX_PROJECT_BYTES) throw new Error('Choose a project file smaller than 20 MiB.');
  return file.text();
}
export function downloadProjectText(text, filename, environment = globalThis) {
  const blob = new environment.Blob([text], {
    type: 'application/json;charset=utf-8'
  });
  const url = environment.URL.createObjectURL(blob),
    link = environment.document.createElement('a');
  link.href = url;
  link.download = filename;
  try {
    environment.document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    environment.setTimeout(() => environment.URL.revokeObjectURL(url), 30000);
  }
}
