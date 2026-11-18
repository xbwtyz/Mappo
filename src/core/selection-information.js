// Read-only adapters over accepted records. No caches, generated facts or model
// writes: every refresh resolves current links, including local district edits.
const INSPECTION_LABELS = Object.freeze({
  L: 'L-shaped', 'compound-wing': 'Compound wing', 'terrace-house': 'Terrace house'
});

export function inspectionValue(value, fallback = 'Not recorded') {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const text = value.trim();
  return Object.hasOwn(INSPECTION_LABELS, text) ? INSPECTION_LABELS[text]
    : text.replaceAll('-', ' ').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
}

export function inspectionTitle(record, field) {
  return typeof record[field] === 'string' && record[field].trim()
    ? `${inspectionValue(record[field])} · ${record.id}` : record.id;
}

export function inspectionArea(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `${value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} square survey units`
    : 'Not recorded';
}

function inspectionRecord(records, id) {
  return typeof id === 'string' && id ? records?.find(record => record.id === id) ?? null : null;
}

function inspectionReference(records, id, { named = false, owner = null } = {}) {
  if (typeof id !== 'string' || !id) return 'Not recorded';
  const record = inspectionRecord(records, id);
  if (!record || (owner && record.propertyId !== owner)) return `${id} (record unavailable)`;
  return named && typeof record.name === 'string' && record.name.trim() ? `${record.name.trim()} (${id})` : id;
}

function inspectionReferences(records, ids, owner = null) {
  if (!Array.isArray(ids)) return 'Not recorded';
  return ids.length ? ids.map(id => inspectionReference(records, id, { owner })).join(', ') : 'None';
}

function inspectionCount(ids) {
  return Array.isArray(ids) ? ids.length : 'Not recorded';
}

function inspectionLocation(city, record) {
  const block = inspectionRecord(city?.blocks, record.blockId);
  // An explicit unassigned value stays unassigned; a historical record without
  // its optional district field can resolve through its actual city block.
  const districtId = Object.hasOwn(record, 'districtId') ? record.districtId : block?.districtId;
  const road = inspectionRecord(city?.roads, record.frontageRoadId);
  const frontage = inspectionReference(city?.roads, record.frontageRoadId, { named: true });
  return {
    title: 'Location and access', rows: [
      ['District', districtId ? inspectionReference(city?.districts, districtId, { named: true }) : 'Unassigned'],
      ['Block', inspectionReference(city?.blocks, record.blockId)],
      ['Frontage street', road?.kind ? `${frontage} · ${inspectionValue(road.kind)}` : frontage]
    ]
  };
}

export function propertyInformation(city, property) {
  if (!property) return null;
  return {
    title: inspectionTitle(property, 'usage'),
    sections: [{ title: 'Property summary', rows: [
      ['Generated usage', inspectionValue(property.usage)],
      ['Site area', inspectionArea(property.area)],
      ['Plots', inspectionCount(property.plotIds)],
      ['Buildings', inspectionCount(property.buildingIds)]
    ] }, inspectionLocation(city, property), {
      title: 'Property plots', rows: [['Plot IDs', inspectionReferences(city?.plots, property.plotIds, property.id)]]
    }, {
      title: 'Buildings on this property', rows: [['Building IDs', inspectionReferences(city?.buildings, property.buildingIds, property.id)]]
    }]
  };
}

export function buildingInformation(city, building) {
  if (!building) return null;
  return {
    title: inspectionTitle(building, 'type'),
    sections: [{ title: 'Building summary', rows: [
      ['Generated type', inspectionValue(building.type)],
      ['Footprint shape', inspectionValue(building.shape)],
      ['Footprint area', inspectionArea(building.area)],
      ['Occupied plots', inspectionCount(building.plotIds)]
    ] }, inspectionLocation(city, building), {
      title: 'Occupied plots', rows: [['Plot IDs', inspectionReferences(city?.plots, building.plotIds, building.propertyId)]]
    }, {
      title: 'Parent property', rows: [['Property', inspectionReference(city?.properties, building.propertyId)]]
    }]
  };
}
