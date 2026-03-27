// WHY: Centralized bulk purge operations for test-mode category/product cleanup.
// Moves raw SQL out of reviewGridStateRuntime.js into the DB boundary.
// All operations use cascading deletes in referential integrity order.

/**
 * @param {{ db: import('better-sqlite3').Database, category: string }} deps
 */
export function createPurgeStore({ db, category: defaultCategory }) {

  function deleteKeyReviewStatesByTargetKinds(category, targetKinds) {
    if (!targetKinds?.length) return 0;
    const cat = String(category || defaultCategory || '').trim();
    if (!cat) return 0;
    const placeholders = targetKinds.map(() => '?').join(',');
    const ids = db.prepare(`
      SELECT id FROM key_review_state
      WHERE category = ? AND target_kind IN (${placeholders})
    `).all(cat, ...targetKinds).map((row) => row.id);
    if (!ids.length) return 0;
    const idPlaceholders = ids.map(() => '?').join(',');
    // WHY: Cascade key_review_runs → key_review_run_sources → key_review_audit before state
    db.prepare(`DELETE FROM key_review_run_sources WHERE source_id IN (SELECT source_id FROM key_review_runs WHERE state_id IN (${idPlaceholders}))`).run(...ids);
    db.prepare(`DELETE FROM key_review_runs WHERE state_id IN (${idPlaceholders})`).run(...ids);
    db.prepare(`DELETE FROM key_review_audit WHERE state_id IN (${idPlaceholders})`).run(...ids);
    return db.prepare(`DELETE FROM key_review_state WHERE id IN (${idPlaceholders})`).run(...ids).changes;
  }

  function deleteKeyReviewStatesByProductAndKind(category, productId, targetKind) {
    const cat = String(category || defaultCategory || '').trim();
    const pid = String(productId || '').trim();
    if (!cat || !pid) return 0;
    const ids = db.prepare(`
      SELECT id FROM key_review_state
      WHERE category = ? AND target_kind = ? AND item_identifier = ?
    `).all(cat, targetKind, pid).map((row) => row.id);
    if (!ids.length) return 0;
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM key_review_run_sources WHERE source_id IN (SELECT source_id FROM key_review_runs WHERE state_id IN (${placeholders}))`).run(...ids);
    db.prepare(`DELETE FROM key_review_runs WHERE state_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM key_review_audit WHERE state_id IN (${placeholders})`).run(...ids);
    return db.prepare(`DELETE FROM key_review_state WHERE id IN (${placeholders})`).run(...ids).changes;
  }

  function deleteSourcesByCategory(cat, sourceIds) {
    if (!sourceIds?.length) return 0;
    let cleared = 0;
    const placeholders = sourceIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM key_review_run_sources WHERE assertion_id IN (SELECT assertion_id FROM source_assertions WHERE source_id IN (${placeholders}))`).run(...sourceIds);
    db.prepare(`DELETE FROM source_evidence_refs WHERE assertion_id IN (SELECT assertion_id FROM source_assertions WHERE source_id IN (${placeholders}))`).run(...sourceIds);
    cleared += db.prepare(`DELETE FROM source_assertions WHERE source_id IN (${placeholders})`).run(...sourceIds).changes;
    db.prepare(`DELETE FROM source_artifacts WHERE source_id IN (${placeholders})`).run(...sourceIds);
    cleared += db.prepare(`DELETE FROM source_registry WHERE source_id IN (${placeholders})`).run(...sourceIds).changes;
    return cleared;
  }

  function deleteSourcesByItemFieldStates(itemFieldStateIds) {
    if (!itemFieldStateIds?.length) return 0;
    let cleared = 0;
    const placeholders = itemFieldStateIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM source_evidence_refs WHERE assertion_id IN (SELECT assertion_id FROM source_assertions WHERE item_field_state_id IN (${placeholders}))`).run(...itemFieldStateIds);
    cleared += db.prepare(`DELETE FROM source_assertions WHERE item_field_state_id IN (${placeholders})`).run(...itemFieldStateIds).changes;
    return cleared;
  }

  function deleteCandidatesByItemFieldStates(itemFieldStateIds) {
    if (!itemFieldStateIds?.length) return 0;
    const placeholders = itemFieldStateIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM candidate_reviews WHERE candidate_id IN (SELECT candidate_id FROM candidates WHERE item_field_state_id IN (${placeholders}))`).run(...itemFieldStateIds);
    return db.prepare(`DELETE FROM candidates WHERE item_field_state_id IN (${placeholders})`).run(...itemFieldStateIds).changes;
  }

  function purgeCategoryState(category) {
    const cat = String(category || '').trim();
    if (!cat || !cat.startsWith('_test_')) {
      return { clearedKeyReview: 0, clearedSources: 0, clearedCandidates: 0, clearedFieldState: 0, clearedComponentData: 0, clearedEnumData: 0, clearedCatalogState: 0, clearedArtifacts: 0 };
    }

    let clearedKeyReview = 0, clearedSources = 0, clearedCandidates = 0, clearedFieldState = 0;
    let clearedComponentData = 0, clearedEnumData = 0, clearedCatalogState = 0, clearedArtifacts = 0;

    const tx = db.transaction(() => {
      // Key review
      const keyReviewIds = db.prepare('SELECT id FROM key_review_state WHERE category = ?').all(cat).map((r) => r.id);
      if (keyReviewIds.length > 0) {
        const ph = keyReviewIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM key_review_run_sources WHERE source_id IN (SELECT source_id FROM key_review_runs WHERE state_id IN (${ph}))`).run(...keyReviewIds);
        db.prepare(`DELETE FROM key_review_runs WHERE state_id IN (${ph})`).run(...keyReviewIds);
        db.prepare(`DELETE FROM key_review_audit WHERE state_id IN (${ph})`).run(...keyReviewIds);
        clearedKeyReview = db.prepare(`DELETE FROM key_review_state WHERE id IN (${ph})`).run(...keyReviewIds).changes;
      }

      // Sources
      const sourceIds = db.prepare('SELECT source_id FROM source_registry WHERE category = ?').all(cat).map((r) => String(r.source_id || '').trim()).filter(Boolean);
      if (sourceIds.length > 0) {
        clearedSources = deleteSourcesByCategory(cat, sourceIds);
      }

      // Candidates
      db.prepare(`DELETE FROM candidate_reviews WHERE candidate_id IN (SELECT candidate_id FROM candidates WHERE category = ?)`).run(cat);
      db.prepare('DELETE FROM item_list_links WHERE category = ?').run(cat);
      db.prepare('DELETE FROM item_component_links WHERE category = ?').run(cat);
      clearedCandidates = db.prepare('DELETE FROM candidates WHERE category = ?').run(cat).changes;
      clearedFieldState = db.prepare('DELETE FROM item_field_state WHERE category = ?').run(cat).changes;

      // Components
      db.prepare(`DELETE FROM component_aliases WHERE component_id IN (SELECT id FROM component_identity WHERE category = ?)`).run(cat);
      clearedComponentData += db.prepare('DELETE FROM component_values WHERE category = ?').run(cat).changes;
      clearedComponentData += db.prepare('DELETE FROM component_identity WHERE category = ?').run(cat).changes;

      // Enums
      clearedEnumData += db.prepare('DELETE FROM list_values WHERE category = ?').run(cat).changes;
      clearedEnumData += db.prepare('DELETE FROM enum_lists WHERE category = ?').run(cat).changes;

      // Catalog
      clearedCatalogState += db.prepare('DELETE FROM products WHERE category = ?').run(cat).changes;
      clearedCatalogState += db.prepare('DELETE FROM product_queue WHERE category = ?').run(cat).changes;
      clearedCatalogState += db.prepare('DELETE FROM product_runs WHERE category = ?').run(cat).changes;
      clearedCatalogState += db.prepare('DELETE FROM curation_suggestions WHERE category = ?').run(cat).changes;
      clearedCatalogState += db.prepare('DELETE FROM component_review_queue WHERE category = ?').run(cat).changes;
      clearedCatalogState += db.prepare('DELETE FROM llm_route_matrix WHERE category = ?').run(cat).changes;

      // Artifacts + optional tables
      clearedArtifacts += db.prepare('DELETE FROM artifacts WHERE category = ?').run(cat).changes;
      clearedArtifacts += db.prepare('DELETE FROM audit_log WHERE category = ?').run(cat).changes;
      try { clearedArtifacts += db.prepare('DELETE FROM category_brain WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM source_corpus WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM runtime_events WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM bridge_events WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM runs WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM run_artifacts WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM source_intel_domains WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM source_intel_field_rewards WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM source_intel_brands WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM source_intel_paths WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
    });
    tx();

    return { clearedKeyReview, clearedSources, clearedCandidates, clearedFieldState, clearedComponentData, clearedEnumData, clearedCatalogState, clearedArtifacts };
  }

  function purgeProductReviewState(category, productId) {
    const cat = String(category || '').trim();
    const pid = String(productId || '').trim();
    if (!cat || !pid) {
      return { clearedCandidates: 0, clearedKeyReview: 0, clearedFieldState: 0, clearedLinks: 0, clearedSources: 0 };
    }

    const clearedKeyReview = deleteKeyReviewStatesByProductAndKind(cat, pid, 'grid_key');
    let deletedCandidates = 0, deletedFieldState = 0, deletedLinks = 0, deletedSources = 0;

    const tx = db.transaction(() => {
      const itemFieldStateIds = db.prepare('SELECT id FROM item_field_state WHERE category = ? AND product_id = ?').all(cat, pid).map((r) => r.id);
      const sourceIds = db.prepare('SELECT source_id FROM source_registry WHERE category = ? AND product_id = ?').all(cat, pid).map((r) => r.source_id);

      if (itemFieldStateIds.length > 0) {
        deletedSources += deleteSourcesByItemFieldStates(itemFieldStateIds);
      }
      if (sourceIds.length > 0) {
        deletedSources += deleteSourcesByCategory(cat, sourceIds);
      }
      if (itemFieldStateIds.length > 0) {
        deletedCandidates = deleteCandidatesByItemFieldStates(itemFieldStateIds);
      }

      deletedLinks = db.prepare('DELETE FROM item_list_links WHERE category = ? AND product_id = ?').run(cat, pid).changes;
      deletedLinks += db.prepare('DELETE FROM item_component_links WHERE category = ? AND product_id = ?').run(cat, pid).changes;
      deletedFieldState = db.prepare('DELETE FROM item_field_state WHERE category = ? AND product_id = ?').run(cat, pid).changes;
    });
    tx();

    return { clearedCandidates: deletedCandidates, clearedKeyReview, clearedFieldState: deletedFieldState, clearedLinks: deletedLinks, clearedSources: deletedSources };
  }

  return {
    deleteKeyReviewStatesByTargetKinds,
    deleteKeyReviewStatesByProductAndKind,
    purgeCategoryState,
    purgeProductReviewState,
  };
}
