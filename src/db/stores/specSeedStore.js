function normalizeCategory(value, fallback) {
  return String(value || fallback || '').trim().toLowerCase();
}

export function createSpecSeedStore({ db, category, stmts }) {
  const replaceTemplatesTx = db.transaction((targetCategory, seeds) => {
    stmts._deleteSpecSeedTemplates.run(targetCategory);
    stmts._upsertSpecSeedSet.run(targetCategory);
    for (let index = 0; index < seeds.length; index += 1) {
      stmts._insertSpecSeedTemplate.run({
        category: targetCategory,
        position: index,
        template: seeds[index],
      });
    }
  });

  function hasSpecSeedTemplates(targetCategory = category) {
    const categoryToken = normalizeCategory(targetCategory, category);
    return Boolean(stmts._getSpecSeedSet.get(categoryToken));
  }

  function listSpecSeedTemplates(targetCategory = category) {
    const categoryToken = normalizeCategory(targetCategory, category);
    return stmts._listSpecSeedTemplates.all(categoryToken).map((row) => row.template);
  }

  function replaceSpecSeedTemplates(seeds, targetCategory = category) {
    if (!Array.isArray(seeds)) throw new TypeError('spec seeds must be an array');
    const categoryToken = normalizeCategory(targetCategory, category);
    replaceTemplatesTx(categoryToken, seeds.map((seed) => String(seed)));
    return listSpecSeedTemplates(categoryToken);
  }

  return {
    hasSpecSeedTemplates,
    listSpecSeedTemplates,
    replaceSpecSeedTemplates,
  };
}
