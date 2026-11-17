import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const entry = join(root, 'src/app.js');
const imports = /^\s*import\s+[^;\n]+\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
const visited = new Set();
const fragments = [];

async function visit(file) {
  if (visited.has(file)) return;
  visited.add(file);
  let source = await readFile(file, 'utf8');
  for (const match of source.matchAll(imports)) {
    if (!match[1].startsWith('.')) throw new Error(`External runtime dependency forbidden: ${match[1]}`);
    await visit(resolve(dirname(file), match[1]));
  }
  source = source.replace(imports, '').replace(/^export\s+(?=(function|class|const|let)\b)/gm, '');
  if (/^\s*(import|export)\s/m.test(source)) throw new Error(`Unsupported module syntax: ${file}`);
  fragments.push(`\n// ${file.slice(root.length + 1)}\n${source}`);
}

await visit(entry);
const script = `(function(){\n'use strict';${fragments.join('\n')}\n})();`;
const css = await readFile(join(root, 'styles/app.css'), 'utf8');
const template = await readFile(join(root, 'index.template.html'), 'utf8');
if (!template.includes('<!-- INLINE_CSS -->') || !template.includes('<!-- INLINE_JS -->')) throw new Error('HTML template markers missing');
const html = template.replace('<!-- INLINE_CSS -->', `<style>\n${css}\n</style>`)
  .replace('<!-- INLINE_JS -->', `<script>\n${script.replaceAll('</script', '<\\/script')}\n</script>`);
const distribution = join(root, 'dist/mappo-0.1-dev.3a.html');
await mkdir(dirname(distribution), { recursive: true });
await Promise.all([writeFile(distribution, html), writeFile(join(root, 'index.html'), html)]);
const hash = createHash('sha256').update(html).digest('hex').slice(0, 16);
console.log(`Built ${distribution.slice(root.length+1)} (${Buffer.byteLength(html).toLocaleString()} bytes; SHA256 ${hash}…)`);
console.log('Root index.html is byte-for-byte identical for static hosting.');
