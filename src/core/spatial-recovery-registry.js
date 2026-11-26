import { LARE_STRATEGIES } from './reconciliation-strategies.js';
import { LARE_CONSTRAINTS } from './reconciliation-constraints.js';
import { createSpatialPermissions } from './spatial-recovery-contract.js';
import { riFreeze } from './road-impact-model.js';

// Registry describes permissions, not implementation or automatic authority.
// Relaxed strategies are recognized but explicitly inactive until integrated.
export const SRE_STRATEGIES = riFreeze({
  direct:{legacy:LARE_STRATEGIES.direct.id,requires:[],integrated:false},
  strict:{legacy:LARE_STRATEGIES.strict.id,requires:[],integrated:false},
  'selective-adaptive':{legacy:LARE_STRATEGIES['selective-adaptive'].id,requires:[],integrated:false},
  'enhanced-adaptive':{legacy:LARE_STRATEGIES['enhanced-adaptive'].id,requires:[],integrated:false},
  packing:{requires:[],integrated:false},
  'alternative-frontage':{requires:['alternativeFrontage'],integrated:false},
  'uniform-scaling':{requires:['uniformScaling'],integrated:false},
  demolition:{legacy:LARE_STRATEGIES.demolition.id,requires:['destruction'],integrated:false},
  regeneration:{requires:['regeneration'],integrated:false},
});

export function describeSpatialStrategy(id, input) {
  if(!Object.hasOwn(SRE_STRATEGIES,id))throw Error('Unsupported spatial strategy.');
  const strategy=SRE_STRATEGIES[id],permissions=createSpatialPermissions(input);
  return Object.freeze({id,version:1,permitted:strategy.requires.every(key=>permissions[key]===true),
    integrated:strategy.integrated});
}

// Reuse authoritative existing checks, preserving their signatures.
// Additional domain-specific validators are not implicitly enabled here.
export function spatialConstraint(id) {
  if(!Object.hasOwn(LARE_CONSTRAINTS,id))throw Error('Unsupported spatial constraint.');
  return LARE_CONSTRAINTS[id];
}

// Interpret existing B1R policy without widening it. An eligible record
// still requires operation-specific permission, scope and full validation.
export function describeSpatialCapability(kind,policy,input) {
  const permissions=createSpatialPermissions(input);
  const eligible=policy?.provenance==='generated' &&
    ((kind==='property'&&policy.mode==='adaptive')||(kind==='building'&&policy.mode==='rigid'));
  if(!['property','building'].includes(kind))
    return Object.freeze({kind,eligible:false,adaptive:false,rigid:false,frontage:false,scaling:false,retirement:false,regeneration:false});
  return Object.freeze({kind,eligible,adaptive:eligible&&kind==='property',rigid:eligible&&kind==='building',
    frontage:eligible&&permissions.alternativeFrontage,scaling:eligible&&kind==='building'&&permissions.uniformScaling,
    retirement:eligible&&permissions.destruction,
    // Durable identity allocation is not yet proven.
    regeneration:false});
}
