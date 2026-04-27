function safeParseJson(value, fallback) {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeCategory(value, fallback) {
  return String(value || fallback || '').trim().toLowerCase();
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function createSourceStrategyStore({ db, category, stmts }) {
  const replaceDocumentTx = db.transaction((doc) => {
    const targetCategory = normalizeCategory(doc?.category, category);
    const sources = asRecord(doc?.sources);
    stmts._deleteSourceStrategyEntries.run(targetCategory);
    stmts._upsertSourceStrategyMeta.run({
      category: targetCategory,
      version: String(doc?.version || '1.0.0'),
      approved_json: JSON.stringify(asRecord(doc?.approved)),
      denylist_json: JSON.stringify(Array.isArray(doc?.denylist) ? doc.denylist : []),
    });
    for (const [sourceId, entry] of Object.entries(sources)) {
      stmts._upsertSourceStrategyEntry.run({
        category: targetCategory,
        source_id: sourceId,
        entry_json: JSON.stringify(asRecord(entry)),
      });
    }
  });

  function hasSourceStrategyDocument(targetCategory = category) {
    const categoryToken = normalizeCategory(targetCategory, category);
    const meta = stmts._getSourceStrategyMeta.get(categoryToken);
    if (meta) return true;
    return stmts._countSourceStrategyEntries.get(categoryToken).count > 0;
  }

  function getSourceStrategyDocument(targetCategory = category) {
    const categoryToken = normalizeCategory(targetCategory, category);
    const meta = stmts._getSourceStrategyMeta.get(categoryToken);
    const rows = stmts._listSourceStrategyEntries.all(categoryToken);
    if (!meta && rows.length === 0) return null;
    const sources = {};
    for (const row of rows) {
      sources[row.source_id] = safeParseJson(row.entry_json, {});
    }
    return {
      category: categoryToken,
      version: String(meta?.version || '1.0.0'),
      approved: safeParseJson(meta?.approved_json, {}),
      denylist: safeParseJson(meta?.denylist_json, []),
      sources,
    };
  }

  function replaceSourceStrategyDocument(doc, targetCategory = category) {
    const categoryToken = normalizeCategory(targetCategory, doc?.category || category);
    replaceDocumentTx({ ...asRecord(doc), category: categoryToken });
    return getSourceStrategyDocument(categoryToken);
  }

  return {
    getSourceStrategyDocument,
    hasSourceStrategyDocument,
    replaceSourceStrategyDocument,
  };
}
