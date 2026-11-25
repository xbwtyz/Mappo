import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

// Test-only access to closure state; the distributed app exposes no QA globals.
export const buildingObservation = `
// QA-only detached history inspection, no mutable accepted cursor escapes.
const idaQALedger=new Proxy({}, {get(_target,key){
  if(key==='toJSON')return ()=>secureIdentityHost.copyHistory();
  const copy=secureIdentityHost.copyHistory(),value=copy[key];
  return typeof value==='function'?value.bind(copy):value;
}});
globalThis.__buildingQA = {
  state: () => ({ project, camera, editor, layers, workspaceShell, roadWorkspace, buildingWorkspace, buildingEditSession, propertyWorkspace, identityWorkspace,
    landscapeWorkspace, districtPanel, waterPanel, terrainPanel, fortificationPanel, files, buildingHistory, buildingStructureHistory, acceptedHistoryD01:idaQALedger, identityView:secureIdentityHost.view(), buildingPlacementSession, propertyEditSession, propertyHistory, propertyDeletionHistory4A, propertyCreationSessionE1, propertyCreationHistoryE1, propertySplitE2, propertyMergeE3, roadHistory }),
  capture: captureWorkspace,
  // Older browser fixtures pass a project/workspace pair, not a file envelope.
  // Construct the real portable envelope in the app realm, or decode the
  // supplied complete envelope. Production adoption remains strictly validated.
  apply: doc => {
    const input=JSON.parse(JSON.stringify(doc));
    const portable=Object.keys(input).length===2&&Object.hasOwn(input,'project')&&Object.hasOwn(input,'workspace')
      ?createProjectDocument(input.project,input.workspace):input;
    applyProjectDocument(decodeProjectDocument(JSON.stringify(portable)));
  },
  // Real file-import boundary for documents created in the outer Node realm.
  // Decode in the app realm; never weaken production plain-record validation.
  applyPortable: text => applyProjectDocument(decodeProjectDocument(text)), applyRoad: () => roadWorkspace.apply(), moveRoadHistory: moveRoadHistoryB4, draw: requestDraw
};
`;

export function observeBuildingApp(html, extraObservation = '', { legacy = true } = {}) {
  // Old compact UI regression tests use this test-only seam. No public desktop override.
  if (legacy) {
    const desktopCtor = 'redraw: requestDraw,\n  enabled: true,';
    if (!html.includes(desktopCtor)) throw new Error('Desktop QA seam missing');
    html = html.replace(desktopCtor, 'redraw: requestDraw,\n  enabled: false,');
  }
  return html.replace(/\n\}\)\(\);\s*<\/script>/, `${buildingObservation}\n${extraObservation}\n})();\n</script>`);
}

// Node's injected structuredClone creates records in the outer Node realm,
// unlike a browser's native structuredClone. Preserve native clone semantics
// (including cycles, shared references, undefined and Map/Set), then restore
// the cloned graph's standard prototypes inside the simulated browser realm.
// This is a test-only adapter, not a change to the production validator.
export function installBrowserStructuredClone(context) {
  vm.createContext(context);
  vm.runInContext(`
    globalThis.structuredClone=((nativeClone)=>(value,options)=>{
      const cloned=nativeClone(value,options),seen=new WeakSet();
      function rehome(v){
        if(v===null||typeof v!=='object'||seen.has(v))return v;
        seen.add(v);
        const tag=Object.prototype.toString.call(v).slice(8,-1);
        const constructors={Object,Array,Map,Set,Date,RegExp,ArrayBuffer,DataView,
          Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,
          Int32Array,Uint32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array};
        if(!Object.hasOwn(constructors,tag))
          throw new Error('Unsupported simulated-browser clone type: '+tag);
        Object.setPrototypeOf(v,constructors[tag].prototype);
        if(tag==='Map')for(const [key,item] of v){rehome(key);rehome(item);}
        if(tag==='Set')for(const item of v)rehome(item);
        if(ArrayBuffer.isView(v))rehome(v.buffer);
        for(const key of Object.keys(v))rehome(v[key]);
        return v;
      }
      return rehome(cloned);
    })(structuredClone);
  `,context);
  return context;
}

export async function buildingAppHarness() {
  const html = observeBuildingApp(await readFile(new URL('../../index.html', import.meta.url), 'utf8'));
  const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  const elements = new Map(), globalEvents = {};
  const ctx = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) });
  const document = {
    activeElement: { tagName: 'BODY' },
    getElementById: el,
    createElement: () => ({
      classList: { toggle() {} }, attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, fn) { (this.handlers ??= {})[name] = fn; },
      replaceChildren(...children) { this.children = children; },
      append(...children) { this.children = [...(this.children ?? []), ...children]; },
      scrollIntoView() {}
    })
  };
  function el(id) {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set();
    const element = {
      id, tagName: id === 'mapCanvas' ? 'CANVAS' : 'DIV',
      value: '', textContent: '', checked: false, disabled: false, handlers: {},
      classList: {
        add: name => classes.add(name), remove: name => classes.delete(name),
        toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
        contains: name => classes.has(name)
      },
      addEventListener(name, fn) { this.handlers[name] = fn; },
      setAttribute(name, value) { this[name] = value; },
      replaceChildren(...children) { this.children = children; this.options = children; },
      focus() { document.activeElement = this; }, setPointerCapture() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 760, height: 620 }),
      getContext: () => ctx
    };
    if (id === 'wallsEnabledInput') element.checked = true;
    if (id === 'sizeInput') element.value = 'small';
    if (id === 'presetInput' || id === 'morphologyInput') element.value = 'organic';
    elements.set(id, element);
    return element;
  }
  const context = {
    document, console, URL, Uint32Array, Uint8Array, TextEncoder, structuredClone, Math, Date, setTimeout, clearTimeout, crypto:webcrypto,
    window: {
      location: { href: 'file:///mappo.html?seed=building-selection-qa&size=small' }, devicePixelRatio: 1,
      addEventListener(name, fn) { (globalEvents[name] ??= []).push(fn); }
    },
    requestAnimationFrame: cb => cb()
  };
  context.globalThis = context;
  installBrowserStructuredClone(context);
  vm.runInContext(script, context);
  const qa = context.__buildingQA;
  const fire = (name, point, extra = {}) => el('mapCanvas').handlers[name]({
    pointerId: 1, button: 0, clientX: point.x, clientY: point.y, preventDefault() {}, ...extra
  });
  const tap = point => { fire('pointerdown', point); fire('pointerup', point); };
  return { ...qa, el, fire, tap, globalEvents };
}
