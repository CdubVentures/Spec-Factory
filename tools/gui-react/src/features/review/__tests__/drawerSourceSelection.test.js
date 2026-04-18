import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const MODULE_PATH = 'tools/gui-react/src/features/review/selectors/publishedSourceSelectors.ts';

async function load() {
  return loadBundledModule(MODULE_PATH, { prefix: 'pub-sources-' });
}

function cand(overrides = {}) {
  return {
    candidate_id: 'x',
    value: 'v',
    score: 0.5,
    source_id: '',
    source: '',
    tier: null,
    method: null,
    status: 'candidate',
    evidence_url: null,
    metadata: null,
    variant_id: null,
    variant_label: null,
    variant_type: null,
    ...overrides,
  };
}

function refsMeta(refs) {
  return { evidence_refs: refs };
}

// ── normalizeTier ────────────────────────────────────────────────

test('normalizeTier: string passes through', async () => {
  const mod = await load();
  assert.equal(mod.normalizeTier('tier1'), 'tier1');
  assert.equal(mod.normalizeTier('other'), 'other');
});

test('normalizeTier: number → tier{n}', async () => {
  const mod = await load();
  assert.equal(mod.normalizeTier(3), 'tier3');
  assert.equal(mod.normalizeTier(1), 'tier1');
});

test('normalizeTier: empty/null/undefined → null', async () => {
  const mod = await load();
  assert.equal(mod.normalizeTier(''), null);
  assert.equal(mod.normalizeTier(null), null);
  assert.equal(mod.normalizeTier(undefined), null);
});

// ── normalizeConfidence ─────────────────────────────────────────

test('normalizeConfidence: clamps to [0,100] and rounds to int', async () => {
  const mod = await load();
  assert.equal(mod.normalizeConfidence(85.4), 85);
  assert.equal(mod.normalizeConfidence(85.5), 86);
  assert.equal(mod.normalizeConfidence(-5), 0);
  assert.equal(mod.normalizeConfidence(150), 100);
  assert.equal(mod.normalizeConfidence(0), 0);
  assert.equal(mod.normalizeConfidence(100), 100);
});

test('normalizeConfidence: non-number / non-finite → null', async () => {
  const mod = await load();
  assert.equal(mod.normalizeConfidence(null), null);
  assert.equal(mod.normalizeConfidence(undefined), null);
  assert.equal(mod.normalizeConfidence('85'), null);
  assert.equal(mod.normalizeConfidence(NaN), null);
  assert.equal(mod.normalizeConfidence(Infinity), null);
});

// ── resolveEvidenceSources (per-candidate shape normalizer) ────

test('resolveEvidenceSources: evidence_refs shape wins when present', async () => {
  const mod = await load();
  const c = cand({
    metadata: refsMeta([
      { url: 'https://a.com', tier: 'tier1', confidence: 90 },
      { url: 'https://b.com', tier: 2, confidence: 75 },
    ]),
  });
  const out = mod.resolveEvidenceSources(c);
  assert.deepEqual(out, [
    { url: 'https://a.com', tier: 'tier1', confidence: 90 },
    { url: 'https://b.com', tier: 'tier2', confidence: 75 },
  ]);
});

test('resolveEvidenceSources: legacy evidence_sources fallback', async () => {
  const mod = await load();
  const c = cand({
    metadata: { evidence_sources: [
      { source_url: 'https://x.com', tier: 'tier3', confidence: 50 },
      { source_url: 'https://y.com', tier: 2 },
    ] },
  });
  const out = mod.resolveEvidenceSources(c);
  assert.deepEqual(out, [
    { url: 'https://x.com', tier: 'tier3', confidence: 50 },
    { url: 'https://y.com', tier: 'tier2', confidence: null },
  ]);
});

test('resolveEvidenceSources: evidence_url fallback when no metadata refs', async () => {
  const mod = await load();
  const c = cand({ evidence_url: 'https://y.com', tier: 2 });
  const out = mod.resolveEvidenceSources(c);
  assert.deepEqual(out, [{ url: 'https://y.com', tier: 'tier2', confidence: null }]);
});

test('resolveEvidenceSources: empty refs → empty output', async () => {
  const mod = await load();
  const c = cand({ metadata: refsMeta([]), evidence_url: null });
  assert.deepEqual(mod.resolveEvidenceSources(c), []);
});

