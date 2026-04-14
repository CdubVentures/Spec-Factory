/**
 * Operation Type Registry — SSOT for non-finder operation types.
 *
 * WHY: Finder modules (cef, pif) are defined in src/core/finder/finderModuleRegistry.js.
 * Non-finder types (pipeline, publisher-reconcile) were hardcoded in 2 UI files,
 * causing drift and O(n) scaling. This registry centralizes them. The codegen script
 * merges both sources into a single generated TypeScript map for the frontend.
 *
 * To add a new operation type: add one entry here, run codegen. Zero frontend edits.
 */

export const OPERATION_TYPES = Object.freeze([
  { type: 'pipeline',            label: 'PL',  chipStyle: 'sf-chip-info' },
  { type: 'publisher-reconcile', label: 'PUB', chipStyle: 'sf-chip-success' },
]);

export const OPERATION_TYPE_MAP = Object.freeze(
  Object.fromEntries(OPERATION_TYPES.map(t => [t.type, t]))
);
