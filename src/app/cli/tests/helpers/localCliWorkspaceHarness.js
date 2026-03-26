import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

export async function createLocalCliWorkspace(testContext, prefix) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), prefix));

  testContext.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const inputRoot = path.join(tempRoot, 'fixtures');
  const outputRoot = path.join(tempRoot, 'out');
  const importsRoot = path.join(tempRoot, 'imports');
  const helperRoot = path.join(tempRoot, 'category_authority');

  return {
    tempRoot,
    inputRoot,
    outputRoot,
    importsRoot,
    helperRoot,
    localArgs() {
      return [
        '--local',
        '--output-mode', 'local',
        '--local-input-root', inputRoot,
        '--local-output-root', outputRoot,
        '--imports-root', importsRoot,
      ];
    },
  };
}
