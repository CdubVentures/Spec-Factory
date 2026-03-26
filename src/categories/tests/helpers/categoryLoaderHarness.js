import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function withTempCategoryRoots(prefix, runTest) {
  const previousCwd = process.cwd();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const helperRoot = path.join(root, 'category_authority');
  const categoriesRoot = path.join(root, 'categories');
  try {
    return await runTest({ root, helperRoot, categoriesRoot });
  } finally {
    const relativeCwd = path.relative(root, process.cwd());
    const cwdInsideRoot =
      relativeCwd === '' ||
      (!relativeCwd.startsWith('..') && !path.isAbsolute(relativeCwd));
    if (cwdInsideRoot) {
      process.chdir(previousCwd);
    }
    await fs.rm(root, { recursive: true, force: true });
  }
}
