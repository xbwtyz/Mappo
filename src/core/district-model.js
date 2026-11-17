import {
  buildDistrictTopology,
  districtIsConnected
} from './district-topology.js';

export function applyDistrictMembership(city, districts, state) {
  const assignments = new Map();
  for (const district of districts)
    for (const id of district.blockIds || []) assignments.set(id, district.id);
  return {
    ...city,
    districts,
    districtState: state,
    blocks: city.blocks.map(b => ({
      ...b,
      districtId: assignments.get(b.id) ?? null
    })),
    properties: city.properties.map(p => ({
      ...p,
      districtId: assignments.get(p.blockId) ?? null
    })),
    buildings: city.buildings.map(b => ({
      ...b,
      districtId: assignments.get(b.blockId) ?? null
    }))
  };
}

export function validateDistricts(city, topology = buildDistrictTopology(city)) {
  const state = city.districtState;
  if (!state || typeof state !== 'object') throw new Error('Invalid district state.');
  if (state.version !== 1 || !['unassigned', 'assigned'].includes(state.status)) throw new Error('Unsupported district state version. Use a compatible Mappo build.');
  if (state.status === 'unassigned') {
    const ids = new Set(city.districts.map(d => d.id));
    for (const record of [...city.blocks, ...city.properties, ...city.buildings])
      if (record.districtId != null && !ids.has(record.districtId)) throw new Error('Legacy district membership references a missing district.');
    return city;
  }
  if (state.count !== undefined && state.count !== city.districts.length) throw new Error('District count metadata is inconsistent.');
  if (state.requestedCount !== undefined && state.requestedCount !== 'auto') {
    const requested = typeof state.requestedCount === 'number' ? state.requestedCount : typeof state.requestedCount === 'string' && /^\d+$/.test(state.requestedCount) ? Number(state.requestedCount) : NaN;
    if (!Number.isInteger(requested) || requested < 1 || requested > Math.max(12, city.districts.length)) throw new Error('Invalid requested district count.');
  }
  if (state.seed !== undefined && (typeof state.seed !== 'string' || state.seed.length > 64)) throw new Error('Invalid district seed.');
  if (!city.districts.length) throw new Error('Assigned districts cannot be empty.');
  const districtIds = new Set(),
    owners = new Map();
  for (const district of city.districts) {
    if (typeof district.id !== 'string' || !district.id || district.id.length > 128 || districtIds.has(district.id)) throw new Error('Invalid or duplicate district ID.');
    districtIds.add(district.id);
    if (district.dataVersion !== 1 || district.kind !== 'neighborhood') throw new Error('Unsupported district data version or kind.');
    if (typeof district.name !== 'string' || !district.name.trim() || district.name.length > 64) throw new Error('District names must contain 1–64 characters.');
    if (typeof district.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(district.color)) throw new Error('District colors must use a six-digit hex color.');
    if (!Array.isArray(district.blockIds) || !district.blockIds.length || new Set(district.blockIds).size !== district.blockIds.length) throw new Error('A district must contain unique blocks.');
    for (const id of district.blockIds) {
      if (!topology.blocks.has(id) || owners.has(id)) throw new Error('Districts contain missing or shared blocks.');
      owners.set(id, district.id);
    }
    if (!districtIsConnected(district.blockIds, topology)) throw new Error(`District ${district.name} is disconnected.`);
  }
  if (owners.size !== city.blocks.length) throw new Error('Some city blocks have no district.');
  for (const record of [...city.blocks, ...city.properties, ...city.buildings])
    if (record.districtId !== owners.get(record.blockId ?? record.id)) throw new Error('District membership disagrees with its city block.');
  return city;
}

export function renameDistrict(city, id, name, color) {
  const existing = city.districts.find(d => d.id === id);
  if (!existing) throw new Error('Choose a district first.');
  const districts = city.districts.map(d => d.id === id ? {
    ...d,
    name: typeof name === 'string' ? name.trim() : '',
    color
  } : d);
  const next = {
    ...city,
    districts
  };
  validateDistricts(next);
  return next;
}

export function moveDistrictBlock(city, blockId, targetId) {
  if (city.districtState.status !== 'assigned') throw new Error('Generate districts first.');
  const topology = buildDistrictTopology(city),
    block = topology.blocks.get(blockId),
    target = city.districts.find(d => d.id === targetId);
  if (!block || !target) throw new Error('Choose a city block and neighboring district.');
  const source = city.districts.find(d => d.id === block.districtId);
  if (!source) throw new Error('The selected block has no assigned district.');
  if (source.id === targetId) throw new Error('That block already belongs to the selected district.');
  if (![...topology.neighbors.get(blockId)].some(id => topology.blocks.get(id).districtId === targetId)) throw new Error('The receiving district must share a street edge with this block.');
  const remaining = source.blockIds.filter(id => id !== blockId);
  if (!remaining.length) throw new Error('Keep at least one block in every district.');
  if (!districtIsConnected(remaining, topology)) throw new Error(`Moving this block would split ${source.name}. Choose another boundary block.`);
  const districts = city.districts.map(d => d.id === source.id ? {
    ...d,
    blockIds: remaining
  } : d.id === targetId ? {
    ...d,
    blockIds: [...d.blockIds, blockId]
  } : d);
  const next = applyDistrictMembership(city, districts, {
    ...city.districtState
  });
  validateDistricts(next, topology);
  return next;
}
