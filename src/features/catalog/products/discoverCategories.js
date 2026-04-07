import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * List local category directories (replaces S3-based discoverCategories).
 * Scans category_authority/ for subdirectories, filters out _ prefixed ones.
 */
export async function discoverCategoriesLocal(options = {}) {
  const root = options.categoryAuthorityRoot || 'category_authority';
  const rootPath = path.resolve(root);
  const cats = [];

  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('_')) {
        cats.push(e.name);
      }
    }
  } catch {}

  return cats.sort();
}
