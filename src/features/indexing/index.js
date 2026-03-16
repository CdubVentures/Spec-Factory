export * from './orchestration/index.js';
export { runEnumConsistencyReview } from './validation/index.js';

export function getIndexingFeatureInfo() {
  return Object.freeze({
    feature: 'indexing',
    phase: 'phase-01-scaffold',
    entrypoint: 'src/features/indexing/index.js',
  });
}
