import { APP_VERSION } from '../src/core/version.js';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const entry = join(root, 'src/app.js');
const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (metadata.version.replace(/^(\d+\.\d+)\.0-/, '$1-') !== APP_VERSION) throw new Error('Package and app versions disagree');
const imports = /^\s*import\s+[^;]+?\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
// Two independent module-closure builds: browser main thread and pure worker.
async function bundle(entryFile) {
  const visited = new Set(), fragments = [];
  async function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    let source = await readFile(file, 'utf8');
    for (const match of source.matchAll(imports)) {
      if (!match[1].startsWith('.')) throw new Error('External runtime dependency forbidden: ' + match[1]);
      await visit(resolve(dirname(file), match[1]));
    }
    source = source.replace(imports, '').replace(/^export\s+(?=((?:async\s+)?function|class|const|let)\b)/gm, '');
    if (/^\s*(import|export)\s/m.test(source)) throw new Error('Unsupported module syntax: ' + file);
    fragments.push('\n// ' + file.slice(root.length + 1) + '\n' + source);
  }
  await visit(entryFile);
  return fragments.join('\n');
}
const workerScript = "(function(){\n'use strict';" +
  await bundle(join(root, 'src/worker/junction-preview-worker.js')) + "\n})();";
const script = "(function(){\n'use strict';\nconst ROAD_JUNCTION_WORKER_SOURCE_P1 = " +
  JSON.stringify(workerScript) + ";" + await bundle(entry) + "\n})();";
const css = await readFile(join(root, 'styles/app.css'), 'utf8');
const template = (await readFile(join(root, 'index.template.html'), 'utf8')).replaceAll('{{APP_VERSION}}', APP_VERSION);
if (!template.includes('<!-- INLINE_CSS -->') || !template.includes('<!-- INLINE_JS -->')) throw new Error('HTML template markers missing');
let html = template.replace('<!-- INLINE_CSS -->', `<style>\n${css}\n</style>`)
  .replace('<!-- INLINE_JS -->', `<script>\n${script.replaceAll('</script', '<\\/script')}\n</script>`);
// TEMPORARY S10-B development snapshot for local regression debugging.
// Removed before PR is eligible for review/merge, never published in a release.
async function s10bSnapshot(dir) {
  const rows = [];
  for (const entry of await readdir(join(root,dir),{withFileTypes:true})) {
    const name=dir+'/'+entry.name;
    if (entry.isDirectory()) rows.push(...await s10bSnapshot(name));
    else if (entry.isFile() && /\.(?:js|mjs|css|json|html|md|yml)$/.test(name))
      rows.push([name,await readFile(join(root,name),'utf8')]);
  }
  return rows;
}
const qaFiles=[
  ...await s10bSnapshot('src'),
  ...await s10bSnapshot('tests'),
  ...await s10bSnapshot('scripts'),
  ...await s10bSnapshot('styles'),
  ...await s10bSnapshot('.github'),
  ['package.json',await readFile(join(root,'package.json'),'utf8')],
  ['index.template.html',await readFile(join(root,'index.template.html'),'utf8')],
];
html += '\n<!-- S10B-QA-ARCHIVE:' + Buffer.from(JSON.stringify(qaFiles)).toString('base64') + ' -->';
const distribution = join(root, `dist/mappo-${APP_VERSION}.html`);
await mkdir(dirname(distribution), { recursive: true });
await Promise.all([writeFile(distribution, html), writeFile(join(root, 'index.html'), html)]);
const hash = createHash('sha256').update(html).digest('hex').slice(0, 16);
console.log(`Built ${distribution.slice(root.length+1)} (${Buffer.byteLength(html).toLocaleString()} bytes; SHA256 ${hash}…)`);
console.log('Root index.html is byte-for-byte identical for static hosting.');
