import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectAggressiveEvidencePack,
  selectAggressiveDomHtml,
  buildDomSnippetArtifact,
  normalizedSnippetRows,
  enrichFieldCandidatesWithEvidenceRefs,
  buildTopEvidenceReferences
} from '../src/features/indexing/orchestration/shared/evidenceHelpers.js';

test('selectAggressiveEvidencePack returns best evidence pack', () => {
  const result = selectAggressiveEvidencePack([
    { tier: 3, identity: { match: false }, anchorCheck: { majorConflicts: [] }, llmEvidencePack: { meta: { snippet_count: 5 } } },
    { tier: 1, identity: { match: true }, anchorCheck: { majorConflicts: [] }, llmEvidencePack: { meta: { snippet_count: 10 } } }
  ]);
  assert.equal(result.meta.snippet_count, 10);
});

test('selectAggressiveEvidencePack returns null for no packs', () => {
  assert.equal(selectAggressiveEvidencePack([{ tier: 1 }]), null);
  assert.equal(selectAggressiveEvidencePack([]), null);
});

test('selectAggressiveDomHtml returns longest html', () => {
  const result = selectAggressiveDomHtml({
    'a.com': { html: 'short' },
    'b.com': { html: 'this is much longer html content' }
  });
  assert.equal(result, 'this is much longer html content');
});

test('selectAggressiveDomHtml returns empty for no artifacts', () => {
  assert.equal(selectAggressiveDomHtml({}), '');
});

test('buildDomSnippetArtifact extracts table from html', () => {
  const html = '<html><body><table><tr><td>DPI</td><td>35000</td></tr></table></body></html>';
  const result = buildDomSnippetArtifact(html);
  assert.ok(result);
  assert.equal(result.kind, 'table');
  assert.ok(result.html.includes('<table'));
});

test('buildDomSnippetArtifact returns null for empty html', () => {
  assert.equal(buildDomSnippetArtifact(''), null);
  assert.equal(buildDomSnippetArtifact(), null);
});

test('buildDomSnippetArtifact ignores featured-categories chrome and captures the real spec-bearing section', () => {
  const html = [
    '<html><body>',
    '<div id="alg-featured-categories" class="alg-featured-categories alg-chip-list d-none"><div id="trendingFacets"></div></div>',
    '<section class="product-specs">',
    '<h2>Technical Specifications</h2>',
    '<ul>',
    '<li>Sensor: Focus Pro 35K</li>',
    '<li>Polling rate: 8000 Hz</li>',
    '<li>Weight: 54 g</li>',
    '</ul>',
    '</section>',
    '</body></html>',
  ].join('');

  const result = buildDomSnippetArtifact(html, 2000);

  assert.ok(result);
  assert.equal(result.kind, 'spec_section');
  assert.equal(result.html.includes('alg-featured-categories'), false);
  assert.equal(result.html.includes('Focus Pro 35K'), true);
  assert.equal(result.html.includes('8000 Hz'), true);
  assert.equal(result.html.includes('54 g'), true);
});

test('buildDomSnippetArtifact fallback ignores head and style noise before searching for spec keywords', () => {
  const html = [
    '<html>',
    '<head>',
    '<style>.hero-title { font-weight: 700; }</style>',
    '<script>window.__boot = { fontWeight: 500 };</script>',
    '</head>',
    '<body>',
    '<div class="hero-title">Razer Viper V3 Pro</div>',
    '<div class="overview-copy">',
    'The Focus Pro 35K sensor supports up to 8000 Hz polling and a 54 g design.',
    '</div>',
    '</body>',
    '</html>',
  ].join('');

  const result = buildDomSnippetArtifact(html, 600);

  assert.ok(result);
  assert.equal(result.kind, 'html_window');
  assert.equal(result.html.includes('font-weight'), false);
  assert.equal(result.html.includes('Focus Pro 35K'), true);
  assert.equal(result.html.includes('8000 Hz'), true);
  assert.equal(result.html.includes('54 g'), true);
});

