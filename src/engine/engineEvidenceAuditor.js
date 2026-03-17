import {
  isObject,
  normalizeText,
  normalizeToken,
  isUnknownToken,
  canonicalizeWhitespace,
  isValidIsoDateTime
} from './engineTextHelpers.js';

export function auditEvidence(fieldKey, value, provenance = {}, context = {}) {
  if (isUnknownToken(value)) {
    return { ok: true };
  }
  const missing = [];
  const url = normalizeText(provenance.url);
  const sourceId = normalizeText(provenance.source_id);
  const snippetId = normalizeText(provenance.snippet_id);
  const snippetHash = normalizeText(provenance.snippet_hash);
  const quote = normalizeText(provenance.quote);
  const quoteSpan = Array.isArray(provenance.quote_span) ? provenance.quote_span : null;
  const retrievedAt = normalizeText(provenance.retrieved_at);
  const extractionMethod = normalizeToken(provenance.extraction_method);
  const strictEvidence = Boolean(context?.strictEvidence);
  if (!url) missing.push('url');
  if (!snippetId) missing.push('snippet_id');
  if (!quote) missing.push('quote');
  if (strictEvidence && !sourceId) missing.push('source_id');
  if (strictEvidence && !snippetHash) missing.push('snippet_hash');
  if (strictEvidence && !retrievedAt) missing.push('retrieved_at');
  if (strictEvidence && !extractionMethod) missing.push('extraction_method');
  try {
    if (url) {
      // URL constructor throws on invalid URL text.
      // eslint-disable-next-line no-new
      new URL(url);
    }
  } catch {
    missing.push('url_invalid');
  }

  const snippetRows = context?.evidencePack?.snippets;
  const snippets = new Map();
  if (Array.isArray(snippetRows)) {
    for (const row of snippetRows) {
      const id = normalizeText(row?.id || '');
      if (!id) {
        continue;
      }
      snippets.set(id, row);
    }
  } else if (isObject(snippetRows)) {
    for (const [id, row] of Object.entries(snippetRows)) {
      snippets.set(normalizeText(id), row);
    }
  }

  let reasonCode = 'evidence_missing';

  if (snippetId) {
    const snippet = snippets.get(snippetId);
    if (!isObject(snippet)) {
      missing.push('snippet_id_not_found');
    } else {
      const snippetText = normalizeText(snippet.normalized_text || snippet.text || '');
      if (strictEvidence && !snippetText) {
        missing.push('snippet_text_missing');
      }

      const provenanceHash = normalizeText(snippetHash);
      const snippetRowHash = normalizeText(snippet.snippet_hash || '');
      if (strictEvidence && provenanceHash && snippetRowHash && provenanceHash !== snippetRowHash) {
        missing.push('snippet_hash_mismatch');
        reasonCode = 'evidence_stale';
      }

      if (quoteSpan && snippetText) {
        const start = Number.parseInt(String(quoteSpan[0]), 10);
        const end = Number.parseInt(String(quoteSpan[1]), 10);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > snippetText.length) {
          missing.push('quote_span_invalid');
        } else {
          const spanned = snippetText.slice(start, end);
          if (canonicalizeWhitespace(spanned) !== canonicalizeWhitespace(quote)) {
            missing.push('quote_span_mismatch');
          }
        }
      } else if (quote && snippetText && !canonicalizeWhitespace(snippetText).includes(canonicalizeWhitespace(quote))) {
        missing.push('quote_not_in_snippet');
      }
    }
  }

  if (strictEvidence) {
    if (retrievedAt && !isValidIsoDateTime(retrievedAt)) {
      missing.push('retrieved_at_invalid');
    }
    const allowedExtractionMethods = new Set([
      'spec_table_match',
      'parse_template',
      'json_ld',
      'llm_extract',
      'api_fetch',
      'component_db_inference'
    ]);
    if (extractionMethod && !allowedExtractionMethods.has(extractionMethod)) {
      missing.push('extraction_method_invalid');
    }

    const sourceRows = context?.evidencePack?.sources;
    if (sourceId && sourceRows && Array.isArray(sourceRows) && sourceRows.length > 0) {
      const foundSource = sourceRows.some((row) => normalizeText(row?.id) === sourceId);
      if (!foundSource) {
        missing.push('source_id_not_found');
      }
    } else if (sourceId && sourceRows && isObject(sourceRows) && Object.keys(sourceRows).length > 0) {
      const foundSource = Object.prototype.hasOwnProperty.call(sourceRows, sourceId);
      if (!foundSource) {
        missing.push('source_id_not_found');
      }
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      reason_code: reasonCode,
      missing
    };
  }
  return { ok: true };
}
