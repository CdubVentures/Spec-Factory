const FIELD_TERM_HINTS = {
  lngth: ['length', 'long', 'mm', 'cm', 'inch', 'inches'],
  width: ['width', 'wide', 'mm', 'cm', 'inch', 'inches'],
  height: ['height', 'tall', 'mm', 'cm', 'inch', 'inches'],
  weight: ['weight', 'gram', 'grams', 'g'],
  colors: ['color', 'colour', 'black', 'white', 'red', 'blue'],
  coating: ['coating', 'coat', 'finish', 'surface'],
  material: ['material', 'plastic', 'aluminum', 'aluminium', 'magnesium', 'shell', 'body'],
  connection: ['connection', 'connectivity', 'wired', 'wireless', 'usb', 'usb-c', 'hdmi', 'displayport', 'dp'],
  wireless_technology: ['wireless', 'bluetooth', '2.4ghz', 'wifi', 'rf'],
  cable_type: ['cable', 'usb', 'usb-c', 'micro-usb', 'lightning'],
  cable_length: ['cable length', 'length', 'meter', 'meters', 'm', 'mm', 'cm', 'ft', 'feet']
};

const IDENTITY_FIELDS = new Set(['brand', 'model', 'variant', 'sku', 'mpn', 'gtin', 'base_model']);
const SEARCH_HOST_MARKERS = ['google.', 'bing.', 'search.brave.', 'searx', 'yahoo.'];