test('resolveEvidenceSources: refs without url are skipped', async () => {
  const mod = await load();
  const c = cand({
    metadata: refsMeta([
      { url: '', tier: 'tier1', confidence: 90 },
      { url: 'https://a.com', tier: 'tier2', confidence: 80 },
      { tier: 'tier3', confidence: 70 }, // missing url
    ]),
  });
  const out = mod.resolveEvidenceSources(c);
  assert.deepEqual(out, [{ url: 'https://a.com', tier: 'tier2', confidence: 80 }]);
});

// ── candidateMatchesVariant ─────────────────────────────────────

test('candidateMatchesVariant: top-level variant_id match wins', async () => {
  const mod = await load();
  const c = cand({ variant_id: 'v123', variant_label: null });
  assert.equal(
    mod.candidateMatchesVariant(c, { variant_label: 'black', variant_type: 'color' }, 'v123'),
    true,
  );
});

test('candidateMatchesVariant: metadata.variant_label fallback when top-level missing', async () => {
  const mod = await load();
  const c = cand({
    variant_id: null,
    variant_label: null,
    metadata: { variant_label: 'black', variant_type: 'color' },
  });
  assert.equal(
    mod.candidateMatchesVariant(c, { variant_label: 'black', variant_type: 'color' }, 'v123'),
    true,
  );
});

test('candidateMatchesVariant: false when labels differ', async () => {
  const mod = await load();
  const c = cand({ variant_id: null, variant_label: 'white', variant_type: 'color' });
  assert.equal(
    mod.candidateMatchesVariant(c, { variant_label: 'black', variant_type: 'color' }, 'v123'),
    false,
  );
});

test('candidateMatchesVariant: variant_type mismatch rejects', async () => {
  const mod = await load();
  const c = cand({ variant_id: null, variant_label: 'retro', variant_type: 'color' });
  assert.equal(
    mod.candidateMatchesVariant(c, { variant_label: 'retro', variant_type: 'edition' }, 'v123'),
    false,
  );
});

// ── filterResolvedCandidates ─────────────────────────────────────

test('filterResolvedCandidates: drops non-resolved', async () => {
  const mod = await load();
  const cs = [
    cand({ candidate_id: '1', status: 'resolved' }),
    cand({ candidate_id: '2', status: 'candidate' }),
    cand({ candidate_id: '3', status: 'resolved' }),
    cand({ candidate_id: '4', status: null }),
  ];
  const out = mod.filterResolvedCandidates(cs);
  assert.deepEqual(out.map((c) => c.candidate_id), ['1', '3']);
});

// ── serializeCandidateValue + candidateValueMatches ─────────────

test('serializeCandidateValue: primitives + arrays + null', async () => {
  const mod = await load();
  assert.equal(mod.serializeCandidateValue('abc'), 'abc');
  assert.equal(mod.serializeCandidateValue(null), 'null');
  assert.equal(mod.serializeCandidateValue(undefined), 'null');
  assert.equal(mod.serializeCandidateValue(42), '42');
  assert.equal(mod.serializeCandidateValue(['a', 'b']), JSON.stringify(['a', 'b']));
});

test('candidateValueMatches: equal serialized forms', async () => {
  const mod = await load();
  assert.equal(mod.candidateValueMatches('2025-10-10', '2025-10-10'), true);
  assert.equal(mod.candidateValueMatches('2025-10-10', '2025-10-11'), false);
  assert.equal(mod.candidateValueMatches(null, null), true);
  assert.equal(mod.candidateValueMatches('[\"a\",\"b\"]', ['a', 'b']), true);
});

// ── collectPublishedSources (top-level composition) ─────────────

test('collectPublishedSources: resolved-only + flatten + sort by confidence desc', async () => {
  const mod = await load();
  const cs = [
    cand({ candidate_id: '1', status: 'resolved', metadata: refsMeta([
      { url: 'https://a.com', tier: 'tier1', confidence: 70 },
    ]) }),
    cand({ candidate_id: '2', status: 'resolved', metadata: refsMeta([
      { url: 'https://b.com', tier: 'tier2', confidence: 90 },
      { url: 'https://c.com', tier: 'tier1', confidence: 85 },
    ]) }),
    cand({ candidate_id: '3', status: 'candidate', metadata: refsMeta([
      { url: 'https://d.com', tier: 'tier1', confidence: 100 },
    ]) }),
  ];
  const out = mod.collectPublishedSources(cs);
  assert.equal(out.length, 3);
  assert.equal(out[0].url, 'https://b.com');
  assert.equal(out[1].url, 'https://c.com');
  assert.equal(out[2].url, 'https://a.com');
});

