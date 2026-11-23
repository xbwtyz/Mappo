// Export the already-rendered, on-screen map. This intentionally includes
// currently visible layers, selection and any draft overlays; no model writes.
export async function downloadMapPNG4F(canvas,filename,environment=globalThis) {
  if(!canvas || typeof canvas.toBlob!=='function' || !Number.isFinite(canvas.width)
      || !Number.isFinite(canvas.height) || canvas.width<1 || canvas.height<1)
    throw new Error('The map is not ready for PNG export.');
  return downloadCanvasPNG(canvas, filename, environment, 'visible map');
}

export async function downloadCanvasPNG(canvas, filename, environment, description) {
  const blob=await new Promise((resolve,reject)=>{
    try {canvas.toBlob(resolve,'image/png');}catch(error){reject(error);}
  });
  if(!blob || !blob.size)throw new Error('The browser could not encode the '+description+' as PNG.');
  const url=environment.URL.createObjectURL(blob);
  try {
    const link=environment.document.createElement('a');
    link.href=url;link.download=filename;
    environment.document.body.appendChild(link);
    try{link.click();}finally{link.remove();}
  }finally {
    environment.setTimeout(()=>environment.URL.revokeObjectURL(url),30000);
  }
  return {width:canvas.width,height:canvas.height,bytes:blob.size};
}
