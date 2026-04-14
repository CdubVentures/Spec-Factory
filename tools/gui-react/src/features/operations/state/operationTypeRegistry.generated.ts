// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

// WHY: Derived from src/core/finder/finderModuleRegistry.js + src/core/operations/operationTypeRegistry.js
// Complete map of all operation types. Zero hardcoded entries in UI components.

export type OperationType =
  | 'cef'
  | 'pif'
  | 'pipeline'
  | 'publisher-reconcile';

export const MODULE_STYLES: Readonly<Record<string, string>> = {
  'cef': 'sf-chip-accent',
  'pif': 'sf-chip-info',
  'pipeline': 'sf-chip-info',
  'publisher-reconcile': 'sf-chip-success',
};

export const MODULE_LABELS: Readonly<Record<string, string>> = {
  'cef': 'CEF',
  'pif': 'PIF',
  'pipeline': 'PL',
  'publisher-reconcile': 'PUB',
};