test('collectPublishedSources: dedupe by URL keeps max confidence', async () => {
  const mod = await load();
  const cs = [
    cand({ candidate_id: '1', status: 'resolved', metadata: refsMeta([
      { url: 'https://a.com', tier: 'tier1', confidence: 70 },
    ]) }),
    cand({ candidate_id: '2', status: 'resolved', metadata: refsMeta([
      { url: 'https://a.com', tier: 'tier3', confidence: 95 },
    ]) }),
  ];
  const out = mod.collectPublishedSources(cs);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://a.com');
  assert.equal(out[0].confidence, 95);
});

test('collectPublishedSources: dedupe prefers non-null confidence when collision', async () => {
  const mod = await load();
  const cs = [
    cand({ candidate_id: '1', status: 'resolved', evidence_url: 'https://a.com', tier: 1 }),
    cand({ candidate_id: '2', status: 'resolved', metadata: refsMeta([
      { url: 'https://a.com', tier: 'tier1', confidence: 50 },
    ]) }),
  ];
  const out = mod.collectPublishedSources(cs);
  assert.equal(out.length, 1);
  assert.equal(out[0].confidence, 50);
});

test('collectPublishedSources: stable URL asc tiebreak when confidence equal', async () => {
  const mod = await load();
  const cs = [
    cand({ candidate_id: '1', status: 'resolved', metadata: refsMeta([
      { url: 'https://c.com', tier: 'tier1', confidence: 80 },
      { url: 'https://a.com', tier: 'tier1', confidence: 80 },
      { url: 'https://b.com', tier: 'tier1', confidence: 80 },
    ]) }),
  ];
  const out = mod.collectPublishedSources(cs);
  assert.deepEqual(out.map((s) => s.url), ['https://a.com', 'https://b.com', 'https://c.com']);
});

test('collectPublishedSources: empty candidates → empty output', async () => {
  const mod = await load();
  assert.deepEqual(mod.collectPublishedSources([]), []);
});

test('collectPublishedSources: resolved candidates with no refs → empty output', async () => {
  const mod = await load();
  const cs = [cand({ status: 'resolved', metadata: refsMeta([]), evidence_url: null })];
  assert.deepEqual(mod.collectPublishedSources(cs), []);
});

// ── collectPublishedSourcesForVariant (per-variant candidate rows) ─
// WHY: Under the per-variant candidate model, each variant gets its own
// field_candidates row with metadata.variant_key set. The selector matches
// candidates to a target variantKey via metadata.variant_key and pulls the
// candidate's own evidence_refs — no more shared-evidence fallback.

test('collectPublishedSourcesForVariant: returns only the matching variant candidate evidence', async () => {
  const mod = await load();
  const cs = [
    cand({
      candidate_id: '1', status: 'resolved',
      metadata: {
        variant_key: 'color:black',
        evidence_refs: [{ url: 'https://black-specific.com', tier: 'tier1', confidence: 92 }],
      },
    }),
    cand({
      candidate_id: '2', status: 'resolved',
      metadata: {
        variant_key: 'color:white',
        evidence_refs: [{ url: 'https://white-specific.com', tier: 'tier2', confidence: 80 }],
      },
    }),
  ];
  const out = mod.collectPublishedSourcesForVariant(cs, 'color:black');
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://black-specific.com');
  assert.equal(out[0].confidence, 92);
});

test('collectPublishedSourcesForVariant: returns empty when no candidate matches the variantKey', async () => {
  const mod = await load();
  const cs = [
    cand({
      candidate_id: '1', status: 'resolved',
      metadata: {
        variant_key: 'color:black',
        evidence_refs: [{ url: 'https://black.com', tier: 'tier1', confidence: 90 }],
      },
    }),
  ];
  const out = mod.collectPublishedSourcesForVariant(cs, 'color:white');
  assert.equal(out.length, 0);
});

test('collectPublishedSourcesForVariant: excludes candidates with no variant_key from per-variant queries', async () => {
  const mod = await load();
  const cs = [
    cand({
      candidate_id: '1', status: 'resolved',
      metadata: refsMeta([{ url: 'https://g.com', tier: 'tier1', confidence: 75 }]),
    }),
  ];
  // No variant_key in metadata → does not contribute to any variant query
  const out = mod.collectPublishedSourcesForVariant(cs, 'color:anything');
  assert.equal(out.length, 0);
});

