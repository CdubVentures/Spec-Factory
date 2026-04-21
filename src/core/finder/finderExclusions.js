// Reserved-keys denylist for the Universal Key Finder.
// Keys owned by another finder (CEF, PIF, RDF, SKF) or locked to the EG preset
// registry must not be handled by keyFinder — they have bespoke extraction paths.
// Derived from FINDER_MODULES so new finders / fieldKeys auto-register here.

import { FINDER_MODULES } from './finderModuleRegistry.js';

// WHY: EG_PRESET_REGISTRY (src/features/studio/contracts/egPresets.js) locks
// these four keys to compiler-injected defaults. Enumerated here to avoid a
// cross-feature import; the list is small and tied to a locked product decision.
export const EG_LOCKED_KEYS = Object.freeze(['colors', 'editions', 'release_date', 'sku']);

export function getReservedFieldKeys() {
  const reserved = new Set(EG_LOCKED_KEYS);
  for (const mod of FINDER_MODULES) {
    if (mod.id === 'keyFinder') continue;
    for (const k of mod.fieldKeys || []) reserved.add(k);
  }
  return reserved;
}

export function isReservedFieldKey(fieldKey) {
  if (!fieldKey || typeof fieldKey !== 'string') return false;
  return getReservedFieldKeys().has(fieldKey);
}
