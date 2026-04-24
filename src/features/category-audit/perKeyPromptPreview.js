/**
 * Per-key prompt preview composer.
 *
 * Wraps the live keyFinder prompt builder with a placeholder product so a
 * per-key audit doc can show the exact text the LLM would receive when
 * targeting this field. No specDb, no real product, no LLM call.
 *
 * Exports:
 *   - composePerKeyPromptPreview(fieldRule, fieldKey, opts) → PerKeyPreview
 *   - detectReservedKey(fieldKey) → { reserved, fieldKey, owner, ownerLabel } | null
 */

import { isReservedFieldKey } from '../../core/finder/finderExclusions.js';
import { getFinderModuleForField } from '../../core/finder/finderModuleRegistry.js';
import { buildKeyFinderPrompt } from '../key/keyLlmAdapter.js';
import { renderKeyFinderPreview } from './adapters/keyFinderAdapter.js';

// EG_LOCKED_KEYS are compile-time defaults, not owned by any finder module.
// When `getFinderModuleForField` returns null we still want to flag them,
// so this list attributes them to the EG preset layer.
const EG_LOCKED_OWNERS = {
  colors: { owner: 'colorEditionFinder', ownerLabel: 'CEF' },
  editions: { owner: 'colorEditionFinder', ownerLabel: 'CEF' },
  release_date: { owner: 'releaseDateFinder', ownerLabel: 'RDF' },
  sku: { owner: 'skuFinder', ownerLabel: 'SKF' },
};

const PLACEHOLDER_PRODUCT = Object.freeze({ brand: '<BRAND>', model: '<MODEL>' });

/**
 * Returns null when the field is NOT reserved. When reserved, returns
 * `{ reserved: true, fieldKey, owner, ownerLabel }` where owner is the
 * finder module id and ownerLabel is the short label (e.g. "CEF").
 */
export function detectReservedKey(fieldKey) {
  if (!fieldKey || typeof fieldKey !== 'string') return null;
  if (!isReservedFieldKey(fieldKey)) return null;
  // Prefer FINDER_MODULES registry lookup so any future reserved key picks up
  // ownership automatically. Fall back to EG_LOCKED_OWNERS for the four EG
  // preset-locked keys that don't list themselves in FINDER_MODULES.fieldKeys.
  const mod = getFinderModuleForField(fieldKey);
  if (mod) {
    return {
      reserved: true,
      fieldKey,
      owner: mod.id,
      ownerLabel: String(mod.moduleLabel || mod.id),
    };
  }
  const preset = EG_LOCKED_OWNERS[fieldKey];
  if (preset) {
    return { reserved: true, fieldKey, ...preset };
  }
  return { reserved: true, fieldKey, owner: 'other_finder', ownerLabel: 'OTHER' };
}

/**
 * @param {object} fieldRule            — compiled rule
 * @param {string} fieldKey
 * @param {object} [opts]
 * @param {string} [opts.category]
 * @param {object} [opts.tierBundles]   — parsed keyFinderTierSettingsJson
 * @param {string} [opts.templateOverride]
 * @param {{type: string, relation: 'parent'|'subfield_of'}|null} [opts.componentRelation]
 * @param {object|null} [opts.knownValues]
 * @returns {{
 *   reserved: boolean,
 *   owner: string,
 *   ownerLabel: string,
 *   systemPrompt: string,
 *   slotRendering: object|null,
 *   tierBundle: object|null,
 * }}
 */
export function composePerKeyPromptPreview(fieldRule, fieldKey, {
  category = '',
  tierBundles = {},
  templateOverride = '',
  componentRelation = null,
  knownValues = null,
} = {}) {
  const reserved = detectReservedKey(fieldKey);
  if (reserved) {
    return {
      reserved: true,
      owner: reserved.owner,
      ownerLabel: reserved.ownerLabel,
      systemPrompt: '',
      slotRendering: null,
      tierBundle: null,
    };
  }

  const slotRendering = renderKeyFinderPreview(fieldRule, fieldKey, {
    tierBundles,
    searchHintsEnabled: true,
    componentInjectionEnabled: true,
    knownValues,
  });

  const componentContext = componentRelation && componentRelation.type
    ? {
      primary: { type: componentRelation.type, relation: componentRelation.relation || 'subfield_of' },
      passengers: [],
    }
    : { primary: null, passengers: [] };

  const systemPrompt = buildKeyFinderPrompt({
    product: { brand: PLACEHOLDER_PRODUCT.brand, model: PLACEHOLDER_PRODUCT.model, category },
    primary: { fieldKey, fieldRule },
    passengers: [],
    knownValues,
    knownFields: {},
    componentContext,
    productComponents: [],
    injectionKnobs: {
      componentInjectionEnabled: true,
      knownFieldsInjectionEnabled: true,
      searchHintsInjectionEnabled: true,
    },
    category,
    variantCount: 1,
    familyModelCount: 1,
    siblingsExcluded: [],
    ambiguityLevel: 'easy',
    previousDiscovery: { urlsChecked: [], queriesRun: [] },
    templateOverride,
  });

  return {
    reserved: false,
    owner: '',
    ownerLabel: '',
    systemPrompt,
    slotRendering,
    tierBundle: slotRendering.tierBundle,
  };
}

// Re-export finder-exclusion helper so consumers have one import for reserved
// detection and can avoid reaching into core/finder directly.
export { isReservedFieldKey, getFinderModuleForField };
