// WHY: Centralized bulk purge operations for category/product cleanup.
// Moves raw SQL out of reviewGridStateRuntime.js into the DB boundary.
// All operations use cascading deletes in referential integrity order.

/**
 * @param {{ db: import('better-sqlite3').Database, category: string }} deps
 */
export function createPurgeStore({ db, category: defaultCategory }) {

  function purgeCategoryState(category) {
    const cat = String(category || '').trim();
    if (!cat) {
      return { clearedKeyReview: 0, clearedSources: 0, clearedCandidates: 0, clearedFieldState: 0, clearedComponentData: 0, clearedEnumData: 0, clearedCatalogState: 0, clearedArtifacts: 0 };
    }

    let clearedKeyReview = 0, clearedSources = 0, clearedFieldState = 0;
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

      // Field state
      db.prepare('DELETE FROM item_list_links WHERE category = ?').run(cat);
      db.prepare('DELETE FROM item_component_links WHERE category = ?').run(cat);
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
      clearedCatalogState += db.prepare('DELETE FROM curation_suggestions WHERE category = ?').run(cat).changes;
      clearedCatalogState += db.prepare('DELETE FROM component_review_queue WHERE category = ?').run(cat).changes;
      clearedCatalogState += db.prepare('DELETE FROM llm_route_matrix WHERE category = ?').run(cat).changes;


      // Optional tables
      try { clearedArtifacts += db.prepare('DELETE FROM bridge_events WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM runs WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += db.prepare('DELETE FROM run_artifacts WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
    });
    tx();

    return { clearedKeyReview, clearedSources, clearedCandidates: 0, clearedFieldState, clearedComponentData, clearedEnumData, clearedCatalogState, clearedArtifacts };
  }

  function purgeProductReviewState(category, productId) {
    const cat = String(category || '').trim();
    const pid = String(productId || '').trim();
    if (!cat || !pid) {
      return { clearedCandidates: 0, clearedKeyReview: 0, clearedFieldState: 0, clearedLinks: 0, clearedSources: 0 };
    }

    const clearedKeyReview = deleteKeyReviewStatesByProductAndKind(cat, pid, 'grid_key');
    let deletedFieldState = 0, deletedLinks = 0, deletedSources = 0;

    const tx = db.transaction(() => {
      deletedLinks = db.prepare('DELETE FROM item_list_links WHERE category = ? AND product_id = ?').run(cat, pid).changes;
      deletedLinks += db.prepare('DELETE FROM item_component_links WHERE category = ? AND product_id = ?').run(cat, pid).changes;
      deletedFieldState = db.prepare('DELETE FROM item_field_state WHERE category = ? AND product_id = ?').run(cat, pid).changes;
    });
    tx();

    return { clearedCandidates: 0, clearedKeyReview, clearedFieldState: deletedFieldState, clearedLinks: deletedLinks, clearedSources: deletedSources };
  }

  return {
    deleteKeyReviewStatesByTargetKinds,
    deleteKeyReviewStatesByProductAndKind,
    purgeCategoryState,
    purgeProductReviewState,
  };
}
