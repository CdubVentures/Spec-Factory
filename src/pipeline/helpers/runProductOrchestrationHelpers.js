import { toFloat } from './typeHelpers.js';

function normalizeCategoryToken(value) {
  return String(value || '').trim().toLowerCase();
}

export function buildNeedSetIdentityCaps(config = {}) {
  return {
    locked: toFloat(config.needsetCapIdentityLocked, 1),
    provisional: toFloat(config.needsetCapIdentityProvisional, 0.74),
    conflict: toFloat(config.needsetCapIdentityConflict, 0.39),
    unlocked: toFloat(config.needsetCapIdentityUnlocked, 0.59),
  };
}

export async function loadEnabledSourceStrategyRows({ config = {}, category = '' } = {}) {
  const categoryToken = normalizeCategoryToken(category);
  if (!categoryToken) return [];
  let db = null;
  try {
    const { SpecDb } = await import('../../db/specDb.js');
    const dbPath = `${String(config.specDbDir || '.specfactory_tmp').replace(/[\\\/]+$/, '')}/${categoryToken}/spec.sqlite`;
    db = new SpecDb({ dbPath, category: categoryToken });
    return db.listEnabledSourceStrategies(categoryToken);
  } catch {
    return [];
  } finally {
    try { db?.close?.(); } catch { /* ignore */ }
  }
}
