import {
  toInt, toFloat,
  extractHost,
  eventType, payloadOf,
} from './runtimeOpsEventPrimitives.js';
import { collectPacketAssertions } from './runtimeOpsPhaseLineage.js';

export function buildExtractionFields(events, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const roundFilter = opts.round != null ? toInt(opts.round, null) : null;
  const sourcePackets = Array.isArray(opts.sourcePackets) ? opts.sourcePackets : [];

  const acceptedFields = new Set();
  const fieldCandidates = {};

  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);

    if (type === 'fields_filled_from_source') {
      const fields = Array.isArray(payload.fields) ? payload.fields : [];
      for (const f of fields) {
        acceptedFields.add(String(f));
      }
      continue;
    }

    if (type !== 'llm_finished' && type !== 'source_processed') continue;

    const round = toInt(payload.round, 0);
    if (roundFilter !== null && round !== roundFilter) continue;

    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const batchId = String(payload.batch_id || '').trim() || null;
    const workerId = String(payload.worker_id || '').trim() || null;

    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue;
      const field = String(c.field || '').trim();
      if (!field) continue;

      const entry = {
        value: c.value != null ? String(c.value) : null,
        method: String(c.method || payload.parse_method || '').trim(),
        confidence: toFloat(c.confidence, 0),
        source_host: extractHost(String(c.source_url || payload.url || '')),
        source_tier: c.source_tier != null ? toInt(c.source_tier, null) : null,
        snippet_id: c.snippet_id != null ? String(c.snippet_id) : null,
        quote: c.quote != null ? String(c.quote) : null,
      };

      if (!fieldCandidates[field]) {
        fieldCandidates[field] = {
          candidates: [],
          batch_id: batchId,
          round,
        };
      }
      fieldCandidates[field].candidates.push(entry);
      if (batchId) fieldCandidates[field].batch_id = batchId;
    }
  }

  // Fill from source indexing packets (primary data source when events lack candidates)
  const seenPacketFields = new Set();
  for (const packet of sourcePackets) {
    const { bestFields } = collectPacketAssertions(packet);
    for (const pf of bestFields) {
      const field = String(pf.field || '').trim();
      if (!field) continue;
      const sourceHost = extractHost(String(pf.source_url || ''));
      const dedupeKey = `${field}|${sourceHost}`;
      if (seenPacketFields.has(dedupeKey)) continue;
      seenPacketFields.add(dedupeKey);

      const entry = {
        value: pf.value != null ? String(pf.value) : null,
        method: String(pf.method || '').trim(),
        confidence: toFloat(pf.confidence, 0),
        source_host: sourceHost,
        source_tier: null,
        snippet_id: null,
        quote: null,
      };

      if (!fieldCandidates[field]) {
        fieldCandidates[field] = {
          candidates: [],
          batch_id: null,
          round: 0,
        };
      }
      // Only add if no existing candidate from events for this field+host
      const existingHosts = new Set(
        fieldCandidates[field].candidates.map((c) => c.source_host),
      );
      if (!existingHosts.has(sourceHost)) {
        fieldCandidates[field].candidates.push(entry);
      }
    }
  }

  const fields = Object.entries(fieldCandidates).map(([field, data]) => {
    const allCandidates = data.candidates;
    const best = allCandidates.reduce((a, b) => (b.confidence > a.confidence ? b : a), allCandidates[0]);

    const distinctValues = new Set(
      allCandidates
        .map((c) => String(c.value || '').trim().toLowerCase())
        .filter((v) => v)
    );

    let status = 'candidate';
    if (acceptedFields.has(field)) {
      status = 'accepted';
    } else if (best.value == null) {
      status = 'unknown';
    } else if (distinctValues.size > 1) {
      status = 'conflict';
    }

    return {
      field,
      value: best.value,
      status,
      confidence: best.confidence,
      method: best.method,
      source_tier: best.source_tier,
      source_host: best.source_host,
      refs_count: allCandidates.length,
      batch_id: data.batch_id,
      round: data.round,
      candidates: allCandidates.map((c) => ({
        value: c.value != null ? String(c.value) : '',
        method: c.method,
        confidence: c.confidence,
        source_host: c.source_host,
        source_tier: c.source_tier != null ? toInt(c.source_tier, 0) : 0,
        snippet_id: c.snippet_id,
        quote: c.quote,
      })),
    };
  });

  fields.sort((a, b) => {
    const statusOrder = { conflict: 0, unknown: 1, candidate: 2, accepted: 3 };
    const aOrder = statusOrder[a.status] ?? 4;
    const bOrder = statusOrder[b.status] ?? 4;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.field.localeCompare(b.field);
  });

  return { fields };
}