export function uniqueTokens(tokens = []) {
  return [...new Set((tokens || []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
}

export function inferImageMimeFromUri(value = '') {
  const token = String(value || '').trim().toLowerCase();
  if (token.endsWith('.png')) return 'image/png';
  if (token.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export function normalizeVisualAssetsFromEvidencePack(evidencePack = {}) {
  const fromPack = Array.isArray(evidencePack?.visual_assets)
    ? evidencePack.visual_assets
    : [];
  const fromRefs = Array.isArray(evidencePack?.references)
    ? evidencePack.references
        .filter((row) => String(row?.file_uri || '').trim())
        .map((row) => ({
          id: String(row?.id || '').trim(),
          kind: String(row?.type || '').trim() || 'visual_asset',
          source_id: String(row?.source_id || '').trim(),
          source_url: String(row?.url || '').trim(),
          file_uri: String(row?.file_uri || '').trim(),
          mime_type: String(row?.mime_type || '').trim(),
          content_hash: String(row?.content_hash || '').trim(),
          width: Number(row?.width || 0) || null,
          height: Number(row?.height || 0) || null,
          size_bytes: Number(row?.size_bytes || 0) || null,
          surface: String(row?.surface || '').trim()
        }))
    : [];
  const dedupe = new Map();
  for (const row of [...fromPack, ...fromRefs]) {
    const uri = String(row?.file_uri || '').trim();
    if (!uri) continue;
    const key = `${uri}|${String(row?.content_hash || '').trim()}`;
    if (!dedupe.has(key)) {
      dedupe.set(key, {
        id: String(row?.id || '').trim() || '',
        kind: String(row?.kind || row?.type || '').trim() || 'visual_asset',
        source_id: String(row?.source_id || '').trim() || '',
        source_url: String(row?.source_url || row?.url || '').trim() || '',
        file_uri: uri,
        mime_type: String(row?.mime_type || '').trim() || '',
        content_hash: String(row?.content_hash || '').trim() || '',
        width: Number(row?.width || 0) || null,
        height: Number(row?.height || 0) || null,
        size_bytes: Number(row?.size_bytes || 0) || null,
        surface: String(row?.surface || '').trim() || ''
      });
    }
  }
  return [...dedupe.values()];
}

function collectSnippetAndRefMaps(evidencePack = {}) {
  const snippetById = new Map();
  for (const row of evidencePack?.snippets || []) {
    const id = String(row?.id || '').trim();
    if (id) {
      snippetById.set(id, row);
    }
  }
  if (
    snippetById.size === 0 &&
    evidencePack?.snippets &&
    typeof evidencePack.snippets === 'object' &&
    !Array.isArray(evidencePack.snippets)
  ) {
    for (const [id, row] of Object.entries(evidencePack.snippets || {})) {
      const key = String(id || '').trim();
      if (key) {
        snippetById.set(key, row);
      }
    }
  }

  const refById = new Map();
  for (const row of evidencePack?.references || []) {
    const id = String(row?.id || '').trim();
    if (id) {
      refById.set(id, row);
    }
  }
  return {
    snippetById,
    refById
  };
}

function fieldHintSet(snippet = {}) {
  const set = new Set();
  for (const hint of snippet?.field_hints || []) {
    const token = String(hint || '').trim().toLowerCase();
    if (token) {
      set.add(token);
    }
  }
  return set;
}

function fieldTokens(field = '') {
  const key = String(field || '').trim().toLowerCase();
  return uniqueTokens([
    key.replace(/_/g, ' '),
    ...(FIELD_TERM_HINTS[key] || [])
  ]);
}

function countTokenHits(text = '', tokens = []) {
  const source = String(text || '').toLowerCase();
  let hits = 0;
  for (const token of uniqueTokens(tokens)) {
    if (token && source.includes(token)) {
      hits += 1;
    }
  }
  return hits;
}

function hasDimensionSignal(text = '') {
  return /\b\d+(?:\.\d+)?\s?(mm|cm|in|inch|inches|g|gram|grams)\b/i.test(String(text || ''));
}

function normalizeSourceToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function hostFromUrl(value = '') {
  try {
    return String(new URL(String(value || '')).host || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function inferSourceFingerprint(row = {}) {
  const sourceId = normalizeSourceToken(row?.source_id || row?.source || '');
  if (sourceId) return sourceId;
  const host = hostFromUrl(row?.url || row?.source_url || '');
  if (host) return host;
  const id = String(row?.id || '').trim();
  if (id) return `id:${id.toLowerCase()}`;
  return 'unknown_source';
}

function isSearchHost(host = '') {
  const token = String(host || '').trim().toLowerCase();
  if (!token) return false;
  return SEARCH_HOST_MARKERS.some((marker) => token.includes(marker));
}

function isWebSearchSourceRow(row = {}) {
  const sourceId = normalizeSourceToken(row?.source_id || row?.source || '');
  const typeToken = normalizeSourceToken(row?.type || row?.surface || '');
  const urlHost = hostFromUrl(row?.url || row?.source_url || '');
  if (sourceId.includes('search') || sourceId.includes('serp')) return true;
  if (typeToken.includes('search') || typeToken.includes('serp')) return true;
  return isSearchHost(urlHost);
}

function applySingleSourceSelection(scoredSnippets = []) {
  if (!Array.isArray(scoredSnippets) || scoredSnippets.length === 0) return [];
  const buckets = new Map();
  for (const snippet of scoredSnippets) {
    const key = inferSourceFingerprint(snippet);
    const score = Number(snippet?._score || 0);
    const item = buckets.get(key) || { totalScore: 0, snippets: [] };
    item.totalScore += score;
    item.snippets.push(snippet);
    buckets.set(key, item);
  }
  const best = [...buckets.entries()]
    .sort((a, b) => {
      if (a[1].totalScore !== b[1].totalScore) return b[1].totalScore - a[1].totalScore;
      return b[1].snippets.length - a[1].snippets.length;
    })[0];
  if (!best) return [];
  return best[1].snippets;
}

export function selectBatchEvidence({
  evidencePack = {},
  batchFields = [],
  config = {},
  routePolicy = null
} = {}) {
  const wantedFields = uniqueTokens((batchFields || []).map((field) => String(field || '').trim().toLowerCase()));
  const wantsOnlyIdentity = wantedFields.length > 0 && wantedFields.every((field) => IDENTITY_FIELDS.has(field));
  const { snippetById, refById } = collectSnippetAndRefMaps(evidencePack);
  const policy = routePolicy && typeof routePolicy === 'object' ? routePolicy : {};
  const allowWebsearch = policy.enable_websearch !== false;
  const allowAllSources = policy.all_source_data === true;
  const forceSingleSource = allowAllSources ? false : policy.single_source_data === true;
  const selectedSnippets = [];
  const selectedRefs = [];
  const selectedIds = new Set();
  const scoredSnippets = [];

  const allSnippets = [...snippetById.entries()].map(([id, row]) => ({
    id,
    ...row
  }));

  for (const snippet of allSnippets) {
    const linkedRef = refById.get(String(snippet?.id || '').trim()) || null;
    if (!allowWebsearch && isWebSearchSourceRow({ ...(snippet || {}), ...(linkedRef || {}) })) {
      continue;
    }
    const snippetType = String(snippet?.type || '').toLowerCase();
    const normalizedText = String(snippet?.normalized_text || snippet?.text || '');
    const text = normalizedText.toLowerCase();
    const hints = fieldHintSet(snippet);
    const hintHits = wantedFields.filter((field) => hints.has(field)).length;
    const lexicalHits = wantedFields.reduce((acc, field) => acc + countTokenHits(text, fieldTokens(field)), 0);
    const dimensionSignal = hasDimensionSignal(text);
    const relevant = hintHits > 0 || lexicalHits > 0;
    if (!relevant) {
      continue;
    }
    if (!wantsOnlyIdentity && snippetType.includes('json_ld') && lexicalHits === 0) {
      continue;
    }
    if (config.llmExtractSkipLowSignal !== false && lexicalHits === 0 && hintHits === 0) {
      continue;
    }
    const score =
      (hintHits * 5) +
      (lexicalHits * 3) +
      (dimensionSignal ? 2 : 0) +
      (snippetType === 'text' || snippetType === 'window' ? 1 : 0);
    scoredSnippets.push({
      ...snippet,
      _score: score,
      _length: normalizedText.length
    });
  }

  const maxSnippetsBase = Math.max(1, Number.parseInt(String(config.llmExtractMaxSnippetsPerBatch || 6), 10) || 6);
  const maxSnippets = allowAllSources
    ? Math.max(maxSnippetsBase, Math.min(maxSnippetsBase * 2, 24))
    : maxSnippetsBase;
  const sortedSnippets = scoredSnippets
    .sort((a, b) => (b._score - a._score) || (a._length - b._length))
    .slice(0, allowAllSources ? Math.max(maxSnippets * 2, 12) : maxSnippets);
  const candidateSnippets = forceSingleSource
    ? applySingleSourceSelection(sortedSnippets)
    : sortedSnippets;
  candidateSnippets
    .slice(0, maxSnippets)
    .forEach((snippet) => {
      selectedSnippets.push(snippet);
      selectedIds.add(snippet.id);
    });

  if (selectedSnippets.length === 0) {
    return {
      references: [],
      snippets: [],
      visual_assets: []
    };
  }

  for (const id of selectedIds) {
    if (refById.has(id)) {
      const row = refById.get(id);
      selectedRefs.push({
        id: String(row?.id || id).trim(),
        source_id: row?.source_id || row?.source || '',
        url: row?.url || '',
        type: row?.type || 'text',
        snippet_hash: row?.snippet_hash || '',
        file_uri: row?.file_uri || '',
        mime_type: row?.mime_type || '',
        content_hash: row?.content_hash || '',
        width: Number(row?.width || 0) || null,
        height: Number(row?.height || 0) || null,
        size_bytes: Number(row?.size_bytes || 0) || null,
        surface: row?.surface || ''
      });
      continue;
    }
    const snippet = snippetById.get(id);
    if (!snippet) {
      continue;
    }
    selectedRefs.push({
      id,
      url: snippet?.url || evidencePack?.meta?.url || '',
      type: snippet?.type || 'text',
      source_id: snippet?.source_id || snippet?.source || '',
      snippet_hash: snippet?.snippet_hash || '',
      file_uri: snippet?.file_uri || '',
      mime_type: snippet?.mime_type || '',
      content_hash: snippet?.content_hash || '',
      width: Number(snippet?.width || 0) || null,
      height: Number(snippet?.height || 0) || null,
      size_bytes: Number(snippet?.size_bytes || 0) || null,
      surface: snippet?.surface || ''
    });
  }

  const selectedRefUris = new Set(
    selectedRefs
      .map((row) => String(row?.file_uri || '').trim())
      .filter(Boolean)
  );
  const selectedSourceIds = new Set(
    selectedRefs
      .map((row) => String(row?.source_id || '').trim())
      .filter(Boolean)
  );
  const selectedSourceTokens = new Set(
    [...selectedSourceIds]
      .map((token) => normalizeSourceToken(token))
      .filter(Boolean)
  );
  const selectedHosts = new Set(
    selectedRefs
      .map((row) => hostFromUrl(row?.url || ''))
      .filter(Boolean)
  );
  const selectedVisualAssets = normalizeVisualAssetsFromEvidencePack(evidencePack).filter((row) => {
    const uri = String(row?.file_uri || '').trim();
    const sourceId = String(row?.source_id || '').trim();
    const sourceToken = normalizeSourceToken(sourceId);
    const sourceHost = hostFromUrl(row?.source_url || '');
    if (uri && selectedRefUris.has(uri)) {
      return true;
    }
    if (sourceId && selectedSourceIds.has(sourceId)) {
      return true;
    }
    if (sourceToken && selectedSourceTokens.has(sourceToken)) {
      return true;
    }
    if (sourceHost && selectedHosts.has(sourceHost)) {
      return true;
    }
    return false;
  });

  return {
    references: selectedRefs,
    snippets: selectedSnippets.map(({ _score, _length, ...row }) => row),
    visual_assets: selectedVisualAssets
  };
}
