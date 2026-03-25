// WHY: Canonical home moved to src/shared/hostParser.js to eliminate
// upward dependency violations (shared/, categories/, pipeline/, intel/,
// planner/, review/ all imported from features/indexing/).
// Re-exported here so internal indexing consumers keep working.

export {
  parseHost,
  normalizeHost,
  isSubdomainOf,
  hostMatchesDomain,
  isValidDomain,
} from '../../../../shared/hostParser.js';
