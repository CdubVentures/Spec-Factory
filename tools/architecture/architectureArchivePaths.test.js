import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  getArchitectureScaleRefactorArchiveRoot,
  getArchitectureScaleRefactorArchivePath,
  getLegacyBoundaryMatrixPath,
  getLegacyBoundaryWaiversPath,
  getLegacyBackendGraphPath,
  getLegacyGuiGraphPath,
  getLegacyBoundaryReportPath,
  getRefreshedBoundaryReportPath,
  getRefreshedDependencyGraphPath,
} from './archivePaths.mjs';

test('architecture archive root lives under docs archive, not implementation', () => {
  assert.equal(
    getArchitectureScaleRefactorArchiveRoot(),
    path.resolve('docs', 'archive', 'architecture-scale-refactor-program-2026-03-04'),
  );
});

test('architecture archive derived paths resolve under the shared docs archive root', () => {
  const root = getArchitectureScaleRefactorArchiveRoot();

  assert.equal(
    getArchitectureScaleRefactorArchivePath('ARCHIVED.md'),
    path.join(root, 'ARCHIVED.md'),
  );
  assert.equal(
    getLegacyBoundaryMatrixPath(),
    path.join(root, 'archive', 'legacy-2026-03-06', 'phase-02-boundary-contracts', 'boundary-matrix.v1.json'),
  );
  assert.equal(
    getLegacyBoundaryWaiversPath(),
    path.join(root, 'archive', 'legacy-2026-03-06', 'phase-02-boundary-contracts', 'baseline-waivers.seed.json'),
  );
  assert.equal(
    getLegacyBackendGraphPath(),
    path.join(root, 'archive', 'legacy-2026-03-06', 'phase-01-baseline', 'dependency-graph.backend.json'),
  );
  assert.equal(
    getLegacyGuiGraphPath(),
    path.join(root, 'archive', 'legacy-2026-03-06', 'phase-01-baseline', 'dependency-graph.gui.json'),
  );
  assert.equal(
    getLegacyBoundaryReportPath(),
    path.join(root, 'archive', 'legacy-2026-03-06', 'phase-03-boundary-validation-report.json'),
  );
  assert.equal(
    getRefreshedDependencyGraphPath({ domain: 'backend', date: '2026-03-07' }),
    path.join(root, 'archive', 'phase-01-baseline-refresh-2026-03-07', 'dependency-graph.backend.json'),
  );
  assert.equal(
    getRefreshedBoundaryReportPath({ date: '2026-03-07' }),
    path.join(root, 'archive', 'phase-01-baseline-refresh-2026-03-07', 'phase-03-boundary-validation-report.live.json'),
  );
});
