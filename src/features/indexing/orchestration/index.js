const FEATURE_INFO = Object.freeze({
  feature: 'indexing-orchestration',
  phase: 'd1-1-scaffold',
  entrypoint: 'src/features/indexing/orchestration/index.js',
});

export function getIndexingOrchestrationFeatureInfo() {
  return FEATURE_INFO;
}

export * from './bootstrap/index.js';
export * from '../pipeline/orchestration/index.js';
export * from './shared/index.js';
