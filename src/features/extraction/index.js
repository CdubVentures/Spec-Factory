// WHY: Public API barrel for extraction feature.
// Pipeline layer imports from here — never from internals.

export { createExtractionRunner } from './core/extractionRunner.js';
export { resolveExtractionPlugins, resolveAllExtractionPlugins, resolvePluginsByPhase, EXTRACTION_PLUGIN_REGISTRY } from './plugins/pluginRegistry.js';
export { captureScreenshots } from './plugins/screenshot/screenshotCapture.js';
export { persistScreenshotArtifacts } from './plugins/screenshot/screenshotArtifactPersister.js';
export { persistVideoArtifact } from './plugins/video/videoArtifactPersister.js';
export { persistHtmlArtifact } from './plugins/html/htmlArtifactPersister.js';
export { createCrawl4aiClient } from './plugins/crawl4ai/crawl4aiClient.js';
export { persistCrawl4aiArtifact } from './plugins/crawl4ai/crawl4aiArtifactPersister.js';
