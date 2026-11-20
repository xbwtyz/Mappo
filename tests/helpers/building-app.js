import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Test-only access to closure state; the distributed app exposes no QA globals.
export const buildingObservation = `
globalThis.__buildingQA = {
  state: () => ({ project, camera, editor, layers, workspaceShell, roadWorkspace, buildingWorkspace, buildingEditSession, propertyWorkspace, identityWorkspace,
    landscapeWorkspace, districtPanel, waterPanel, terrainPanel, fortificationPanel, files, buildingHistory, buildingStructureHistory, buildingPlacementSession, propertyEditSession, propertyHistory, propertyDeletionHistory4A, propertyCreationSessionE1, propertyCreationHistoryE1, propertySplitE2, propertyMergeE3, roadHistory }),
  capture: captureWorkspace, apply: applyProjectDocument, applyRoad: applyRoadEditB4, moveRoadHistory: moveRoadHistoryB4, draw: requestDraw
};
`;

export function observeBuildingApp(html, extraObservation = '') {
  return html.replace(/\n\}\)\(\);\s*<\/script>/, `${buildingObservation}\n${extraObservation}\n})();\n</script>`);
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
    document, console, URL, Uint32Array, TextEncoder, structuredClone, Math, Date, setTimeout, clearTimeout,
    window: {
      location: { href: 'file:///mappo.html?seed=building-selection-qa&size=small' }, devicePixelRatio: 1,
      addEventListener(name, fn) { (globalEvents[name] ??= []).push(fn); }
    },
    requestAnimationFrame: cb => cb()
  };
  context.globalThis = context;
  vm.runInNewContext(script, context);
  const qa = context.__buildingQA;
  const fire = (name, point, extra = {}) => el('mapCanvas').handlers[name]({
    pointerId: 1, button: 0, clientX: point.x, clientY: point.y, preventDefault() {}, ...extra
  });
  const tap = point => { fire('pointerdown', point); fire('pointerup', point); };
  return { ...qa, el, fire, tap, globalEvents };
}
