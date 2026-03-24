import { COMPONENT_VALUE_BOOLEAN_KEYS } from '../specDbSchema.js';
import { hydrateRow, hydrateRows } from '../specDbHelpers.js';

/**
 * Component store — extracted from SpecDb.
 * Owns: component_identity, component_aliases, component_values tables.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createComponentStore({ db, category, stmts }) {
  function upsertComponentIdentity({ componentType, canonicalName, maker, links, source }) {
    stmts._upsertComponentIdentity.run({
      category,
      component_type: componentType,
      canonical_name: canonicalName,
      maker: maker || '',
      links: Array.isArray(links) ? JSON.stringify(links) : (links ?? null),
      source: source || 'component_db'
    });
    return db
      .prepare('SELECT id FROM component_identity WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?')
      .get(category, componentType, canonicalName, maker || '') || null;
  }

  function insertAlias(componentId, alias, source) {
    stmts._insertAlias.run({
      component_id: componentId,
      alias,
      source: source || 'component_db'
    });
  }

  function upsertComponentValue({
    componentType, componentName, componentMaker, componentIdentityId,
    propertyKey, value, confidence, variancePolicy, source,
    acceptedCandidateId, needsReview, overridden, constraints,
  }) {
    const normalizedMaker = componentMaker || '';
    const resolvedIdentityId = Number(componentIdentityId) > 0
      ? Number(componentIdentityId)
      : (upsertComponentIdentity({
        componentType,
        canonicalName: componentName,
        maker: normalizedMaker,
        links: null,
        source: source || 'component_db',
      })?.id ?? null);
    stmts._upsertComponentValue.run({
      category,
      component_type: componentType,
      component_name: componentName,
      component_maker: normalizedMaker,
      component_identity_id: resolvedIdentityId,
      property_key: propertyKey,
      value: value != null ? String(value) : null,
      confidence: confidence ?? 1.0,
      variance_policy: variancePolicy ?? null,
      source: source || 'component_db',
      accepted_candidate_id: acceptedCandidateId ?? null,
      needs_review: needsReview ? 1 : 0,
      overridden: overridden ? 1 : 0,
      constraints: Array.isArray(constraints) ? JSON.stringify(constraints) : (constraints ?? null)
    });
  }

  function getComponentValues(componentType, componentName) {
    return hydrateRows(COMPONENT_VALUE_BOOLEAN_KEYS, db
      .prepare('SELECT * FROM component_values WHERE category = ? AND component_type = ? AND component_name = ?')
      .all(category, componentType, componentName));
  }

  function getAllComponentIdentities(componentType) {
    return db
      .prepare('SELECT * FROM component_identity WHERE category = ? AND component_type = ?')
      .all(category, componentType);
  }

  function getComponentIdentity(componentType, canonicalName, maker = '') {
    return db
      .prepare('SELECT * FROM component_identity WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?')
      .get(category, componentType, canonicalName, maker || '') || null;
  }

  function getComponentIdentityById(identityId) {
    const id = Number(identityId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return db
      .prepare('SELECT * FROM component_identity WHERE category = ? AND id = ?')
      .get(category, id) || null;
  }

  function findComponentByAlias(componentType, alias) {
    return db.prepare(`
      SELECT ci.* FROM component_identity ci
      JOIN component_aliases ca ON ca.component_id = ci.id
      WHERE ci.category = ? AND ci.component_type = ? AND ca.alias = ?
    `).get(category, componentType, alias) || null;
  }

  function backfillComponentIdentityIds() {
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO component_identity (category, component_type, canonical_name, maker, source)
        SELECT DISTINCT
          cv.category,
          cv.component_type,
          cv.component_name,
          COALESCE(cv.component_maker, ''),
          COALESCE(NULLIF(cv.source, ''), 'backfill')
        FROM component_values cv
        LEFT JOIN component_identity ci
          ON ci.category = cv.category
         AND ci.component_type = cv.component_type
         AND ci.canonical_name = cv.component_name
         AND ci.maker = COALESCE(cv.component_maker, '')
        WHERE ci.id IS NULL
        ON CONFLICT(category, component_type, canonical_name, maker) DO NOTHING
      `).run();

      db.prepare(`
        UPDATE component_values
        SET component_identity_id = (
          SELECT ci.id
          FROM component_identity ci
          WHERE ci.category = component_values.category
            AND ci.component_type = component_values.component_type
            AND ci.canonical_name = component_values.component_name
            AND ci.maker = COALESCE(component_values.component_maker, '')
          LIMIT 1
        ),
        updated_at = datetime('now')
        WHERE component_identity_id IS NULL
      `).run();
    });
    tx();
  }

  function getComponentTypeList() {
    return db
      .prepare('SELECT component_type, COUNT(*) as item_count FROM component_identity WHERE category = ? GROUP BY component_type')
      .all(category);
  }

  function getPropertyColumnsForType(componentType) {
    return db
      .prepare('SELECT DISTINCT property_key FROM component_values WHERE category = ? AND component_type = ? ORDER BY property_key')
      .all(category, componentType)
      .map(r => r.property_key);
  }

  function getAllComponentsForType(componentType) {
    const identities = db
      .prepare('SELECT * FROM component_identity WHERE category = ? AND component_type = ?')
      .all(category, componentType);

    const result = [];
    for (const identity of identities) {
      const aliases = db
        .prepare('SELECT alias, source FROM component_aliases WHERE component_id = ?')
        .all(identity.id);
      const properties = hydrateRows(COMPONENT_VALUE_BOOLEAN_KEYS, db
        .prepare('SELECT * FROM component_values WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?')
        .all(category, componentType, identity.canonical_name, identity.maker || ''));
      result.push({ identity, aliases, properties });
    }
    return result;
  }

  function getComponentValuesWithMaker(componentType, componentName, componentMaker) {
    return hydrateRows(COMPONENT_VALUE_BOOLEAN_KEYS, db
      .prepare('SELECT * FROM component_values WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?')
      .all(category, componentType, componentName, componentMaker || ''));
  }

  function getComponentValueById(componentValueId) {
    const id = Number(componentValueId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return hydrateRow(COMPONENT_VALUE_BOOLEAN_KEYS, db
      .prepare('SELECT * FROM component_values WHERE category = ? AND id = ?')
      .get(category, id)) || null;
  }

  function updateComponentReviewStatus(componentType, componentName, componentMaker, status) {
    db
      .prepare(`UPDATE component_identity SET review_status = ?, updated_at = datetime('now')
                WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?`)
      .run(status, category, componentType, componentName, componentMaker || '');
  }

  function updateAliasesOverridden(componentType, componentName, componentMaker, overridden) {
    db
      .prepare(`UPDATE component_identity SET aliases_overridden = ?, updated_at = datetime('now')
                WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?`)
      .run(overridden ? 1 : 0, category, componentType, componentName, componentMaker || '');
  }

  function mergeComponentIdentities({ sourceId, targetId }) {
    const source = db.prepare('SELECT * FROM component_identity WHERE id = ? AND category = ?').get(sourceId, category);
    const target = db.prepare('SELECT * FROM component_identity WHERE id = ? AND category = ?').get(targetId, category);
    if (!source || !target) return;

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE item_component_links
        SET component_name = ?, component_maker = ?, updated_at = datetime('now')
        WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?
          AND NOT EXISTS (
            SELECT 1 FROM item_component_links t
            WHERE t.category = item_component_links.category
              AND t.product_id = item_component_links.product_id
              AND t.field_key = item_component_links.field_key
              AND t.component_type = ?
              AND t.component_name = ?
              AND t.component_maker = ?
          )
      `).run(
        target.canonical_name, target.maker,
        category, source.component_type, source.canonical_name, source.maker,
        target.component_type, target.canonical_name, target.maker
      );
      db.prepare(`
        DELETE FROM item_component_links
        WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?
      `).run(category, source.component_type, source.canonical_name, source.maker);

      const sourceValues = db.prepare(
        'SELECT * FROM component_values WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?'
      ).all(category, source.component_type, source.canonical_name, source.maker);
      for (const sv of sourceValues) {
        const targetHas = db.prepare(
          'SELECT id FROM component_values WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ? AND property_key = ?'
        ).get(category, target.component_type, target.canonical_name, target.maker, sv.property_key);
        if (targetHas) {
          db.prepare('DELETE FROM component_values WHERE id = ?').run(sv.id);
        } else {
          db.prepare(`
            UPDATE component_values
            SET component_name = ?, component_maker = ?, component_identity_id = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(target.canonical_name, target.maker, targetId, sv.id);
        }
      }

      const sourceAliases = db.prepare(
        'SELECT * FROM component_aliases WHERE component_id = ?'
      ).all(sourceId);
      for (const sa of sourceAliases) {
        const targetHas = db.prepare(
          'SELECT id FROM component_aliases WHERE component_id = ? AND alias = ?'
        ).get(targetId, sa.alias);
        if (targetHas) {
          db.prepare('DELETE FROM component_aliases WHERE id = ?').run(sa.id);
        } else {
          db.prepare(
            'UPDATE component_aliases SET component_id = ? WHERE id = ?'
          ).run(targetId, sa.id);
        }
      }

      const sourceIdentifier = `${source.component_type}::${source.canonical_name}::${source.maker}`;
      const targetIdentifier = `${target.component_type}::${target.canonical_name}::${target.maker}`;

      const sourceKrs = db.prepare(
        "SELECT * FROM key_review_state WHERE category = ? AND target_kind = 'component_key' AND component_identifier = ?"
      ).all(category, sourceIdentifier);

      const STATUS_RANK = { confirmed: 3, accepted: 2, pending: 1 };
      for (const sk of sourceKrs) {
        const targetKrs = db.prepare(
          "SELECT * FROM key_review_state WHERE category = ? AND target_kind = 'component_key' AND component_identifier = ? AND property_key = ?"
        ).get(category, targetIdentifier, sk.property_key);

        if (targetKrs) {
          const sourceRank = STATUS_RANK[sk.ai_confirm_shared_status] || 0;
          const targetRank = STATUS_RANK[targetKrs.ai_confirm_shared_status] || 0;
          if (sourceRank > targetRank) {
            db.prepare(`
              UPDATE key_review_state
              SET ai_confirm_shared_status = ?, ai_confirm_shared_confidence = ?,
                  selected_value = COALESCE(?, selected_value),
                  selected_candidate_id = COALESCE(?, selected_candidate_id),
                  updated_at = datetime('now')
              WHERE id = ?
            `).run(
              sk.ai_confirm_shared_status, sk.ai_confirm_shared_confidence,
              sk.selected_value, sk.selected_candidate_id,
              targetKrs.id
            );
          }
          db.prepare('DELETE FROM key_review_state WHERE id = ?').run(sk.id);
        } else {
          db.prepare(`
            UPDATE key_review_state
            SET component_identifier = ?, component_identity_id = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(targetIdentifier, targetId, sk.id);
        }
      }

      db.prepare('DELETE FROM component_identity WHERE id = ? AND category = ?').run(sourceId, category);
    });
    tx();
  }

  return {
    upsertComponentIdentity,
    insertAlias,
    upsertComponentValue,
    getComponentValues,
    getAllComponentIdentities,
    getComponentIdentity,
    getComponentIdentityById,
    findComponentByAlias,
    backfillComponentIdentityIds,
    getComponentTypeList,
    getPropertyColumnsForType,
    getAllComponentsForType,
    getComponentValuesWithMaker,
    getComponentValueById,
    updateComponentReviewStatus,
    updateAliasesOverridden,
    mergeComponentIdentities,
  };
}
