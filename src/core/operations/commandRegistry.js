/**
 * Command Registry — O(1) SSOT for all in-process command types.
 *
 * WHY: Adding a new command = one entry here + one in operationTypeRegistry.js.
 * Zero changes to the executor, operations tracker, frontend store, or UI gating.
 *
 * Each entry declares everything the executor needs: handler module, stages,
 * concurrency rules, and optional post-completion hooks.
 */

export const COMMAND_REGISTRY = Object.freeze([
  {
    type: 'compile',
    executionMode: 'in-process',
    stages: ['Compile', 'Sync'],
    mutatesCategory: true,
    handlerModule: '../../field-rules/compiler.js',
    handlerExport: 'compileRules',
    postCompleteModule: '../../app/api/services/compileProcessCompletion.js',
    postCompleteExport: 'handleCompilePostComplete',
  },
  {
    type: 'validate',
    executionMode: 'in-process',
    stages: ['Validate'],
    mutatesCategory: false,
    handlerModule: '../../field-rules/compiler.js',
    handlerExport: 'validateRules',
    postCompleteModule: null,
    postCompleteExport: null,
  },
]);

export const COMMAND_REGISTRY_MAP = Object.freeze(
  Object.fromEntries(COMMAND_REGISTRY.map(entry => [entry.type, entry]))
);