test('buildDomSnippetArtifact fallback prefers dense numeric spec windows over early navigation keyword hits', () => {
  const html = [
    '<html><body>',
    '<nav class="mega-menu">',
    '<a href="/gaming-mice/razer-naga-left-handed-edition/buy">Razer Naga Left-handed Wireless</a>',
    '<a href="/gaming-keyboards/razer-huntsman-signature-edition/buy">Razer Huntsman Signature Edition</a>',
    '<a href="/gaming-mice/razer-basilisk-v3-pro-35k/buy">Razer Basilisk V3 Pro 35K Wireless</a>',
    '</nav>',
    '<div class="product-story">',
    '<h2>Razer Viper V3 Pro</h2>',
    '<p>The Focus Pro 35K optical sensor supports up to 8000 Hz polling with a 54 g design.</p>',
    '<ul>',
    '<li>Sensitivity (DPI): 35,000</li>',
    '<li>Max Speed (IPS): 750</li>',
    '<li>Max Acceleration (G): 70</li>',
    '</ul>',
    '</div>',
    '</body></html>',
  ].join('');

  const result = buildDomSnippetArtifact(html, 1000);

  assert.ok(result);
  assert.equal(result.kind, 'html_window');
  assert.equal(result.html.includes('Razer Naga Left-handed Wireless'), false);
  assert.equal(result.html.includes('Focus Pro 35K'), true);
  assert.equal(result.html.includes('8000 Hz'), true);
  assert.equal(result.html.includes('35,000'), true);
});

test('normalizedSnippetRows parses array snippets', () => {
  const pack = {
    snippets: [
      { id: 's1', text: 'Focus Pro 35K sensor' },
      { id: 's2', normalized_text: 'High DPI  Mouse' }
    ]
  };
  const rows = normalizedSnippetRows(pack);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 's1');
  assert.ok(rows[1].text.includes('high dpi'));
});

test('normalizedSnippetRows parses object snippets', () => {
  const pack = {
    snippets: {
      s1: { text: 'Focus Pro 35K sensor' }
    }
  };
  const rows = normalizedSnippetRows(pack);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 's1');
});

test('normalizedSnippetRows returns empty for null', () => {
  assert.deepStrictEqual(normalizedSnippetRows(null), []);
});

test('enrichFieldCandidatesWithEvidenceRefs returns unchanged when no evidence pack', () => {
  const candidates = [{ field: 'sensor', value: 'Focus Pro', method: 'dom' }];
  const result = enrichFieldCandidatesWithEvidenceRefs(candidates, null);
  assert.deepStrictEqual(result, candidates);
});

test('enrichFieldCandidatesWithEvidenceRefs matches by heuristic', () => {
  const candidates = [{ field: 'sensor', value: 'Focus Pro', method: 'dom' }];
  const pack = {
    snippets: [{ id: 's1', text: 'The Focus Pro sensor provides high DPI tracking' }]
  };
  const result = enrichFieldCandidatesWithEvidenceRefs(candidates, pack);
  assert.deepStrictEqual(result[0].evidenceRefs, ['s1']);
  assert.equal(result[0].evidenceRefOrigin, 'heuristic_snippet_match');
});

test('buildTopEvidenceReferences collects evidence rows', () => {
  const prov = {
    sensor: {
      evidence: [
        { url: 'https://a.com', host: 'a.com', method: 'dom', keyPath: 'body', tier: 1, tierName: 'manufacturer' }
      ]
    },
    dpi: {
      evidence: [
        { url: 'https://b.com', host: 'b.com', method: 'json_ld', keyPath: 'dpi', tier: 2, tierName: 'database' }
      ]
    }
  };
  const rows = buildTopEvidenceReferences(prov);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].field, 'sensor');
  assert.equal(rows[1].field, 'dpi');
});

test('buildTopEvidenceReferences respects limit', () => {
  const prov = {
    sensor: { evidence: [{ url: 'a', host: 'a', method: 'm', keyPath: 'k', tier: 1, tierName: 't' }] },
    dpi: { evidence: [{ url: 'b', host: 'b', method: 'm', keyPath: 'k', tier: 1, tierName: 't' }] }
  };
  const rows = buildTopEvidenceReferences(prov, 1);
  assert.equal(rows.length, 1);
});

test('buildTopEvidenceReferences deduplicates by field|url|keyPath', () => {
  const prov = {
    sensor: {
      evidence: [
        { url: 'https://a.com', host: 'a.com', method: 'dom', keyPath: 'body', tier: 1, tierName: 'm' },
        { url: 'https://a.com', host: 'a.com', method: 'dom', keyPath: 'body', tier: 1, tierName: 'm' }
      ]
    }
  };
  const rows = buildTopEvidenceReferences(prov);
  assert.equal(rows.length, 1);
});
