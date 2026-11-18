import test from 'node:test';
import assert from 'node:assert/strict';
import { propertyInformation, buildingInformation, inspectionArea, inspectionValue } from '../src/core/selection-information.js';

const facts = information => Object.fromEntries(information.sections.flatMap(section => section.rows));
function freezeInspectionFixture(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeInspectionFixture(child);
    Object.freeze(value);
  }
  return value;
}
function fixture() {
  const property = { id: 'PROP-1', usage: 'temple', area: 1200.25, districtId: 'D1', blockId: 'BLK-1',
    frontageRoadId: 'RD-1', plotIds: ['P1', 'P2', 'P3'], buildingIds: ['west', 'east'], future: { keep: true } };
  const west = { id: 'west', type: 'house', shape: 'compound-wing', area: 125.5, propertyId: 'PROP-1',
    districtId: 'D1', blockId: 'BLK-1', frontageRoadId: 'RD-2', plotIds: ['P1'] };
  const east = { ...west, id: 'east', type: 'temple', shape: 'courtyard', area: 400, plotIds: ['P2', 'P3'],
    footprint: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }],
    holes: [[{ x: 5, y: 5 }, { x: 25, y: 5 }, { x: 25, y: 15 }, { x: 5, y: 15 }]] };
  const city = { properties: [property], buildings: [west, east], blocks: [{ id: 'BLK-1', districtId: 'D1' }],
    districts: [{ id: 'D1', name: 'North Ward' }],
    plots: ['P1', 'P2', 'P3'].map(id => ({ id, propertyId: property.id })),
    roads: [{ id: 'RD-1', kind: 'primary' }, { id: 'RD-2', name: 'Workshop Lane', kind: 'lane' }] };
  return { city, property, west, east };
}

test('property and compound-wing facts use their own area, usage, plots and frontage without changing accepted records', () => {
  const data = freezeInspectionFixture(fixture()), before = JSON.stringify(data);
  const site = propertyInformation(data.city, data.property), wing = buildingInformation(data.city, data.west);
  assert.equal(site.title, 'Temple · PROP-1');
  assert.equal(wing.title, 'House · west');
  assert.equal(facts(site)['Generated usage'], 'Temple');
  assert.equal(facts(site)['Site area'], '1,200.3 square survey units');
  assert.equal(facts(site).Plots, 3);
  assert.equal(facts(site).Buildings, 2);
  assert.equal(facts(site)['Plot IDs'], 'P1, P2, P3');
  assert.equal(facts(site)['Building IDs'], 'west, east');
  assert.equal(facts(wing)['Generated type'], 'House', 'Parent usage never replaces a building type');
  assert.equal(facts(wing)['Footprint shape'], 'Compound wing');
  assert.equal(facts(wing)['Footprint area'], '125.5 square survey units');
  assert.equal(facts(wing)['Occupied plots'], 1, 'A wing does not inherit every parent plot');
  assert.equal(facts(wing)['Plot IDs'], 'P1');
  assert.equal(facts(wing).Property, 'PROP-1');
  assert.equal(facts(wing).District, 'North Ward (D1)');
  assert.equal(facts(wing).Block, 'BLK-1');
  assert.equal(facts(site)['Frontage street'], 'RD-1 · Primary');
  assert.equal(facts(wing)['Frontage street'], 'Workshop Lane (RD-2) · Lane');
  assert.equal(JSON.stringify(data), before);
});

test('courtyard facts display accepted net footprint area; row and L shapes have readable labels and IDs remain available', () => {
  const { city, east } = fixture();
  assert.equal(facts(buildingInformation(city, east))['Footprint area'], '400.0 square survey units', 'Open center is already excluded from the accepted area');
  assert.equal(facts(buildingInformation(city, { ...east, shape: 'terrace-house' }))['Footprint shape'], 'Terrace house');
  assert.equal(facts(buildingInformation(city, { ...east, shape: 'L' }))['Footprint shape'], 'L-shaped');
  assert.equal(buildingInformation(city, { ...east, type: '' }).title, 'east');
  assert.equal(propertyInformation(city, { ...city.properties[0], usage: null }).title, 'PROP-1');
  assert.equal(inspectionArea(0), '0.0 square survey units');
  for (const invalid of [undefined, null, NaN, Infinity, -1, '125']) assert.equal(inspectionArea(invalid), 'Not recorded');
});

test('missing and mismatched links keep reference IDs with explicit fallbacks instead of borrowing unrelated context', () => {
  const { city, property, west } = fixture();
  city.plots[0].propertyId = 'other';
  const site = facts(propertyInformation(city, { ...property, plotIds: ['P1', 'missing'], buildingIds: ['missing-building'] }));
  assert.equal(site['Plot IDs'], 'P1 (record unavailable), missing (record unavailable)');
  assert.equal(site.Plots, 2);
  assert.equal(site['Building IDs'], 'missing-building (record unavailable)');
  const wing = facts(buildingInformation({}, { ...west, districtId: 'missing-district' }));
  assert.equal(wing.District, 'missing-district (record unavailable)');
  assert.equal(wing.Block, 'BLK-1 (record unavailable)');
  assert.equal(wing.Property, 'PROP-1 (record unavailable)');
  assert.equal(wing['Frontage street'], 'RD-2 (record unavailable)');
  const minimal = facts(buildingInformation({}, { id: 'old-building' }));
  assert.equal(minimal.District, 'Unassigned');
  assert.equal(minimal['Occupied plots'], 'Not recorded');
  assert.equal(minimal['Plot IDs'], 'Not recorded');
  assert.equal(minimal['Generated type'], 'Not recorded');
  assert.equal(propertyInformation(city, null), null);
  assert.equal(buildingInformation(city, null), null);
});

test('historical records resolve a district through their block while an explicit unassigned value stays unassigned', () => {
  const { city, west } = fixture();
  const older = { ...west };
  delete older.districtId;
  assert.equal(facts(buildingInformation(city, older)).District, 'North Ward (D1)');
  assert.equal(facts(buildingInformation(city, { ...older, districtId: null })).District, 'Unassigned');
  assert.equal(facts(propertyInformation({}, { id: 'empty', plotIds: [], buildingIds: [] }))['Plot IDs'], 'None');
});

test('compatible text stays literal, unknown type codes remain readable, and prototype names are never treated as formatters', () => {
  const { city, property } = fixture();
  city.districts[0].name = '<img src=x onerror=alert(1)>';
  assert.equal(facts(propertyInformation(city, property)).District, '<img src=x onerror=alert(1)> (D1)');
  assert.equal(inspectionValue('future-building-form'), 'Future building form');
  assert.equal(inspectionValue('constructor'), 'Constructor');
  assert.equal(typeof inspectionValue('__proto__'), 'string');
});

test('fresh information resolves local district/name changes from current records rather than cached objects', () => {
  const { city, property, west } = fixture();
  const oldSite = propertyInformation(city, property);
  const next = { ...city, districts: [{ id: 'D1', name: 'Renamed Ward' }] };
  assert.equal(facts(oldSite).District, 'North Ward (D1)');
  assert.equal(facts(propertyInformation(next, property)).District, 'Renamed Ward (D1)');
  assert.equal(facts(buildingInformation(next, west)).District, 'Renamed Ward (D1)');
});
