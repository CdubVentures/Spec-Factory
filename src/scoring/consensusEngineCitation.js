import { INSTRUMENTED_HOST_HINTS } from '../constants.js';
import { normalizeWhitespace } from '../utils/common.js';

export function isInstrumentedEvidenceSource(source) {
  const rootDomain = String(source.rootDomain || '').toLowerCase();
  if (source.tierName === 'lab') {
    return true;
  }
  return INSTRUMENTED_HOST_HINTS.has(rootDomain);
}

export function buildSnippetIndex(evidencePack = null) {
  const referencesById = new Map();
  const snippetsById = new Map();

  if (Array.isArray(evidencePack?.references)) {
    for (const row of evidencePack.references) {
      const id = String(row?.id || '').trim();
      if (!id) {
        continue;
      }
      referencesById.set(id, row);
    }
  }

  if (Array.isArray(evidencePack?.snippets)) {
    for (const row of evidencePack.snippets) {
      const id = String(row?.id || '').trim();
      if (!id) {
        continue;
      }
      snippetsById.set(id, row);
    }
  } else if (evidencePack?.snippets && typeof evidencePack.snippets === 'object') {
    for (const [id, row] of Object.entries(evidencePack.snippets || {})) {
      const key = String(id || '').trim();
      if (!key) {
        continue;
      }
      snippetsById.set(key, row);
    }
  }

  if (snippetsById.size === 0 && evidencePack?.snippets_by_id && typeof evidencePack.snippets_by_id === 'object') {
    for (const [id, row] of Object.entries(evidencePack.snippets_by_id || {})) {
      const key = String(id || '').trim();
      if (!key) {
        continue;
      }
      snippetsById.set(key, row);
    }
  }

  return {
    referencesById,
    snippetsById
  };
}

export function resolveCitationFromCandidate(source, candidate, evidenceIndexCache) {
  const evidenceRefs = Array.isArray(candidate?.evidenceRefs)
    ? [...new Set(candidate.evidenceRefs.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  if (evidenceRefs.length === 0) {
    return null;
  }

  let index = evidenceIndexCache.get(source);
  if (!index) {
    index = buildSnippetIndex(source?.llmEvidencePack || null);
    evidenceIndexCache.set(source, index);
  }
  for (const refId of evidenceRefs) {
    const reference = index.referencesById.get(refId) || null;
    const snippet = index.snippetsById.get(refId) || null;
    const quote = normalizeWhitespace(snippet?.normalized_text || snippet?.text || reference?.content || '');
    const url = reference?.url || source?.finalUrl || source?.url;
    if (!url) {
      continue;
    }
    return {
      snippetId: refId,
      snippetHash: String(snippet?.snippet_hash || reference?.snippet_hash || '').trim(),
      sourceId: String(
        snippet?.source_id ||
        source?.sourceId ||
        source?.llmEvidencePack?.meta?.source_id ||
        ''
      ).trim(),
      quote,
      retrievedAt: String(
        snippet?.retrieved_at ||
        source?.llmEvidencePack?.meta?.updated_at ||
        source?.ts ||
        new Date().toISOString()
      ),
      extractionMethod: String(
        snippet?.extraction_method ||
        candidate?.method ||
        'llm_extract'
      ).trim(),
      referenceUrl: url,
      fileUri: String(snippet?.file_uri || reference?.file_uri || '').trim(),
      mimeType: String(snippet?.mime_type || reference?.mime_type || '').trim(),
      contentHash: String(snippet?.content_hash || reference?.content_hash || '').trim(),
      surface: String(snippet?.surface || reference?.surface || '').trim(),
      evidenceRefs
    };
  }
  return null;
}
