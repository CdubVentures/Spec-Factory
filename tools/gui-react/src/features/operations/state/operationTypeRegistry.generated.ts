// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

// WHY: Derived from src/core/finder/finderModuleRegistry.js + src/core/operations/operationTypeRegistry.js
// Complete map of all operation types. Zero hardcoded entries in UI components.

export type OperationType =
  | 'cef'
  | 'pif'
  | 'rdf'
  | 'skf'
  | 'pipeline'
  | 'publisher-reconcile'
  | 'compile'
  | 'validate';

export const MODULE_STYLES: Readonly<Record<string, string>> = {
  'cef': 'sf-chip-accent',
  'pif': 'sf-chip-info',
  'rdf': 'sf-chip-warning',
  'skf': 'sf-chip-success',
  'pipeline': 'sf-chip-info',
  'publisher-reconcile': 'sf-chip-success',
  'compile': 'sf-chip-success',
  'validate': 'sf-chip-neutral',
};

export const MODULE_LABELS: Readonly<Record<string, string>> = {
  'cef': 'CEF',
  'pif': 'PIF',
  'rdf': 'RDF',
  'skf': 'SKF',
  'pipeline': 'PL',
  'publisher-reconcile': 'PUB',
  'compile': 'CMP',
  'validate': 'VAL',
};
