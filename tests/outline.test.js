import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OutlineEditor,
  makeStartingOutline
} from '../src/editor/outline.js';
import {
  cleanOutline,
  validateBoundary
} from '../src/core/boundary.js';
import {
  pointInPolygon
} from '../src/core/geometry.js';

function editorFixture() {
  const messages = [];
  let changes = 0;
  const editor = new OutlineEditor(() => changes++, (message, error) => messages.push({
    message,
    error
  }));
  return {
    editor,
    messages,
    changes: () => changes
  };
}

test('click-to-place outline closes, chooses a valid center, and preserves exact corners', () => {
  const {
    editor,
    messages
  } = editorFixture();
  editor.start('points');
  const corners = [{
    x: -220,
    y: -180
  }, {
    x: 220,
    y: -180
  }, {
    x: 180,
    y: 200
  }, {
    x: -220,
    y: 180
  }];
  corners.forEach(p => editor.down(p, 1));
  assert.equal(editor.closed, false);
  editor.finish();
  editor.validate();
  assert.equal(editor.closed, true);
  assert.equal(editor.mode, 'edit');
  assert.deepEqual(editor.boundary, corners);
  assert.ok(pointInPolygon(editor.center, corners));
  assert.equal(messages.at(-1).error, false);
});

test('freehand stroke simplifies small jitters and closes only on release', () => {
  const {
    editor
  } = editorFixture();
  editor.start('freehand');
  editor.down({
    x: -200,
    y: -200
  }, 1);
  for (const p of [{
      x: -100,
      y: -198
    }, {
      x: 0,
      y: -201
    }, {
      x: 100,
      y: -199
    }, {
      x: 200,
      y: -200
    }, {
      x: 200,
      y: 200
    }, {
      x: -200,
      y: 200
    }]) editor.move(p, 1);
  assert.equal(editor.closed, false);
  editor.up(1);
  assert.equal(editor.closed, true);
  assert.equal(editor.error, false);
  assert.ok(editor.boundary.length <= 5);
  editor.validate();
});

test('crossed outline remains editable and cannot be generated until corrected', () => {
  const {
    editor,
    messages
  } = editorFixture();
  editor.start('points');
  [{
    x: -200,
    y: -200
  }, {
    x: 200,
    y: 200
  }, {
    x: -200,
    y: 200
  }, {
    x: 200,
    y: -200
  }].forEach(p => editor.down(p, 1));
  assert.equal(editor.finish(), false);
  assert.equal(editor.mode, 'edit');
  assert.equal(editor.error, true);
  assert.match(messages.at(-1).message, /crosses/);
  assert.throws(() => editor.validate(), /crosses/);
  editor.undo();
  assert.equal(editor.boundary.length, 3);
  assert.equal(editor.closed, false);
});

test('point dragging, undo, edge insertion, and selected-point deletion preserve usable outlines', () => {
  const {
    editor
  } = editorFixture();
  const original = makeStartingOutline('wedge', 'edit', 'medium');
  editor.load(original);
  editor.down(editor.boundary[0], 1);
  editor.move({
    x: -430,
    y: -330
  }, 1);
  editor.up(1);
  assert.notDeepEqual(editor.boundary, original);
  editor.undo();
  assert.deepEqual(editor.boundary, original);
  const a = editor.boundary[0],
    b = editor.boundary[1];
  editor.addPoint({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  }, 1);
  assert.equal(editor.boundary.length, original.length + 1);
  editor.removePoint();
  assert.deepEqual(editor.boundary, original);
  editor.validate();
});

test('town-center placement rejects outside and edge clicks without moving the existing center', () => {
  const {
    editor
  } = editorFixture();
  editor.load(makeStartingOutline('planned', 'square', 'medium'));
  const original = {
    ...editor.center
  };
  editor.setMode('center');
  editor.down({
    x: 800,
    y: 800
  }, 1);
  assert.equal(editor.error, true);
  assert.deepEqual(editor.center, original);
  editor.down({
    x: 40,
    y: 20
  }, 1);
  assert.equal(editor.error, false);
  assert.deepEqual(editor.center, {
    x: 40,
    y: 20
  });
  assert.equal(editor.dirty, true);
  editor.undo();
  assert.deepEqual(editor.center, original);
});

test('cancelled pointer gestures restore the previous outline without accepting a partial stroke', () => {
  const {
    editor
  } = editorFixture();
  editor.load(makeStartingOutline('twin', 'cancel', 'medium'));
  const original = editor.snapshot();
  editor.setMode('freehand');
  editor.down({
    x: 0,
    y: 0
  }, 1);
  editor.move({
    x: 100,
    y: 0
  }, 1);
  editor.up(1, true);
  assert.deepEqual(editor.boundary, original.boundary);
  assert.deepEqual(editor.center, original.center);
  assert.equal(editor.closed, true);
});

test('all eight starting outlines support point editing and street generation input', () => {
  for (const preset of ['radial', 'organic', 'linear', 'planned', 'wedge', 'twin', 'branching', 'crescent']) {
    const {
      editor
    } = editorFixture();
    const outline = makeStartingOutline(preset, 'template', 'medium');
    editor.load(outline);
    editor.validate();
    validateBoundary(outline);
    assert.equal(editor.mode, 'edit');
    assert.deepEqual(editor.boundary, outline);
  }
});

test('freehand cleanup rejects a self-crossing stroke before simplification can hide it', () => {
  assert.throws(() => cleanOutline([{
    x: -200,
    y: -200
  }, {
    x: 200,
    y: 200
  }, {
    x: -200,
    y: 200
  }, {
    x: 200,
    y: -200
  }], 100), /crosses/);
});
