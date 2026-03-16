import path from 'node:path';

const ARCHIVE_ROOT_SEGMENTS = ['docs', 'archive', 'architecture-scale-refactor-program-2026-03-04'];
const LEGACY_ARCHIVE_SEGMENTS = ['archive', 'legacy-2026-03-06'];

function getTodayToken() {
  return new Date().toISOString().slice(0, 10);
}

export function getArchitectureScaleRefactorArchiveRoot() {
  return path.resolve(...ARCHIVE_ROOT_SEGMENTS);
}

export function getArchitectureScaleRefactorArchivePath(...segments) {
  return path.join(getArchitectureScaleRefactorArchiveRoot(), ...segments);
}

export function getLegacyBoundaryMatrixPath() {
  return getArchitectureScaleRefactorArchivePath(
    ...LEGACY_ARCHIVE_SEGMENTS,
    'phase-02-boundary-contracts',
    'boundary-matrix.v1.json',
  );
}

export function getLegacyBoundaryWaiversPath() {
  return getArchitectureScaleRefactorArchivePath(
    ...LEGACY_ARCHIVE_SEGMENTS,
    'phase-02-boundary-contracts',
    'baseline-waivers.seed.json',
  );
}

export function getLegacyBackendGraphPath() {
  return getArchitectureScaleRefactorArchivePath(
    ...LEGACY_ARCHIVE_SEGMENTS,
    'phase-01-baseline',
    'dependency-graph.backend.json',
  );
}

export function getLegacyGuiGraphPath() {
  return getArchitectureScaleRefactorArchivePath(
    ...LEGACY_ARCHIVE_SEGMENTS,
    'phase-01-baseline',
    'dependency-graph.gui.json',
  );
}

export function getLegacyBoundaryReportPath() {
  return getArchitectureScaleRefactorArchivePath(
    ...LEGACY_ARCHIVE_SEGMENTS,
    'phase-03-boundary-validation-report.json',
  );
}

export function getRefreshedDependencyGraphPath({
  domain,
  date = getTodayToken(),
} = {}) {
  return getArchitectureScaleRefactorArchivePath(
    'archive',
    `phase-01-baseline-refresh-${date}`,
    `dependency-graph.${domain}.json`,
  );
}

export function getRefreshedBoundaryReportPath({
  date = getTodayToken(),
} = {}) {
  return getArchitectureScaleRefactorArchivePath(
    'archive',
    `phase-01-baseline-refresh-${date}`,
    'phase-03-boundary-validation-report.live.json',
  );
}
