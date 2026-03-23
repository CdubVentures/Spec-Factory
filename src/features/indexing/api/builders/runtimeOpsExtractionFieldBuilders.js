import {
  toInt, toFloat, toArray,
  extractEventUrls, extractHost,
  eventType, payloadOf,
} from './runtimeOpsEventPrimitives.js';
import { collectPacketAssertions, packetUrlSet } from './runtimeOpsPhaseLineage.js';
import { resolveFieldCandidates, resolveUrl } from '../../../../shared/payloadAliases.js';

function parseJsonPreview(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function readPrimeSourceUrlHints(promptPayload = {}) {
  const primeSources = promptPayload?.extraction_context?.prime_sources
    || promptPayload?.prime_sources
    || {};
  const byField = {};
  const generalUrls = new Set();

  const appendUrl = (field, value) => {
    const url = String(value || '').trim();
    if (!url) return;
    generalUrls.add(url);
    if (!field) return;
    if (!byField[field]) byField[field] = [];
    if (!byField[field].includes(url)) {
      byField[field].push(url);
    }
  };

  const byFieldEntries = primeSources?.by_field && typeof primeSources.by_field === 'object'
    ? Object.entries(primeSources.by_field)
    : [];
  for (const [fieldKey, rows] of byFieldEntries) {
    for (const row of toArray(rows)) {
      appendUrl(String(fieldKey || '').trim(), resolveUrl(row));
    }
  }

  for (const row of toArray(primeSources?.rows)) {
    appendUrl(String(row?.field_key || '').trim(), resolveUrl(row));
  }

  return {
    byField,
    generalUrls: [...generalUrls],
  };
}

function choosePreviewSourceUrl(fieldKey, workerUrls, promptHints, candidate = {}) {
  const explicitUrl = resolveUrl(candidate);
  if (explicitUrl && workerUrls.has(explicitUrl)) {
    return explicitUrl;
  }

  const fieldUrls = toArray(promptHints?.byField?.[fieldKey]).filter((url) => workerUrls.has(url));
  if (fieldUrls.length > 0) {
    return fieldUrls[0];
  }

  const generalUrls = toArray(promptHints?.generalUrls).filter((url) => workerUrls.has(url));
  if (generalUrls.length > 0) {
    return generalUrls[0];
  }

  if (workerUrls.size === 1) {
    return [...workerUrls][0];
  }

  return '';
}

export function collectPreviewExtractionFields(events, workerUrls, existingFieldKeys) {
  const fields = [];
  const seen = existingFieldKeys instanceof Set ? existingFieldKeys : new Set();

  for (const evt of events) {
    const type = eventType(evt);
    if (type !== 'llm_finished') continue;

    const payload = payloadOf(evt);
    const callType = String(payload.call_type || '').trim().toLowerCase();
    const reason = String(payload.reason || '').trim().toLowerCase();
    if (callType !== 'extraction' && !reason.includes('extract')) {
      continue;
    }

    const responsePayload = parseJsonPreview(payload.response_preview);
    const promptPayload = parseJsonPreview(payload.prompt_preview);
    const rawCandidates = resolveFieldCandidates(responsePayload, toArray);
    if (rawCandidates.length === 0) continue;

    const promptHints = readPrimeSourceUrlHints(promptPayload || {});
    for (const candidate of rawCandidates) {
      const field = String(candidate?.field || '').trim();
      if (!field) continue;

      const sourceUrl = choosePreviewSourceUrl(field, workerUrls, promptHints, candidate);
      if (!sourceUrl) continue;

      const dedupeKey = `${field}|${sourceUrl}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      fields.push({
        field,
        value: candidate?.value != null ? String(candidate.value) : null,
        confidence: toFloat(candidate?.confidence, 0),
        method: 'llm_extract',
        source_url: sourceUrl,
      });
    }
  }

  return fields;
}

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

  // Fill from LLM preview events (llm_finished with response_preview.fieldCandidates)
  const allUrls = new Set();
  for (const evt of events) {
    for (const url of extractEventUrls(evt)) {
      if (url) allUrls.add(url);
    }
  }
  for (const packet of sourcePackets) {
    for (const url of packetUrlSet(packet)) {
      if (url) allUrls.add(url);
    }
  }
  const existingFieldKeys = new Set(
    Object.entries(fieldCandidates).flatMap(([field, data]) =>
      data.candidates.map((c) => `${field}|${c.source_host}`),
    ),
  );
  const previewFields = collectPreviewExtractionFields(events, allUrls, existingFieldKeys);
  for (const pf of previewFields) {
    const field = String(pf.field || '').trim();
    if (!field) continue;
    const sourceHost = extractHost(String(pf.source_url || ''));

    const entry = {
      value: pf.value != null ? String(pf.value) : null,
      method: String(pf.method || 'llm_extract').trim(),
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
    const existingHosts = new Set(
      fieldCandidates[field].candidates.map((c) => `${c.source_host}|${c.method}`),
    );
    if (!existingHosts.has(`${sourceHost}|${entry.method}`)) {
      fieldCandidates[field].candidates.push(entry);
    }
  }

  const fields = Object.entries(fieldCandidates).map(([field, data]) => {
    const allCandidates = data.candidates;
    const best = allCandidates.reduce((a, b) => (b.confidence > a.confidence ? b : a), allCandidates[0]);

    const distinctValues = new Set(
      allCandidates
        .map((c) => String(c.value || '').trim().toLowerCase())
        .filter((v) => v && v !== 'unk')
    );

    let status = 'candidate';
    if (acceptedFields.has(field)) {
      status = 'accepted';
    } else if (best.value != null && String(best.value).trim().toLowerCase() === 'unk') {
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
