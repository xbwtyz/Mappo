import { buildingDirectHandles } from '../editor/building.js';
import { buildingFrame } from '../core/building-transform.js';
import { rectangularCourtyardFrame } from '../core/building-footprint-f1.js';

export class BuildingFootprintControls {
  constructor(element, getContext) {
    this.element = element;
    this.getContext = getContext;
    this.optionCounts = new Map();
    this.courtyardKey = '';
  }
  bind() {
    const el = this.element;
    const edit = (action, values) => {
      const { city, session } = this.getContext();
      return session.editDirectGeometry(city, action, values);
    };
    el('buildingDirectRing').addEventListener('change', () => {
      const { city, session } = this.getContext();
      const value = el('buildingDirectRing').value;
      session.selectDirectRing(city, value === 'exterior' ? null : Number(value));
    });
    el('buildingDirectHandle').addEventListener('change', () => {
      const { city, session } = this.getContext();
      session.selectDirectHandle(city, Number(el('buildingDirectHandle').value));
    });
    for (const axis of ['x', 'y']) {
      const input = el('buildingVertex' + axis.toUpperCase());
      input.addEventListener('change', () => {
        const { city, session } = this.getContext();
        const vertex = buildingDirectHandles(session.previewFor(city), 'vertices', session.holeIndex)[session.handleIndex];
        if (vertex) edit('move', { ...vertex, [axis]: this.number(input.id) });
      });
    }
    el('buildingDeleteVertex').addEventListener('click', () => edit('delete'));
    el('buildingInsertVertex').addEventListener('click', () => edit('insert'));
    el('buildingAddWing').addEventListener('click', () => edit('wing', {
      start: this.number('buildingWingStart') / 100,
      end: this.number('buildingWingEnd') / 100,
      depth: this.number('buildingWingDepth')
    }));
    const previewCourtyard = () => {
      const { session } = this.getContext();
      if (session?.tool !== 'courtyard' || el('buildingCourtyardWidth').disabled) return;
      this.updatingCourtyard = true;
      try {
        edit(session.holeIndex === null ? 'add courtyard' : 'adjust courtyard', {
          center: { x: this.number('buildingCourtyardX'), y: this.number('buildingCourtyardY') },
          width: this.number('buildingCourtyardWidth'), depth: this.number('buildingCourtyardDepth')
        });
      } finally {
        this.updatingCourtyard = false;
      }
    };
    for (const suffix of ['X', 'Y', 'Width', 'Depth'])
      el('buildingCourtyard' + suffix).addEventListener('input', previewCourtyard);
    el('buildingSetCourtyard').addEventListener('click', previewCourtyard);
    el('buildingRemoveCourtyard').addEventListener('click', () => edit('remove courtyard'));
  }
  number(id) {
    const value = this.element(id).value;
    return value === '' ? NaN : Number(value);
  }
  setOptions(id, count, label, before = null) {
    const key = label + count;
    if (this.optionCounts.get(id) === key) return;
    this.optionCounts.set(id, key);
    const options = Array.from({ length: count }, (_, index) => [String(index), label + ' ' + (index + 1)]);
    if (before) options.unshift(before);
    this.element(id).replaceChildren(...options.map(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      return option;
    }));
  }
  sync(city, session) {
    const el = this.element;
    const direct = Boolean(session?.isActive && session.isDirect);
    el('buildingDirectControls').hidden = !direct;
    el('buildingTransformValues').hidden = direct;
    el('buildingTransformPanel').setAttribute('data-direct', String(direct));
    if (!direct) {
      this.courtyardKey = '';
      return;
    }
    const { holeIndex, tool, handleIndex, drag, topologyChanged } = session;
    const preview = session.previewFor(city);
    const hole = preview.holes[holeIndex];
    const vertices = tool === 'vertices';
    const edges = tool === 'edges';
    const handles = buildingDirectHandles(preview, tool, holeIndex);
    const blocked = Boolean(drag || topologyChanged);
    this.setOptions('buildingDirectRing', preview.holes.length, 'Courtyard', ['exterior', 'Exterior']);
    el('buildingDirectRing').value = holeIndex === null ? 'exterior' : String(holeIndex);
    el('buildingDirectRing').disabled = Boolean(drag);
    el('buildingDirectHandleLabel').hidden = !vertices && !edges;
    el('buildingDirectHandleName').textContent = vertices ? 'Vertex' : 'Edge';
    this.setOptions('buildingDirectHandle', handles.length, vertices ? 'Vertex' : 'Edge');
    el('buildingDirectHandle').value = String(handleIndex);
    el('buildingDirectHandle').disabled = Boolean(drag);
    el('buildingVertexControls').hidden = !vertices;
    el('buildingEdgeControls').hidden = !edges;
    el('buildingWingControls').hidden = holeIndex !== null;
    const selected = handles[handleIndex];
    if (vertices && selected) {
      for (const axis of ['x', 'y']) {
        const input = el('buildingVertex' + axis.toUpperCase());
        input.value = String(Number(selected[axis].toFixed(4)));
        input.readOnly = Boolean(drag);
      }
    }
    el('buildingDeleteVertex').disabled = blocked || handles.length <= 3;
    el('buildingInsertVertex').disabled = blocked;
    el('buildingAddWing').disabled = blocked;
    el('buildingCourtyardControls').hidden = tool !== 'courtyard';
    const frame = rectangularCourtyardFrame(hole);
    const adjustable = !hole || Boolean(frame);
    const canAdjust = adjustable && !drag && (Boolean(hole) || !topologyChanged);
    if (tool === 'courtyard') {
      const outer = buildingFrame(preview);
      const values = frame ?? {
        center: outer, width: outer.width * .25, depth: outer.height * .25
      };
      const key = JSON.stringify([session.buildingId, holeIndex, adjustable, values, session.operationError]);
      for (const [suffix, value] of Object.entries({
        X: values.center.x, Y: values.center.y, Width: values.width, Depth: values.depth
      })) {
        const input = el('buildingCourtyard' + suffix);
        if (!this.updatingCourtyard && this.courtyardKey !== key)
          input.value = String(Number(value.toFixed(4)));
        input.disabled = !canAdjust;
      }
      this.courtyardKey = key;
    } else this.courtyardKey = '';
    el('buildingSetCourtyard').hidden = Boolean(hole);
    el('buildingSetCourtyard').disabled = !canAdjust;
    el('buildingRemoveCourtyard').disabled = !hole || blocked;
    el('buildingDirectHint').textContent = tool === 'courtyard' && hole && adjustable
      ? 'Changes to the center, width, and depth update the preview as you type.'
      : topologyChanged
      ? 'Apply or reset before inserting or removing another vertex, wing, or courtyard.'
      : vertices ? 'Drag a map handle or enter the selected vertex coordinates.'
      : edges ? 'Choose an edge on the map or from the list.'
      : !adjustable ? 'Use Vertices to adjust this nonrectangular courtyard.'
      : 'Choose Exterior to add a rectangular courtyard or select a courtyard to edit.';
    el('buildingDirectError').textContent = session.operationError;
    el('buildingDirectError').hidden = !session.operationError;
  }
}
