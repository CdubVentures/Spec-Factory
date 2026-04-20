/**
 * Map field_candidates SQL rows into candidate objects for the review grid.
 *
 * field_candidates is source-centric post-Phase 8: one row = one source =
 * one drawer card. `source_id` is the authoritative identifier. The legacy
 * multi-source `sources_json` column was dropped in the migration at
 * `src/db/specDbMigrations.js` and cannot appear on live rows.
 *
 * Contract:
 *   Input:  Array of hydrated field_candidate rows. `confidence` is stored as
 *           integer 0-100 (matches the LLM schema scale written by
 *           valueConfidenceSchema + submitCandidate). Legacy fraction 0-1
 *           rows are handled by normalizeConfidence.
 *   Output: Flat array of candidate objects, sorted by score DESC then
 *           submitted_at DESC.
 *   Invariants:
 *     - score is always 0-1 (fraction, clamped, normalized via the publisher's
 *       canonical normalizeConfidence helper)
 *     - status is always 'candidate' or 'resolved'
 */

import { normalizeConfidence } from '../../publisher/publish/publishCandidate.js';

function clampScore(raw) {
  const n = Number(raw);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, normalizeConfidence(n)));
}

function extractMeta(c) {
  const meta = c.metadata_json && typeof c.metadata_json === 'object' ? c.metadata_json : {};
  const evidenceUrl = String(meta.evidence?.url || '').trim() || null;
  const evidenceQuote = String(meta.evidence?.quote || meta.reason || '').trim() || '';
  const metaMethod = String(meta.method || '').trim() || null;
  const hasMetadata = Object.keys(meta).length > 0;
  return { meta, evidenceUrl, evidenceQuote, metaMethod, hasMetadata };
}

export function fanOutCandidates(fcRows) {
  const all = [];

  for (const c of fcRows) {
    const { meta, evidenceUrl, evidenceQuote, metaMethod, hasMetadata } = extractMeta(c);
    const status = c.status || 'candidate';
    // Prefer the source_id column. Defensive fallback to metadata.source for
    // any malformed row where source_id wasn't populated — the card still
    // renders with a best-effort source label.
    const sourceToken = String(c.source_type || meta.source || '').trim().toLowerCase();
    const sourceId = c.source_id || sourceToken;

    all.push({
      candidate_id: `fc_${c.id}`,
      value: c.value,
      status,
      score: clampScore(c.confidence),
      source: sourceToken,
      source_id: sourceId,
      model: String(c.model || '').trim() || null,
      run_id: null,
      submitted_at: c.submitted_at || null,
      evidence_url: evidenceUrl,
      evidence: { url: evidenceUrl || '', quote: evidenceQuote, source_id: sourceToken },
      metadata: hasMetadata ? meta : null,
      method: metaMethod || sourceToken || null,
      tier: null,
    });
  }

  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.submitted_at || '';
    const bTime = b.submitted_at || '';
    if (bTime !== aTime) return bTime > aTime ? 1 : -1;
    return 0;
  });

  return all;
}
