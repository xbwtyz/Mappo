export const IDENTITY_TEXT_LIMIT = 80;
export const IDENTITY_HISTORY_LIMIT = 20;
export const IDENTITY_USE_PRESETS = Object.freeze(['Residence', 'Inn / Tavern', 'Shop', 'Workshop', 'Guildhall', 'Temple', 'Warehouse']);
export const BUILDING_USE_TYPES = Object.freeze(['house', 'shop', 'workshop', 'inn', 'warehouse', 'guildhall', 'temple']);
const IDENTITY_FIELDS = ['customName', 'customUse'];

export function validateIdentity(record) {
  for (const field of IDENTITY_FIELDS) if (Object.hasOwn(record, field)) {
    const value = record[field];
    if (typeof value !== 'string' || !value.trim() || value.length > IDENTITY_TEXT_LIMIT || /[\u0000-\u001f\u007f]/u.test(value))
      throw new Error(`${field === 'customName' ? 'Custom name' : 'Descriptive use'} must be text of 1–${IDENTITY_TEXT_LIMIT} characters without control characters.`);
  }
}
export function normalizeIdentity(input) {
  const result = {};
  for (const field of IDENTITY_FIELDS) {
    const value = input[field] ?? '';
    if (typeof value !== 'string' || value.length > IDENTITY_TEXT_LIMIT || /[\u0000-\u001f\u007f]/u.test(value))
      throw new Error(`${field === 'customName' ? 'Custom name' : 'Descriptive use'} must be at most ${IDENTITY_TEXT_LIMIT} characters without control characters.`);
    const text = value.trim().replace(/\s+/gu, ' ');
    if (text) result[field] = text;
  }
  return result;
}
export function identityRecord(city, ref) {
  const key = ref?.kind === 'property' ? 'properties' : ref?.kind === 'building' ? 'buildings' : null;
  return key && typeof ref.id === 'string' ? city?.[key]?.find(record => record.id === ref.id) ?? null : null;
}
export function identitySnapshot(record) {
  return identityFieldsSnapshot(record, IDENTITY_FIELDS);
}
function identityFieldsSnapshot(record, fields) {
  return Object.fromEntries(fields.filter(field => Object.hasOwn(record, field)).map(field => [field, record[field]]));
}

export function identityChanges(record, ref, input) {
  const current = identitySnapshot(record);
  const normalized = normalizeIdentity(current);
  const next = normalizeIdentity(input);
  const changingUse = input.buildingType !== undefined && input.buildingType !== '';
  const fields = IDENTITY_FIELDS.filter(field =>
    (!changingUse || Object.hasOwn(input, field)) && normalized[field] !== next[field]);
  if (changingUse) {
    if (ref.kind !== 'building' || !BUILDING_USE_TYPES.includes(input.buildingType))
      throw new Error('Choose a supported building use.');
    if (input.previousBuildingType !== undefined && record.type !== input.previousBuildingType)
      throw new Error('The building use changed since this draft started. Discard the draft and choose again.');
    if (record.type !== input.buildingType) {
      fields.push('type');
      next.type = input.buildingType;
    }
  }
  return { fields, before: identityFieldsSnapshot(record, fields), after: identityFieldsSnapshot(next, fields) };
}
function replaceIdentity(city, ref, fields, identity) {
  const key = ref.kind === 'property' ? 'properties' : 'buildings';
  return { ...city, [key]: city[key].map(record => {
    if (record.id !== ref.id) return record;
    const next = { ...record };
    for (const field of fields) {
      if (Object.hasOwn(identity, field)) next[field] = identity[field];
      else delete next[field];
    }
    return next;
  }) };
}
export function customizedIdentityCounts(city) {
  const edited = record => Boolean(record.customName || record.customUse);
  return { properties: (city?.properties ?? []).filter(edited).length, buildings: (city?.buildings ?? []).filter(edited).length };
}
export class IdentityEditor {
  constructor() { this.history = []; }
  apply(city, ref, input) {
    const record = identityRecord(city, ref);
    if (!record) throw new Error('The selected property or building is no longer available.');
    validateIdentity(record);
    const { fields, before, after } = identityChanges(record, ref, input);
    if (!fields.length) return city;
    const next = replaceIdentity(city, ref, fields, after);
    this.history.push({ ref: { ...ref }, fields, before, after });
    if (this.history.length > IDENTITY_HISTORY_LIMIT) this.history.shift();
    return next;
  }
  undo(city) {
    const entry = this.history.at(-1);
    if (!entry) throw new Error('There is no identity edit to undo.');
    const record = identityRecord(city, entry.ref);
    if (!record || JSON.stringify(identityFieldsSnapshot(record, entry.fields)) !== JSON.stringify(entry.after))
      throw new Error('That identity has changed or is no longer available. Its undo was not applied.');
    const next = replaceIdentity(city, entry.ref, entry.fields, entry.before);
    this.history.pop();
    return next;
  }
  reset() { this.history = []; }
}