test('collectPublishedSourcesForVariant: aggregates across multiple per-variant candidates for the same variant', async () => {
  const mod = await load();
  const cs = [
    cand({
      candidate_id: 'run1', status: 'resolved',
      metadata: {
        variant_key: 'color:black',
        evidence_refs: [{ url: 'https://a.com', tier: 'tier1', confidence: 60 }],
      },
    }),
    cand({
      candidate_id: 'run2', status: 'resolved',
      metadata: {
        variant_key: 'color:black',
        evidence_refs: [
          { url: 'https://b.com', tier: 'tier2', confidence: 85 },
          { url: 'https://a.com', tier: 'tier1', confidence: 90 },
        ],
      },
    }),
  ];
  const out = mod.collectPublishedSourcesForVariant(cs, 'color:black');
  // Dedupe a.com keeps max confidence (90 wins over 60)
  assert.equal(out.length, 2);
  assert.equal(out[0].url, 'https://a.com');
  assert.equal(out[0].confidence, 90);
  assert.equal(out[1].url, 'https://b.com');
  assert.equal(out[1].confidence, 85);
});

test('collectPublishedSourcesForVariant: skips non-resolved candidates even when variant_key matches', async () => {
  const mod = await load();
  const cs = [
    cand({
      candidate_id: '1', status: 'candidate',
      metadata: {
        variant_key: 'color:black',
        evidence_refs: [{ url: 'https://a.com', tier: 'tier1', confidence: 99 }],
      },
    }),
  ];
  assert.deepEqual(mod.collectPublishedSourcesForVariant(cs, 'color:black'), []);
});

test('collectPublishedSourcesForVariant: ignores candidates for other variants', async () => {
  const mod = await load();
  const cs = [
    cand({
      candidate_id: 'run1', status: 'resolved',
      metadata: {
        variant_key: 'color:black',
        evidence_refs: [{ url: 'https://black.com', tier: 'tier1', confidence: 95 }],
      },
    }),
    cand({
      candidate_id: 'run2', status: 'resolved',
      metadata: {
        variant_key: 'color:white',
        evidence_refs: [{ url: 'https://white.com', tier: 'tier1', confidence: 80 }],
      },
    }),
  ];
  const out = mod.collectPublishedSourcesForVariant(cs, 'color:black');
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://black.com');
});

// ── Threshold filter (per-source confidence gate) ──────────────

test('sourceIsAboveThreshold: confidence/100 >= threshold passes', async () => {
  const mod = await load();
  assert.equal(mod.sourceIsAboveThreshold({ url: 'x', tier: null, confidence: 70 }, 0.7), true);
  assert.equal(mod.sourceIsAboveThreshold({ url: 'x', tier: null, confidence: 69 }, 0.7), false);
  assert.equal(mod.sourceIsAboveThreshold({ url: 'x', tier: null, confidence: 100 }, 0.7), true);
});

test('sourceIsAboveThreshold: threshold<=0 passes everything (including null confidence)', async () => {
  const mod = await load();
  assert.equal(mod.sourceIsAboveThreshold({ url: 'x', tier: null, confidence: null }, 0), true);
  assert.equal(mod.sourceIsAboveThreshold({ url: 'x', tier: null, confidence: 0 }, 0), true);
});

test('sourceIsAboveThreshold: null confidence fails any positive threshold', async () => {
  const mod = await load();
  assert.equal(mod.sourceIsAboveThreshold({ url: 'x', tier: null, confidence: null }, 0.5), false);
});

test('collectPublishedSources: threshold filters out below-threshold sources', async () => {
  const mod = await load();
  const cs = [
    cand({ candidate_id: '1', status: 'resolved', metadata: refsMeta([
      { url: 'https://a.com', tier: 'tier1', confidence: 95 },
      { url: 'https://b.com', tier: 'tier2', confidence: 62 },
      { url: 'https://c.com', tier: 'tier1', confidence: 55 },
    ]) }),
  ];
  const out = mod.collectPublishedSources(cs, 0.7);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://a.com');
});

test('collectPublishedSources: threshold=0 (default) keeps all sources', async () => {
  const mod = await load();
  const cs = [
    cand({ candidate_id: '1', status: 'resolved', metadata: refsMeta([
      { url: 'https://a.com', tier: 'tier1', confidence: 95 },
      { url: 'https://b.com', tier: 'tier1', confidence: 40 },
    ]) }),
  ];
  assert.equal(mod.collectPublishedSources(cs).length, 2);
  assert.equal(mod.collectPublishedSources(cs, 0).length, 2);
});

