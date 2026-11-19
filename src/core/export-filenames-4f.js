// A filename is a download preference, not a city name or saved schema field.
// Never allow path separators, device names or a hidden/ambiguous extension.
export function safeExportBase4F(raw) {
  if(typeof raw!=='string')return '';
  const cleaned=raw.trim().replace(/(?:\.mappo\.json|\.png|\.json)$/i,'')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64).replace(/-+$/g,'');
  if(!cleaned)return '';
  return /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(cleaned)
    ? 'mappo-'+cleaned : cleaned;
}
export function exportFilename4F(preferred,defaultProjectFilename,kind='project') {
  if(!['project','png'].includes(kind))throw new Error('Unknown export kind.');
  const suffix=kind==='png'?'.png':'.mappo.json';
  const fallback=typeof defaultProjectFilename==='string'
    ? defaultProjectFilename.replace(/\.mappo\.json$/i,'') : 'mappo-city';
  return (safeExportBase4F(preferred)||safeExportBase4F(fallback)||'mappo-city')+suffix;
}
