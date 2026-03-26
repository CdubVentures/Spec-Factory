// WHY: Public API barrel for extraction feature.
// Pipeline layer imports from here — never from internals.

export { createExtractionRunner } from './core/extractionRunner.js';
export { resolveExtractionPlugins, resolveAllExtractionPlugins, EXTRACTION_PLUGIN_REGISTRY } from './plugins/pluginRegistry.js';
