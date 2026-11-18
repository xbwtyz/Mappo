import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Camera } from '../src/renderer/camera.js';

test('responsive stylesheet handles ultrawide, desktop, overlay and narrow map placement', () => {
  const css=readFileSync(new URL('../styles/app.css',import.meta.url),'utf8');
  const phase=css.slice(css.indexOf('/* Phase 6C'));
  assert.match(phase, /min-width:2400px/);
  assert.match(phase, /max-width:1340px/);
  assert.match(phase, /max-width:900px/);
  assert.match(phase, /max-width:670px/);
  assert.match(phase, /max-width:380px/);
  assert.match(phase, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(phase, /height:100dvh/);
  assert.match(phase, /width:min\(340px,calc\(100vw - 48px\)\)/);
  assert.match(phase, /\.workspace-shell \.map-shell\{grid-column:1/);
});
test('resizing a live canvas preserves camera world center, zoom and conversions', () => {
  const camera = new Camera();
  camera.x=127;camera.y=-58;camera.zoom=1.85;
  const world={x:127,y:-58};
  for (const [w,h] of [[640,520],[3100,1000],[360,690],[960,650]]) {
    camera.resize(w,h);
    assert.equal(camera.x,127);
    assert.equal(camera.y,-58);
    assert.equal(camera.zoom,1.85);
    assert.deepEqual(camera.worldToScreen(world),{x:w/2,y:h/2});
    assert.deepEqual(camera.screenToWorld({x:w/2,y:h/2}),world);
  }
});