test('collectPublishedSources: threshold hides null-confidence sources', async () => {
  const mod = await load();
  const cs = [
    cand({
      candidate_id: '1',
      status: 'resolved',
      evidence_url: 'https://legacy.com',
      tier: 1,
    }),
    cand({ candidate_id: '2', status: 'resolved', metadata: refsMeta([
      { url: 'https://a.com', tier: 'tier1', confidence: 80 },
    ]) }),
  ];
  const out = mod.collectPublishedSources(cs, 0.7);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://a.com');
});

test('collectPublishedSources: dedupe then threshold (max confidence wins, then gate)', async () => {
  const mod = await load();
  const cs = [
    cand({ candidate_id: '1', status: 'resolved', metadata: refsMeta([
      { url: 'https://same.com', tier: 'tier1', confidence: 40 },
    ]) }),
    cand({ candidate_id: '2', status: 'resolved', metadata: refsMeta([
      { url: 'https://same.com', tier: 'tier1', confidence: 85 },
    ]) }),
  ];
  const out = mod.collectPublishedSources(cs, 0.7);
  assert.equal(out.length, 1);
  assert.equal(out[0].confidence, 85);
});

test('collectPublishedSourcesForVariant: threshold applies to per-variant candidate evidence', async () => {
  const mod = await load();
  const cs = [
    cand({
      candidate_id: '1',
      status: 'resolved',
      metadata: {
        variant_key: 'color:black',
        evidence_refs: [
          { url: 'https://high.com', tier: 'tier1', confidence: 90 },
          { url: 'https://low.com', tier: 'tier3', confidence: 55 },
        ],
      },
    }),
  ];
  const out = mod.collectPublishedSourcesForVariant(cs, 'color:black', 0.7);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://high.com');
});

test('collectPublishedSourcesForVariant: candidate without variant_key contributes nothing (no global fallback)', async () => {
  const mod = await load();
  const cs = [
    cand({
      candidate_id: '1',
      status: 'resolved',
      // No variant_key in metadata → excluded from per-variant collection entirely.
      metadata: refsMeta([
        { url: 'https://global-high.com', tier: 'tier1', confidence: 90 },
      ]),
    }),
  ];
  const out = mod.collectPublishedSourcesForVariant(cs, 'color:any', 0.7);
  assert.equal(out.length, 0);
});

// ── maxSourceConfidence (derived row confidence) ────────────────

test('maxSourceConfidence: empty array returns null', async () => {
  const mod = await load();
  assert.equal(mod.maxSourceConfidence([]), null);
});

test('maxSourceConfidence: all-null array returns null', async () => {
  const mod = await load();
  const sources = [
    { url: 'a', tier: null, confidence: null },
    { url: 'b', tier: null, confidence: null },
  ];
  assert.equal(mod.maxSourceConfidence(sources), null);
});

test('maxSourceConfidence: picks max and normalizes to 0-1 scale', async () => {
  const mod = await load();
  const sources = [
    { url: 'a', tier: 'tier1', confidence: 85 },
    { url: 'b', tier: 'tier2', confidence: 98 },
    { url: 'c', tier: 'tier1', confidence: 70 },
  ];
  assert.equal(mod.maxSourceConfidence(sources), 0.98);
});

test('maxSourceConfidence: ignores null entries when computing max', async () => {
  const mod = await load();
  const sources = [
    { url: 'a', tier: null, confidence: null },
    { url: 'b', tier: 'tier1', confidence: 72 },
    { url: 'c', tier: null, confidence: null },
  ];
  assert.equal(mod.maxSourceConfidence(sources), 0.72);
});

test('maxSourceConfidence: single source returns its value normalized', async () => {
  const mod = await load();
  const sources = [{ url: 'a', tier: 'tier1', confidence: 55 }];
  assert.equal(mod.maxSourceConfidence(sources), 0.55);
});

test('collectPublishedSources: handles large input and dedupes + sorts correctly', async () => {
  const mod = await load();
  const cs = [];
  for (let i = 0; i < 50; i++) {
    const refs = [];
    for (let j = 0; j < 10; j++) {
      refs.push({
        url: `https://h${(i + j) % 15}.com`,
        tier: 'tier1',
        confidence: (i * 7 + j) % 100,
      });
    }
    cs.push(cand({ candidate_id: `c${i}`, status: 'resolved', metadata: refsMeta(refs) }));
  }
  const out = mod.collectPublishedSources(cs);
  assert.equal(out.length, 15);
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1].confidence ?? -1;
    const curr = out[i].confidence ?? -1;
    assert.ok(prev >= curr, `sort violation at index ${i}: ${prev} < ${curr}`);
  }
});
