import {
  toInt, toFloat, eventType, payloadOf, extractEventUrls, extractPrimaryEventUrl,
} from './runtimeOpsEventPrimitives.js';

const CROSS_CUTTING_METHODS = new Set([
  'llm_extract', 'deterministic_normalizer', 'consensus_policy_reducer',
]);

const PHASE_LABELS = {
  'extract:static-html': 'Static HTML',
  'extract:dynamic-js': 'Dynamic JS',
  'extract:article-text': 'Article Text',
  'extract:html-table': 'HTML Tables',
  'extract:structured-meta': 'Structured Meta',
  'extract:text-pdf': 'Text PDF',
  'extract:scanned-pdf-ocr': 'Scanned PDF OCR',
  'extract:image-ocr': 'Image OCR',
  'extract:chart-graph': 'Chart/Graph',
  'extract:office-doc': 'Office Docs',
  'extract:post-process': 'Post-Processing',
};

// WHY: Inlined from deleted indexingSchemaPackets.js during pipeline rework.
const PHASE_IDS = Object.keys(PHASE_LABELS).filter((k) => k !== 'extract:post-process');

const METHOD_TO_PHASE = {
  static_dom: 'extract:static-html',
  html_table: 'extract:html-table',
  html_kv: 'extract:static-html',
  dom: 'extract:static-html',
  json_ld: 'extract:structured-meta',
  microdata: 'extract:structured-meta',
  opengraph: 'extract:structured-meta',
  network_json: 'extract:dynamic-js',
  embedded_state: 'extract:dynamic-js',
  article_text: 'extract:article-text',
  readability: 'extract:article-text',
  pdf_kv: 'extract:text-pdf',
  pdf_table: 'extract:text-pdf',
  scanned_pdf_ocr_kv: 'extract:scanned-pdf-ocr',
  scanned_pdf_ocr_table: 'extract:scanned-pdf-ocr',
};

function phaseFromMethod(method) {
  return METHOD_TO_PHASE[String(method || '').trim()] || 'extract:static-html';
}

function createPhaseBuckets() {
  const buckets = {};
  for (const id of PHASE_IDS) {
    buckets[id] = { field_count: 0, methods: new Set(), confidences: [], urls: new Set() };
  }
  buckets['extract:post-process'] = { field_count: 0, methods: new Set(), confidences: [], urls: new Set() };
  return buckets;
}

function addPhaseBucketEntry(buckets, {
  phaseId = '',
  method = '',
  confidence = 0,
  sourceUrl = '',
  fieldCount = 1,
} = {}) {
  const bucket = buckets[phaseId];
  if (!bucket) return;
  bucket.field_count += Math.max(0, toInt(fieldCount, 0));
  const normalizedMethod = String(method || '').trim();
  if (normalizedMethod) bucket.methods.add(normalizedMethod);
  if (confidence !== null && confidence !== undefined) {
    bucket.confidences.push(toFloat(confidence, 0));
  }
  const normalizedUrl = String(sourceUrl || '').trim();
  if (normalizedUrl) bucket.urls.add(normalizedUrl);
}

function finalizePhaseBuckets(buckets) {
  return {
    phases: [...PHASE_IDS, 'extract:post-process'].map((id) => {
      const b = buckets[id];
      const avgConf = b.confidences.length > 0
        ? Math.round((b.confidences.reduce((s, v) => s + v, 0) / b.confidences.length) * 100) / 100
        : 0;
      return {
        phase_id: id,
        phase_label: PHASE_LABELS[id] || id,
        doc_count: b.urls.size,
        field_count: b.field_count,
        methods_used: Array.from(b.methods).sort(),
        confidence_avg: avgConf,
      };
    }),
  };
}

function addExtractionFieldsToPhaseBuckets(buckets, extractionFields) {
  for (const f of extractionFields) {
    const method = String(f.method || '').trim();
    if (!method) continue;

    let bucketId;
    if (CROSS_CUTTING_METHODS.has(method)) {
      bucketId = 'extract:post-process';
    } else {
      bucketId = phaseFromMethod(method);
    }

    addPhaseBucketEntry(buckets, {
      phaseId: bucketId,
      method,
      confidence: f.confidence,
      sourceUrl: f.source_url,
      fieldCount: 1,
    });
  }
}

export function buildPhaseLineage(extractionFields) {
  const buckets = createPhaseBuckets();
  addExtractionFieldsToPhaseBuckets(buckets, extractionFields);

  return finalizePhaseBuckets(buckets);
}

export function toSourceIndexingPackets(sourceIndexingPacketCollection) {
  if (Array.isArray(sourceIndexingPacketCollection)) {
    return sourceIndexingPacketCollection.filter((row) => row && typeof row === 'object');
  }
  const packets = Array.isArray(sourceIndexingPacketCollection?.packets)
    ? sourceIndexingPacketCollection.packets
    : [];
  return packets.filter((row) => row && typeof row === 'object');
}

