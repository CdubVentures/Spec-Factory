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
    db.prepare(`DELETE FROM key_review_run_sources WHERE key_review_run_id IN (SELECT run_id FROM key_review_runs WHERE key_review_state_id IN (${idPlaceholders}))`).run(...ids);
    db.prepare(`DELETE FROM key_review_runs WHERE key_review_state_id IN (${idPlaceholders})`).run(...ids);
    db.prepare(`DELETE FROM key_review_audit WHERE key_review_state_id IN (${idPlaceholders})`).run(...ids);
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
    db.prepare(`DELETE FROM key_review_run_sources WHERE key_review_run_id IN (SELECT run_id FROM key_review_runs WHERE key_review_state_id IN (${placeholders}))`).run(...ids);
    db.prepare(`DELETE FROM key_review_runs WHERE key_review_state_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM key_review_audit WHERE key_review_state_id IN (${placeholders})`).run(...ids);
    return db.prepare(`DELETE FROM key_review_state WHERE id IN (${placeholders})`).run(...ids).changes;
  }

  function deleteCandidatesByProduct(category, productId) {
    const cat = String(category || '').trim();
    const pid = String(productId || '').trim();
    if (!cat || !pid) return 0;
    db.prepare(`DELETE FROM candidate_reviews WHERE candidate_id IN (SELECT candidate_id FROM candidates WHERE category = ? AND product_id = ?)`).run(cat, pid);
    return db.prepare('DELETE FROM candidates WHERE category = ? AND product_id = ?').run(cat, pid).changes;
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
        db.prepare(`DELETE FROM key_review_run_sources WHERE key_review_run_id IN (SELECT run_id FROM key_review_runs WHERE key_review_state_id IN (${ph}))`).run(...keyReviewIds);
        db.prepare(`DELETE FROM key_review_runs WHERE key_review_state_id IN (${ph})`).run(...keyReviewIds);
        db.prepare(`DELETE FROM key_review_audit WHERE key_review_state_id IN (${ph})`).run(...keyReviewIds);
        clearedKeyReview = db.prepare(`DELETE FROM key_review_state WHERE id IN (${ph})`).run(...keyReviewIds).changes;
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

      // Optional tables
      try { clearedArtifacts += db.prepare('DELETE FROM bridge_events WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM runs WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM run_artifacts WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
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
      deletedCandidates = deleteCandidatesByProduct(cat, pid);

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
