import { normalizeWhitespace } from '../../../../utils/common.js';
import { buildEvidenceCandidateFingerprint } from '../../extraction/evidencePack.js';

export function selectAggressiveEvidencePack(sourceResults = []) {
  const ranked = (sourceResults || [])
    .filter((row) => row?.llmEvidencePack)
    .sort((a, b) => {
      const aIdentity = a.identity?.match ? 1 : 0;
      const bIdentity = b.identity?.match ? 1 : 0;
      if (bIdentity !== aIdentity) {
        return bIdentity - aIdentity;
      }
      const aAnchor = (a.anchorCheck?.majorConflicts || []).length;
      const bAnchor = (b.anchorCheck?.majorConflicts || []).length;
      if (aAnchor !== bAnchor) {
        return aAnchor - bAnchor;
      }
      const aSnippets = Number(a.llmEvidencePack?.meta?.snippet_count || 0);
      const bSnippets = Number(b.llmEvidencePack?.meta?.snippet_count || 0);
      if (bSnippets !== aSnippets) {
        return bSnippets - aSnippets;
      }
      return Number(a.tier || 99) - Number(b.tier || 99);
    });
  return ranked[0]?.llmEvidencePack || null;
}

export function selectAggressiveDomHtml(artifactsByHost = {}) {
  let best = '';
  for (const row of Object.values(artifactsByHost || {})) {
    const html = String(row?.domHtml || row?.html || '');
    if (html.length > best.length) {
      best = html;
    }
  }
  return best;
}

export function buildDomSnippetArtifact(html = '', maxChars = 3_600) {
  const pageHtml = String(html || '');
  if (!pageHtml) return null;
  const cap = Math.max(600, Math.min(20_000, Number(maxChars || 3_600)));
  const attributeKeywordToken = '(?:\\bspec(?:ification)?s?\\b|\\btechnical\\b|\\bperformance\\b|\\bdimensions?\\b|\\bpolling\\b|\\bsensor\\b|\\bweight\\b|\\bdpi\\b|\\bcpi\\b|\\bbattery\\b|\\bwireless\\b)';
  const pivotKeywordSource = '\\b(spec(?:ification)?s?|technical|performance|dimensions?|polling|sensor|weight|dpi|cpi|switch(?:es)?|battery|wireless)\\b';
  const pivotKeywordRe = new RegExp(pivotKeywordSource, 'i');
  const pivotKeywordGlobalRe = new RegExp(pivotKeywordSource, 'gi');
  const specMetricRe = /\b\d{2,5}(?:,\d{3})?(?:\s*(?:g|hz|dpi|cpi|ips|mah|mm|ms|hours?|hr))?\b/gi;
  const bodyHtml = pageHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || pageHtml;
  const candidates = [
    { kind: 'table', pattern: /<table[\s\S]*?<\/table>/i },
    { kind: 'definition_list', pattern: /<dl[\s\S]*?<\/dl>/i },
    { kind: 'spec_section', pattern: new RegExp(`<section[^>]*${attributeKeywordToken}[^>]*>[\\s\\S]*?<\\/section>`, 'i') }
  ];
  for (const candidate of candidates) {
    const match = bodyHtml.match(candidate.pattern);
    if (match?.[0]) {
      const snippetHtml = String(match[0]).slice(0, cap);
      return {
        kind: candidate.kind,
        html: snippetHtml,
        char_count: snippetHtml.length
      };
    }
  }
  const keywordMatches = [...bodyHtml.matchAll(new RegExp(pivotKeywordSource, 'gi'))].slice(0, 128);
  let snippetHtml = '';
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const match of keywordMatches) {
    const pivot = Math.max(0, Number(match.index || 0));
    const start = Math.max(0, pivot > 0 ? pivot - Math.floor(cap * 0.25) : 0);
    const end = Math.min(bodyHtml.length, start + cap);
    const candidateHtml = bodyHtml.slice(start, end);
    const keywordCount = (candidateHtml.match(pivotKeywordGlobalRe) || []).length;
    const metricCount = (candidateHtml.match(specMetricRe) || []).length;
    const listCount = (candidateHtml.match(/<li\b/gi) || []).length;
    const sectionCount = (candidateHtml.match(/<(section|table|dl|ul|ol)\b/gi) || []).length;
    const linkCount = (candidateHtml.match(/<a\b/gi) || []).length;
    const menuPenalty = (candidateHtml.match(/\b(?:mega-menu|submenu|focusible-menu|buy|shop|cart)\b/gi) || []).length;
    const score = (keywordCount * 10) + (metricCount * 7) + (listCount * 3) + (sectionCount * 2) - (linkCount * 4) - (menuPenalty * 8);
    if (score > bestScore) {
      bestScore = score;
      snippetHtml = candidateHtml;
    }
  }
  if (!snippetHtml) {
    const pivotMatch = pivotKeywordRe.exec(bodyHtml);
    const pivot = Math.max(0, pivotMatch?.index || 0);
    const start = Math.max(0, pivot > 0 ? pivot - Math.floor(cap * 0.25) : 0);
    const end = Math.min(bodyHtml.length, start + cap);
    snippetHtml = bodyHtml.slice(start, end);
  }
  if (!snippetHtml.trim()) return null;
  return {
    kind: 'html_window',
    html: snippetHtml,
    char_count: snippetHtml.length
  };
}

