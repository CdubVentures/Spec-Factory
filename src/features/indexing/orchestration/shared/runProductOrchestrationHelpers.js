import {
  readSourcesFile,
  listSourceEntries,
} from '../../sources/sourceFileService.js';

function normalizeCategoryToken(value) {
  return String(value || '').trim().toLowerCase();
}

export async function loadEnabledSourceEntries({ config = {}, category = '' } = {}) {
  const categoryToken = normalizeCategoryToken(category);
  if (!categoryToken) return [];
  try {
    const root = config.categoryAuthorityRoot || 'category_authority';
    const data = await readSourcesFile(root, categoryToken);
    return listSourceEntries(data)
      .filter((entry) => entry.discovery.enabled !== false);
  } catch {
    return [];
  }
}
