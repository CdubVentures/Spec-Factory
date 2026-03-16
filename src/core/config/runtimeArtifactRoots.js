import os from 'node:os';
import path from 'node:path';

const DEFAULT_RUNTIME_ARTIFACT_DIR = 'spec-factory';

function defaultRuntimeArtifactRoot() {
  const tempRoot = String(os.tmpdir() || '').trim();
  if (!tempRoot) {
    return path.resolve(DEFAULT_RUNTIME_ARTIFACT_DIR);
  }
  return path.resolve(tempRoot, DEFAULT_RUNTIME_ARTIFACT_DIR);
}

export function defaultLocalOutputRoot() {
  return path.resolve(defaultRuntimeArtifactRoot(), 'output');
}

export function defaultIndexLabRoot() {
  return path.resolve(defaultRuntimeArtifactRoot(), 'indexlab');
}