export function normalizedSnippetRows(evidencePack) {
  if (!evidencePack) {
    return [];
  }
  if (Array.isArray(evidencePack.snippets)) {
    return evidencePack.snippets
      .map((row) => ({
        id: String(row?.id || '').trim(),
        text: normalizeWhitespace(String(row?.normalized_text || row?.text || '')).toLowerCase()
      }))
      .filter((row) => row.id && row.text);
  }
  if (evidencePack.snippets && typeof evidencePack.snippets === 'object') {
    return Object.entries(evidencePack.snippets)
      .map(([id, row]) => ({
        id: String(id || '').trim(),
        text: normalizeWhitespace(String(row?.normalized_text || row?.text || '')).toLowerCase()
      }))
      .filter((row) => row.id && row.text);
  }
  return [];
}

export function enrichFieldCandidatesWithEvidenceRefs(fieldCandidates = [], evidencePack = null) {
  const deterministicBindings = evidencePack?.candidate_bindings && typeof evidencePack.candidate_bindings === 'object'
    ? evidencePack.candidate_bindings
    : {};
  const snippetRows = normalizedSnippetRows(evidencePack);
  if (!snippetRows.length && !Object.keys(deterministicBindings).length) {
    return fieldCandidates;
  }

  return (fieldCandidates || []).map((candidate) => {
    const existingRefs = Array.isArray(candidate?.evidenceRefs)
      ? candidate.evidenceRefs.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    if (existingRefs.length > 0) {
      return candidate;
    }

    const deterministicFingerprint = buildEvidenceCandidateFingerprint(candidate);
    const deterministicSnippetId = deterministicBindings[deterministicFingerprint];
    if (deterministicSnippetId) {
      return {
        ...candidate,
        evidenceRefs: [deterministicSnippetId],
        evidenceRefOrigin: 'deterministic_binding'
      };
    }

    const value = normalizeWhitespace(String(candidate?.value || '')).toLowerCase();
    if (!value || value === 'unk') {
      return candidate;
    }
    const fieldToken = String(candidate?.field || '').replace(/_/g, ' ').toLowerCase().trim();

    let match = snippetRows.find((row) => row.text.includes(value) && (!fieldToken || row.text.includes(fieldToken)));
    if (!match) {
      match = snippetRows.find((row) => row.text.includes(value));
    }
    if (!match) {
      return candidate;
    }

    return {
      ...candidate,
      evidenceRefs: [match.id],
      evidenceRefOrigin: 'heuristic_snippet_match'
    };
  });
}

export function buildTopEvidenceReferences(provenance, limit = 60) {
  const rows = [];
  const seen = new Set();
  for (const [field, row] of Object.entries(provenance || {})) {
    for (const evidence of row?.evidence || []) {
      const key = `${field}|${evidence.url}|${evidence.keyPath}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      rows.push({
        field,
        url: evidence.url,
        host: evidence.host,
        method: evidence.method,
        keyPath: evidence.keyPath,
        tier: evidence.tier,
        tier_name: evidence.tierName
      });
      if (rows.length >= limit) {
        return rows;
      }
    }
  }
  return rows;
}
