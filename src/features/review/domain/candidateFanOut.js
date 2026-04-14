/**
 * Map field_candidates SQL rows into candidate objects for the review grid.
 *
 * Source-centric rows (have source_id column): 1 row = 1 card, direct mapping.
 * Legacy rows (have sources_json array): fan out into N cards per source entry.
 *
 * Contract:
 *   Input:  Array of hydrated field_candidate rows
 *   Output: Flat array of candidate objects, sorted by score DESC then submitted_at DESC
 *   Invariants:
 *     - score always 0-1 (clamped)
 *     - status always 'candidate' or 'resolved'
 */

function clampScore(raw) {
  const n = Number(raw);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
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

    // WHY: Source-centric rows have source_id column — 1 row = 1 card, direct mapping.
    if (c.source_id) {
      const sourceToken = String(c.source_type || '').trim().toLowerCase();
      all.push({
        candidate_id: `fc_${c.id}`,
        value: c.value,
        status,
        score: clampScore(c.confidence),
        source: sourceToken,
        source_id: c.source_id,
        model: String(c.model || '').trim() || null,
        run_id: null,
        submitted_at: c.submitted_at || null,
        evidence_url: evidenceUrl,
        evidence: { url: evidenceUrl || '', quote: evidenceQuote, source_id: sourceToken },
        metadata: hasMetadata ? meta : null,
        method: metaMethod || sourceToken || null,
        tier: null,
      });
      continue;
    }

    // Legacy path: fan out sources_json array into N cards
    const sources = Array.isArray(c.sources_json) ? c.sources_json : [];

    if (sources.length === 0) {
      const sourceToken = String(meta.source || '').trim().toLowerCase();
      all.push({
        candidate_id: `fc_${c.id}`,
        value: c.value,
        status,
        score: clampScore(c.confidence),
        source: sourceToken,
        source_id: sourceToken,
        model: null,
        run_id: null,
        submitted_at: c.submitted_at || null,
        evidence_url: evidenceUrl,
        evidence: { url: evidenceUrl || '', quote: evidenceQuote, source_id: sourceToken },
        metadata: hasMetadata ? meta : null,
        method: metaMethod || sourceToken || null,
        tier: null,
      });
      continue;
    }

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i] && typeof sources[i] === 'object' ? sources[i] : {};
      const sourceToken = String(src.source || '').trim().toLowerCase();
      const score = clampScore(src.confidence ?? c.confidence);
      const model = String(src.model || '').trim() || null;

      all.push({
        candidate_id: `fc_${c.id}_${i}`,
        value: c.value,
        status,
        score,
        source: sourceToken,
        source_id: sourceToken,
        model,
        run_id: src.run_id || null,
        submitted_at: src.submitted_at || c.submitted_at || null,
        evidence_url: evidenceUrl,
        evidence: { url: evidenceUrl || '', quote: evidenceQuote, source_id: sourceToken },
        metadata: hasMetadata ? meta : null,
        method: metaMethod || sourceToken || null,
        tier: null,
      });
    }
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
