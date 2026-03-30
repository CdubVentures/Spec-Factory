export * from './orchestration/index.js';
export { runEnumConsistencyReview } from './validation/index.js';

// WHY: category_authority/sources.json ownership — indexing is the sole writer
export { readSourcesFile, writeSourcesFile } from './sources/sourceFileService.js';

export function getIndexingFeatureInfo() {
  return Object.freeze({
    feature: 'indexing',
    phase: 'phase-01-scaffold',
    entrypoint: 'src/features/indexing/index.js',
  });
}
