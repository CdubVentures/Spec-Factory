/**
 * Legacy cleanup and integrity checks for SpecDb.
 * Extracted from specDb.js — operates on a raw db handle.
 */

/**
 * Auto-prune legacy unscoped key_review_state rows from old fallback-era builds.
 * @param {import('better-sqlite3').Database} db
 * @returns {number} Number of pruned rows
 */
export function cleanupLegacyIdentityFallbackRows(db) {
  const rows = db.prepare(`
    SELECT id
    FROM key_review_state
    WHERE
      (target_kind = 'grid_key' AND item_field_state_id IS NULL)
      OR (
        target_kind = 'component_key'
        AND component_value_id IS NULL
        AND (
          component_identity_id IS NULL
          OR TRIM(COALESCE(property_key, '')) = ''
        )
      )
      OR (target_kind = 'enum_key' AND list_value_id IS NULL)
  `).all();
  const ids = rows
    .map((row) => Number.parseInt(String(row?.id ?? ''), 10))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return 0;

  const placeholders = ids.map(() => '?').join(',');
  const tx = db.transaction((targetIds) => {
    db.prepare(`
      DELETE FROM key_review_run_sources
      WHERE key_review_run_id IN (
        SELECT run_id
        FROM key_review_runs
        WHERE key_review_state_id IN (${placeholders})
      )
    `).run(...targetIds);
    db.prepare(
      `DELETE FROM key_review_runs WHERE key_review_state_id IN (${placeholders})`
    ).run(...targetIds);
    db.prepare(
      `DELETE FROM key_review_audit WHERE key_review_state_id IN (${placeholders})`
    ).run(...targetIds);
    db.prepare(
      `DELETE FROM key_review_state WHERE id IN (${placeholders})`
    ).run(...targetIds);
  });
  tx(ids);
  return ids.length;
}

/**
 * Assert that all identity-slotted rows have valid FK references.
 * Throws if legacy fallback data is detected.
 * @param {import('better-sqlite3').Database} db
 */
export function assertStrictIdentitySlotIntegrity(db) {
  const issues = [];
  const unresolvedComponentIdentities = Number(db.prepare(`
    SELECT COUNT(*) AS c
    FROM component_values
    WHERE component_identity_id IS NULL
  `).get()?.c || 0);
  if (unresolvedComponentIdentities > 0) {
    issues.push(`component_values missing component_identity_id: ${unresolvedComponentIdentities}`);
  }

  const unresolvedListOwnership = Number(db.prepare(`
    SELECT COUNT(*) AS c
    FROM list_values
    WHERE list_id IS NULL
  `).get()?.c || 0);
  if (unresolvedListOwnership > 0) {
    issues.push(`list_values missing list_id: ${unresolvedListOwnership}`);
  }

  const unresolvedGridSlots = Number(db.prepare(`
    SELECT COUNT(*) AS c
    FROM key_review_state
    WHERE target_kind = 'grid_key'
      AND item_field_state_id IS NULL
  `).get()?.c || 0);
  if (unresolvedGridSlots > 0) {
    issues.push(`grid key_review_state rows missing item_field_state_id: ${unresolvedGridSlots}`);
  }

  const unresolvedComponentSlots = Number(db.prepare(`
    SELECT COUNT(*) AS c
    FROM key_review_state
    WHERE target_kind = 'component_key'
      AND component_value_id IS NULL
      AND (
        component_identity_id IS NULL
        OR TRIM(COALESCE(property_key, '')) = ''
      )
  `).get()?.c || 0);
  if (unresolvedComponentSlots > 0) {
    issues.push(`component key_review_state rows missing slot identity: ${unresolvedComponentSlots}`);
  }

  const unresolvedEnumSlots = Number(db.prepare(`
    SELECT COUNT(*) AS c
    FROM key_review_state
    WHERE target_kind = 'enum_key'
      AND list_value_id IS NULL
  `).get()?.c || 0);
  if (unresolvedEnumSlots > 0) {
    issues.push(`enum key_review_state rows missing list_value_id: ${unresolvedEnumSlots}`);
  }

  if (issues.length > 0) {
    throw new Error(
      `Legacy review identity fallback data detected. Use an explicit migration/wipe before startup. ${issues.join('; ')}`
    );
  }
}
