import fs from 'node:fs';
import path from 'node:path';

export const REPO_TMP_ROOT = path.resolve('.tmp');

export function makeRepoTempDir(prefix = 'spec-factory-') {
  fs.mkdirSync(REPO_TMP_ROOT, { recursive: true });
  return fs.mkdtempSync(path.join(REPO_TMP_ROOT, prefix));
}
