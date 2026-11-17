import { createProject } from './core/city-model.js';
import { Camera } from './renderer/camera.js';
import { renderMap } from './renderer/canvas.js';
import { bindCanvasInteraction } from './ui/controllers.js';

const $ = id => document.getElementById(id);
const canvas = $('mapCanvas');
const viewport = $('mapViewport');
const camera = new Camera();
let project;
let drawPending = false;

function requestDraw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => {
    drawPending = false;
    if (project) renderMap(canvas, camera, project);
  });
}

function updateViewport() {
  $('zoomValue').textContent = `${Math.round(camera.zoom * 100)}%`;
  $('positionValue').textContent = `${Math.round(camera.x)}, ${Math.round(camera.y)}`;
}

function updateDetails() {
  const city = project.city;
  $('cityName').textContent = city.name;
  $('reportCityName').textContent = city.name;
  $('citySeed').textContent = project.seed;
  $('citySize').textContent = project.options.size;
  $('junctionCount').textContent = city.nodes.length;
  $('roadCount').textContent = city.roads.length;
  $('blockCount').textContent = city.blocks.length;
  $('laneCount').textContent = city.roads.filter(road => road.kind === 'lane').length;
  $('cityRadius').textContent = `${city.survey.nominalRadius} units`;
  $('currentSeed').textContent = project.seed;
}

function setMessage(text) {
  $('statusMessage').textContent = text;
}

function fitMap() {
  if (!project) return;
  camera.fit(project.city.survey.boundary);
  requestDraw();
  updateViewport();
}

function generate() {
  project = createProject({ seed: $('seedInput').value, size: $('sizeInput').value });
  $('seedInput').value = project.seed;
  fitMap();
  updateDetails();
  setMessage(`${project.city.roads.length} connected road segments · ${project.city.blocks.length} city blocks`);
}

function newSeed() {
  const values = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else { values[0] = Date.now() >>> 0; values[1] = Math.floor(Math.random() * 2 ** 32); }
  $('seedInput').value = `${values[0].toString(36)}-${values[1].toString(36)}`;
  generate();
}

function resize() {
  const rect = viewport.getBoundingClientRect();
  camera.resize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
  requestDraw();
  updateViewport();
}

$('generateButton').addEventListener('click', generate);
$('newSeedButton').addEventListener('click', newSeed);
$('fitButton').addEventListener('click', fitMap);
$('zoomInButton').addEventListener('click', () => { camera.zoomAt(1.25); requestDraw(); updateViewport(); });
$('zoomOutButton').addEventListener('click', () => { camera.zoomAt(0.8); requestDraw(); updateViewport(); });
$('seedInput').addEventListener('keydown', event => { if (event.key === 'Enter') generate(); });
$('sizeInput').addEventListener('change', generate);
window.addEventListener('keydown', event => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === '0') { fitMap(); event.preventDefault(); }
  if (event.key === '+' || event.key === '=') { camera.zoomAt(1.25); requestDraw(); updateViewport(); event.preventDefault(); }
  if (event.key === '-') { camera.zoomAt(0.8); requestDraw(); updateViewport(); event.preventDefault(); }
});

bindCanvasInteraction(canvas, camera, requestDraw, updateViewport);
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(viewport);
else window.addEventListener('resize', resize);
resize();
const url = new URL(window.location.href);
$('seedInput').value = url.searchParams.get('seed') || 'mappo-001';
const size = url.searchParams.get('size');
if (['small', 'medium', 'large'].includes(size)) $('sizeInput').value = size;
generate();
