// Dev 4f. View-only presets; the existing seven layer flags are saved normally.
export const LAYER_KEYS_4F = Object.freeze([
  'buildings','properties','plots','districtColors','districtBorders',
  'districtLabels','fortifications'
]);
export const LAYER_PRESETS_4F = Object.freeze({
  presentation: Object.freeze({
    buildings:true,properties:false,plots:false,
    districtColors:true,districtBorders:true,districtLabels:true,fortifications:true
  }),
  planning: Object.freeze({
    buildings:true,properties:true,plots:true,
    districtColors:false,districtBorders:false,districtLabels:false,fortifications:false
  }),
  minimal: Object.freeze({
    buildings:true,properties:false,plots:false,
    districtColors:false,districtBorders:false,districtLabels:false,fortifications:false
  }),
  all: Object.freeze(Object.fromEntries(LAYER_KEYS_4F.map(key=>[key,true])))
});
export function layerPreset4F(name) {
  const preset=Object.hasOwn(LAYER_PRESETS_4F,name)?LAYER_PRESETS_4F[name]:null;
  return preset?{...preset}:null;
}
export function identifyLayerPreset4F(layers) {
  for(const [name,preset] of Object.entries(LAYER_PRESETS_4F))
    if(LAYER_KEYS_4F.every(key=>Boolean(layers?.[key])===preset[key]))return name;
  return 'custom';
}
