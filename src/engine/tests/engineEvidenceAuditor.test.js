import test from 'node:test';
import assert from 'node:assert/strict';
import { auditEvidence } from '../engineEvidenceAuditor.js';

// ── Unknown value short-circuits ──────────────────────────────────────────────

test('auditEvidence returns ok for unknown token values', () => {
  assert.deepEqual(auditEvidence('weight', 'unk'), { ok: true });
  assert.deepEqual(auditEvidence('weight', { value: 'unk' }), { ok: true });
  assert.deepEqual(auditEvidence('weight', ''), { ok: true });
});

// ── Missing required fields ───────────────────────────────────────────────────

test('auditEvidence reports missing url', () => {
  const result = auditEvidence('weight', 54, { snippet_id: 's1', quote: '54g' });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('url'));
});

test('auditEvidence reports missing snippet_id', () => {
  const result = auditEvidence('weight', 54, { url: 'https://example.com', quote: '54g' });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('snippet_id'));
});

test('auditEvidence reports missing quote', () => {
  const result = auditEvidence('weight', 54, { url: 'https://example.com', snippet_id: 's1' });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('quote'));
});

// ── Invalid URL ───────────────────────────────────────────────────────────────

test('auditEvidence reports url_invalid for malformed URLs', () => {
  const result = auditEvidence('weight', 54, {
    url: 'not a valid url',
    snippet_id: 's1',
    quote: '54g'
  });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('url_invalid'));
});

// ── Snippet mismatch ──────────────────────────────────────────────────────────

test('auditEvidence reports snippet_id_not_found when snippet is missing from pack', () => {
  const result = auditEvidence('weight', 54,
    { url: 'https://example.com', snippet_id: 'missing', quote: '54g' },
    { evidencePack: { snippets: { s1: { text: 'weight is 54g' } } } }
  );
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('snippet_id_not_found'));
});

test('auditEvidence reports quote_not_in_snippet when quote does not appear in text', () => {
  const result = auditEvidence('weight', 54,
    { url: 'https://example.com', snippet_id: 's1', quote: '99 grams' },
    { evidencePack: { snippets: { s1: { text: 'The mouse weighs 54 grams.' } } } }
  );
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('quote_not_in_snippet'));
});

// ── Snippet hash mismatch (strict) ───────────────────────────────────────────

test('auditEvidence strict mode reports snippet_hash_mismatch', () => {
  const result = auditEvidence('weight', 54,
    {
      url: 'https://example.com', snippet_id: 's1', quote: '54g',
      snippet_hash: 'sha256:old', source_id: 'src1',
      retrieved_at: '2026-01-01T00:00:00Z', extraction_method: 'llm_extract'
    },
    {
      strictEvidence: true,
      evidencePack: {
        snippets: { s1: { text: 'weight is 54g', snippet_hash: 'sha256:new' } }
      }
    }
  );
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('snippet_hash_mismatch'));
  assert.equal(result.reason_code, 'evidence_stale');
});

// ── quote_span validation ─────────────────────────────────────────────────────

test('auditEvidence validates quote_span match', () => {
  const text = 'Sensor is PAW3395.';
  const result = auditEvidence('sensor', 'PAW3395',
    {
      url: 'https://example.com', snippet_id: 's1',
      quote: 'PAW3395', quote_span: [10, 17]
    },
    { evidencePack: { snippets: { s1: { text } } } }
  );
  assert.equal(result.ok, true);
});

test('auditEvidence reports quote_span_mismatch', () => {
  const text = 'Sensor is PAW3395.';
  const result = auditEvidence('sensor', 'PAW3395',
    {
      url: 'https://example.com', snippet_id: 's1',
      quote: 'WRONG', quote_span: [10, 17]
    },
    { evidencePack: { snippets: { s1: { text } } } }
  );
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('quote_span_mismatch'));
});

test('auditEvidence reports quote_span_invalid for bad range', () => {
  const result = auditEvidence('sensor', 'PAW3395',
    {
      url: 'https://example.com', snippet_id: 's1',
      quote: 'PAW3395', quote_span: [-1, 5]
    },
    { evidencePack: { snippets: { s1: { text: 'Sensor is PAW3395.' } } } }
  );
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('quote_span_invalid'));
});

// ── Strict mode fields ────────────────────────────────────────────────────────

test('auditEvidence strict mode requires source_id, snippet_hash, retrieved_at, extraction_method', () => {
  const result = auditEvidence('weight', 54,
    { url: 'https://example.com', snippet_id: 's1', quote: '54g' },
    {
      strictEvidence: true,
      evidencePack: { snippets: { s1: { text: 'weight is 54g' } } }
    }
  );
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('source_id'));
  assert.ok(result.missing.includes('snippet_hash'));
  assert.ok(result.missing.includes('retrieved_at'));
  assert.ok(result.missing.includes('extraction_method'));
});

test('auditEvidence strict mode reports retrieved_at_invalid for non-ISO date', () => {
  const result = auditEvidence('weight', 54,
    {
      url: 'https://example.com', snippet_id: 's1', quote: '54g',
      source_id: 'src1', snippet_hash: 'sha256:abc',
      retrieved_at: '2026-01-01', extraction_method: 'llm_extract'
    },
    {
      strictEvidence: true,
      evidencePack: { snippets: { s1: { text: 'weight is 54g', snippet_hash: 'sha256:abc' } } }
    }
  );
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('retrieved_at_invalid'));
});

test('auditEvidence strict mode reports extraction_method_invalid', () => {
  const result = auditEvidence('weight', 54,
    {
      url: 'https://example.com', snippet_id: 's1', quote: '54g',
      source_id: 'src1', snippet_hash: 'sha256:abc',
      retrieved_at: '2026-01-01T00:00:00Z', extraction_method: 'made_up_method'
    },
    {
      strictEvidence: true,
      evidencePack: { snippets: { s1: { text: 'weight is 54g', snippet_hash: 'sha256:abc' } } }
    }
  );
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('extraction_method_invalid'));
});

// ── Happy path ────────────────────────────────────────────────────────────────

test('auditEvidence returns ok for complete valid evidence', () => {
  const result = auditEvidence('weight', 54,
    { url: 'https://example.com', snippet_id: 's1', quote: '54 grams' },
    { evidencePack: { snippets: { s1: { text: 'The mouse weighs 54 grams.' } } } }
  );
  assert.equal(result.ok, true);
});

// ── Snippets as array ─────────────────────────────────────────────────────────

test('auditEvidence handles snippets provided as array', () => {
  const result = auditEvidence('weight', 54,
    { url: 'https://example.com', snippet_id: 's1', quote: '54g' },
    { evidencePack: { snippets: [{ id: 's1', text: 'weight is 54g' }] } }
  );
  assert.equal(result.ok, true);
});