export function packetPrimaryUrl(packet = {}) {
  const candidates = [
    packet?.canonical_url,
    packet?.source_key,
    packet?.source_metadata?.source_url,
    packet?.run_meta?.source_url,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

export function packetUrlSet(packet = {}) {
  const urls = new Set();
  const candidates = [
    packet?.canonical_url,
    packet?.source_key,
    packet?.source_metadata?.source_url,
    packet?.run_meta?.source_url,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) urls.add(normalized);
  }
  return urls;
}

export function packetMatchesWorkerUrls(packet = {}, workerUrls = new Set()) {
  if (!(workerUrls instanceof Set) || workerUrls.size === 0) return false;
  for (const url of packetUrlSet(packet)) {
    if (workerUrls.has(url)) return true;
  }
  return false;
}

export function packetFieldKeyCount(packet = {}) {
  const fieldKeyMap = packet?.field_key_map && typeof packet.field_key_map === 'object'
    ? packet.field_key_map
    : {};
  return Object.keys(fieldKeyMap).length;
}

export function collectPacketAssertions(packet = {}) {
  const fieldKeyMap = packet?.field_key_map && typeof packet.field_key_map === 'object'
    ? packet.field_key_map
    : {};
  const sourceUrl = packetPrimaryUrl(packet);
  const assertions = [];
  const bestFieldByKey = new Map();

  for (const [fieldKey, bundle] of Object.entries(fieldKeyMap)) {
    const contexts = Array.isArray(bundle?.contexts) ? bundle.contexts : [];
    for (const context of contexts) {
      const rows = Array.isArray(context?.assertions) ? context.assertions : [];
      for (const row of rows) {
        const normalizedField = String(row?.field_key || fieldKey || '').trim();
        if (!normalizedField) continue;
        const method = String(row?.extraction_method || row?.method || '').trim();
        const confidence = toFloat(
          row?.confidence ?? row?.parser_confidence ?? row?.parse_score_by_key?.score,
          0,
        );
        const valueSource = row?.value_raw ?? row?.value_normalized ?? null;
        const entry = {
          field: normalizedField,
          value: valueSource != null ? String(valueSource) : null,
          confidence,
          method,
          source_url: sourceUrl,
          phase_id: String(row?.parser_phase || phaseFromMethod(method)).trim() || 'extract:static-html',
        };
        assertions.push(entry);

        const currentBest = bestFieldByKey.get(normalizedField);
        if (!currentBest || confidence > currentBest.confidence) {
          bestFieldByKey.set(normalizedField, entry);
        }
      }
    }
  }

  return {
    assertions,
    bestFields: [...bestFieldByKey.values()],
  };
}

function resolveWorkerEventUrl(event, workerUrls = new Set()) {
  const eventUrls = extractEventUrls(event);
  const matchedUrl = eventUrls.find((url) => workerUrls.has(url));
  if (matchedUrl) return matchedUrl;
  const primaryUrl = extractPrimaryEventUrl(event);
  if (primaryUrl && workerUrls.has(primaryUrl)) return primaryUrl;
  return '';
}

export function classifyWorkerEventMatch(event, workerId = '', workerUrls = new Set()) {
  const payload = payloadOf(event);
  const evtWorkerId = String(payload.worker_id || '').trim();
  const url = resolveWorkerEventUrl(event, workerUrls);
  if (!url) {
    return { matches: false, matchRank: 0, url: '' };
  }
  if (evtWorkerId) {
    if (evtWorkerId !== String(workerId || '').trim()) {
      return { matches: false, matchRank: 0, url };
    }
    return { matches: true, matchRank: 2, url };
  }
  if (workerUrls.has(url)) {
    return { matches: true, matchRank: 1, url };
  }
  return { matches: false, matchRank: 0, url };
}

function addRuntimeTelemetryPhaseSignals(
  buckets,
  events = [],
  workerId = '',
  workerUrls = new Set(),
  { shouldSkipPhase = null } = {},
) {
  const telemetryByUrl = new Map();
  for (const evt of events) {
    const type = eventType(evt);
    if (type !== 'parse_finished' && type !== 'source_processed') continue;

    const payload = payloadOf(evt);
    const match = classifyWorkerEventMatch(evt, workerId, workerUrls);
    if (!match.matches) continue;

    const rank = (match.matchRank * 10) + (type === 'parse_finished' ? 2 : 1);
    const ts = String(evt?.ts || '').trim();
    const existing = telemetryByUrl.get(match.url);
    if (!existing || rank > existing.rank || (rank === existing.rank && ts > existing.ts)) {
      telemetryByUrl.set(match.url, { payload, url: match.url, ts, rank });
    }
  }

  if (telemetryByUrl.size === 0) {
    return;
  }

  const addRuntimePhaseMetric = ({ phaseId = '', sourceUrl = '', method = '', fieldCount = 0 } = {}) => {
    if (!phaseId || (!sourceUrl && !method && toInt(fieldCount, 0) <= 0)) return;
    if (typeof shouldSkipPhase === 'function' && shouldSkipPhase({ phaseId, sourceUrl })) return;
    addPhaseBucketEntry(buckets, {
      phaseId,
      sourceUrl,
      method,
      fieldCount,
    });
  };

  for (const { payload, url } of telemetryByUrl.values()) {
    const sourceUrl = String(url || '').trim();
    if (!sourceUrl) continue;

    const articleMethod = String(payload.article_extraction_method || '').trim();
    const articleChars = toInt(payload.article_char_count, 0);
    if (articleMethod || articleChars > 0) {
      addRuntimePhaseMetric({
        phaseId: 'extract:article-text',
        sourceUrl,
        method: articleMethod || 'article_text',
        fieldCount: 0,
      });
    }

    const staticDomAccepted = toInt(payload.static_dom_accepted_field_candidates, 0);
    if (staticDomAccepted > 0 || String(payload.static_dom_mode || '').trim()) {
      addRuntimePhaseMetric({
        phaseId: 'extract:static-html',
        sourceUrl,
        method: 'static_dom',
        fieldCount: staticDomAccepted,
      });
    }

    const structuredRows = [
      ['json_ld', toInt(payload.structured_json_ld_count, 0)],
      ['microdata', toInt(payload.structured_microdata_count, 0)],
      ['opengraph', toInt(payload.structured_opengraph_count, 0)],
    ];
    let structuredCount = 0;
    for (const [method, count] of structuredRows) {
      if (count <= 0) continue;
      structuredCount += count;
      addRuntimePhaseMetric({
        phaseId: 'extract:structured-meta',
        sourceUrl,
        method,
        fieldCount: count,
      });
    }
    const structuredCandidates = toInt(payload.structured_candidates, 0);
    if (structuredCandidates > structuredCount) {
      addRuntimePhaseMetric({
        phaseId: 'extract:structured-meta',
        sourceUrl,
        fieldCount: structuredCandidates - structuredCount,
      });
    }

    const pdfRows = [
      ['pdf_kv', toInt(payload.pdf_kv_pairs, 0)],
      ['pdf_table', toInt(payload.pdf_table_pairs, 0)],
    ];
    let pdfCount = 0;
    for (const [method, count] of pdfRows) {
      if (count <= 0) continue;
      pdfCount += count;
      addRuntimePhaseMetric({
        phaseId: 'extract:text-pdf',
        sourceUrl,
        method,
        fieldCount: count,
      });
    }
    const pdfPairsTotal = toInt(payload.pdf_pairs_total, 0);
    if (pdfPairsTotal > pdfCount) {
      addRuntimePhaseMetric({
        phaseId: 'extract:text-pdf',
        sourceUrl,
        method: pdfCount === 0 ? 'pdf_text' : '',
        fieldCount: pdfPairsTotal - pdfCount,
      });
    }

    const scannedPdfRows = [
      ['scanned_pdf_ocr_kv', toInt(payload.scanned_pdf_ocr_kv_pairs, 0)],
      ['scanned_pdf_ocr_table', toInt(payload.scanned_pdf_ocr_table_pairs, 0)],
      ['scanned_pdf_ocr_text', toInt(payload.scanned_pdf_ocr_pairs, 0)],
    ];
    let scannedPdfCount = 0;
    for (const [method, count] of scannedPdfRows) {
      if (count <= 0) continue;
      scannedPdfCount += count;
      addRuntimePhaseMetric({
        phaseId: 'extract:scanned-pdf-ocr',
        sourceUrl,
        method,
        fieldCount: count,
      });
    }
    const scannedPdfDocsAttempted = toInt(payload.scanned_pdf_ocr_docs_attempted, 0);
    if (scannedPdfDocsAttempted > 0 && scannedPdfCount === 0) {
      addRuntimePhaseMetric({
        phaseId: 'extract:scanned-pdf-ocr',
        sourceUrl,
        method: 'scanned_pdf_ocr',
        fieldCount: 0,
      });
    }
  }
}

export function buildPhaseLineageFromSourcePackets(
  sourcePackets = [],
  extractionFields = [],
  options = {},
) {
  const packets = Array.isArray(sourcePackets) ? sourcePackets : [];
  if (packets.length === 0) {
    return buildPhaseLineage(extractionFields);
  }

  const buckets = createPhaseBuckets();
  const packetPhaseIndex = new Map();

  for (const packet of packets) {
    const sourceUrl = packetPrimaryUrl(packet);
    const parserExecution = packet?.parser_execution && typeof packet.parser_execution === 'object'
      ? packet.parser_execution
      : {};
    const phaseLineage = parserExecution.phase_lineage && typeof parserExecution.phase_lineage === 'object'
      ? parserExecution.phase_lineage
      : {};
    const phaseStats = parserExecution.phase_stats && typeof parserExecution.phase_stats === 'object'
      ? parserExecution.phase_stats
      : {};
    const { assertions } = collectPacketAssertions(packet);
    const assertionCounts = {};
    const confidenceByPhase = {};
    const methodsByPhase = {};

    for (const assertion of assertions) {
      const method = String(assertion.method || '').trim();
      const phaseId = CROSS_CUTTING_METHODS.has(method)
        ? 'extract:post-process'
        : (String(assertion.phase_id || phaseFromMethod(method)).trim() || 'extract:static-html');
      assertionCounts[phaseId] = (assertionCounts[phaseId] || 0) + 1;
      if (!confidenceByPhase[phaseId]) confidenceByPhase[phaseId] = [];
      confidenceByPhase[phaseId].push(toFloat(assertion.confidence, 0));
      if (!methodsByPhase[phaseId]) methodsByPhase[phaseId] = new Set();
      if (method) methodsByPhase[phaseId].add(method);
    }

    for (const phaseId of PHASE_IDS) {
      const stats = phaseStats[phaseId] && typeof phaseStats[phaseId] === 'object'
        ? phaseStats[phaseId]
        : null;
      const executed = phaseLineage[phaseId] === true
        || Boolean(stats?.executed)
        || (assertionCounts[phaseId] || 0) > 0;
      if (!executed) continue;

      if (!packetPhaseIndex.has(sourceUrl)) {
        packetPhaseIndex.set(sourceUrl, new Set());
      }
      packetPhaseIndex.get(sourceUrl).add(phaseId);

      addPhaseBucketEntry(buckets, {
        phaseId,
        sourceUrl,
        fieldCount: toInt(stats?.assertion_count, assertionCounts[phaseId] || 0),
      });
      for (const method of methodsByPhase[phaseId] || []) {
        addPhaseBucketEntry(buckets, {
          phaseId,
          method,
          sourceUrl,
          fieldCount: 0,
        });
      }
      for (const confidence of confidenceByPhase[phaseId] || []) {
        addPhaseBucketEntry(buckets, {
          phaseId,
          confidence,
          sourceUrl,
          fieldCount: 0,
        });
      }
    }

    if ((assertionCounts['extract:post-process'] || 0) > 0) {
      if (!packetPhaseIndex.has(sourceUrl)) {
        packetPhaseIndex.set(sourceUrl, new Set());
      }
      packetPhaseIndex.get(sourceUrl).add('extract:post-process');

      addPhaseBucketEntry(buckets, {
        phaseId: 'extract:post-process',
        sourceUrl,
        fieldCount: assertionCounts['extract:post-process'],
      });
      for (const method of methodsByPhase['extract:post-process'] || []) {
        addPhaseBucketEntry(buckets, {
          phaseId: 'extract:post-process',
          method,
          sourceUrl,
          fieldCount: 0,
        });
      }
      for (const confidence of confidenceByPhase['extract:post-process'] || []) {
        addPhaseBucketEntry(buckets, {
          phaseId: 'extract:post-process',
          confidence,
          sourceUrl,
          fieldCount: 0,
        });
      }
    }
  }

  addRuntimeTelemetryPhaseSignals(
    buckets,
    options.events,
    options.workerId,
    options.workerUrls,
    {
      shouldSkipPhase: ({ phaseId, sourceUrl }) => packetPhaseIndex.get(sourceUrl)?.has(phaseId) === true,
    },
  );

  // Add cross-cutting methods from extraction fields (e.g. llm_extract) that
  // aren't tracked in source packet assertions but exist in worker extraction_fields
  const crossCuttingOnly = (Array.isArray(extractionFields) ? extractionFields : [])
    .filter((f) => CROSS_CUTTING_METHODS.has(String(f.method || '').trim()));
  addExtractionFieldsToPhaseBuckets(buckets, crossCuttingOnly);

  return finalizePhaseBuckets(buckets);
}

export function buildPhaseLineageFromRuntimeTelemetry(events = [], workerId = '', workerUrls = new Set(), extractionFields = []) {
  const extracted = Array.isArray(extractionFields) ? extractionFields : [];
  const buckets = createPhaseBuckets();
  addExtractionFieldsToPhaseBuckets(buckets, extracted);
  addRuntimeTelemetryPhaseSignals(buckets, events, workerId, workerUrls);

  return finalizePhaseBuckets(buckets);
}
