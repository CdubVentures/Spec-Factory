export * from './orchestration/index.js';

// WHY: indexing owns source-strategy runtime projection plus JSON rebuild mirror.
export {
  readSourcesFile,
  writeSourcesFile,
  readSourcesDocument,
  writeSourcesDocument,
} from './sources/sourceFileService.js';

export function getIndexingFeatureInfo() {
  return Object.freeze({
    feature: 'indexing',
    phase: 'phase-01-scaffold',
    entrypoint: 'src/features/indexing/index.js',
  });
}
