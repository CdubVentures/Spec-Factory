import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export { loadConfig } from '../../../../../../config.js';
import {
  loadSourceRegistry,
  lookupSource,
  listSourcesByTier,
  fieldCoverageForHost,
  isConnectorOnly,
  isBlockedInSearch,
  registrySparsityReport,
  sourceEntrySchema,
  TIER_ENUM,
  TIER_TO_ROLE,
  checkCategoryPopulationHardGate,
} from '../../sourceRegistry.js';
export {
  loadSourceRegistry,
  lookupSource,
  listSourcesByTier,
  fieldCoverageForHost,
  isConnectorOnly,
  isBlockedInSearch,
  registrySparsityReport,
  sourceEntrySchema,
  TIER_ENUM,
  TIER_TO_ROLE,
  checkCategoryPopulationHardGate,
};
export { parseHost, normalizeHost, isValidDomain } from '../../hostParser.js';

// Shared category loaders and registry builders for sourceRegistryPhase02 slices.

export function loadCategoryRaw(category) {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'category_authority', category, 'sources.json'), 'utf8')
  );
}

export function loadMouseRaw() { return loadCategoryRaw('mouse'); }
export function loadKeyboardRaw() { return loadCategoryRaw('keyboard'); }
export function loadMonitorRaw() { return loadCategoryRaw('monitor'); }

export function buildMouseRegistry() { return loadSourceRegistry('mouse', loadMouseRaw()).registry; }
export function buildKeyboardRegistry() { return loadSourceRegistry('keyboard', loadKeyboardRaw()).registry; }
export function buildMonitorRegistry() { return loadSourceRegistry('monitor', loadMonitorRaw()).registry; }
