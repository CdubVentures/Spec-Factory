export function shouldShowSearchProfileGateBadges(options = {}) {
  if (typeof options?.showGateBadges === 'boolean') {
    return options.showGateBadges;
  }
  return true;
}

function formatAliasWeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return `w:${numeric}`;
}

export function normalizeIdentityAliasEntries(identityAliases = []) {
  const rows = Array.isArray(identityAliases) ? identityAliases : [];
  const normalized = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (typeof row === 'string') {
      const alias = row.trim();
      if (!alias) continue;
      normalized.push({ key: `alias:${alias}:${i}`, label: alias });
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const alias = String(row.alias || '').trim();
    if (!alias) continue;
    const source = String(row.source || '').trim();
    const weight = formatAliasWeight(row.weight);
    const details = [source, weight].filter(Boolean);
    const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';
    normalized.push({
      key: `alias:${alias}:${source || 'na'}:${weight || 'na'}:${i}`,
      label: `${alias}${suffix}`,
    });
  }
  return normalized;
}
