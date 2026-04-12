/**
 * Legacy cleanup and integrity checks for SpecDb.
 * Extracted from specDb.js — operates on a raw db handle.
 */

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

  if (issues.length > 0) {
    throw new Error(
      `Legacy review identity fallback data detected. Use an explicit migration/wipe before startup. ${issues.join('; ')}`
    );
  }
}
