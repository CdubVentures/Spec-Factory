import test from 'node:test';
import assert from 'node:assert/strict';
import { keyFinderResponseSchema, perKeyShape } from '../keySchema.js';

// ── perKeyShape: the scalar-finder-aligned per-field schema ─────────────

const MIN_PER_KEY = {
  value: 'PixArt PAW3395',
  confidence: 92,
  unknown_reason: '',
  evidence_refs: [],
  discovery_log: { urls_checked: [], queries_run: [], notes: [] },
};

test('perKeyShape accepts valid scalar response and strips legacy per-key discovery_log', () => {
  const schema = perKeyShape('value');
  const parsed = schema.parse({
    value: 'PixArt PAW3395',
    confidence: 92,
    unknown_reason: '',
    evidence_refs: [
      {
        url: 'https://rtings.com/mouse/paw3395',
        tier: 'tier2',
        confidence: 88,
        supporting_evidence: 'Page states "equipped with the PixArt PAW3395 optical sensor"',
        evidence_kind: 'direct_quote',
      },
    ],
    discovery_log: {
      urls_checked: ['https://rtings.com/mouse/paw3395'],
      queries_run: ['razer deathadder v3 sensor'],
      notes: ['sensor identified via direct quote'],
    },
  });
  assert.equal(parsed.value, 'PixArt PAW3395');
  assert.equal(parsed.confidence, 92);
  assert.equal(parsed.evidence_refs[0].evidence_kind, 'direct_quote');
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'discovery_log'), false);
});

test('perKeyShape rejects float confidence (must be int 0-100)', () => {
  const schema = perKeyShape('value');
  assert.throws(() => schema.parse({ ...MIN_PER_KEY, confidence: 0.85 }));
});

test('perKeyShape rejects confidence out of 0-100 range', () => {
  const schema = perKeyShape('value');
  assert.throws(() => schema.parse({ ...MIN_PER_KEY, confidence: 150 }));
  assert.throws(() => schema.parse({ ...MIN_PER_KEY, confidence: -5 }));
});

test('perKeyShape rejects evidence_refs with old {url, snippet} shape (missing tier + confidence)', () => {
  const schema = perKeyShape('value');
  assert.throws(() => schema.parse({
    ...MIN_PER_KEY,
    evidence_refs: [{ url: 'https://example.com', snippet: 'some quote' }],
  }));
});

test('keyFinderResponseSchema rejects envelope discovery_log notes as string (must be array)', () => {
  assert.throws(() => keyFinderResponseSchema.parse({
    primary_field_key: 'polling_rate',
    results: { polling_rate: MIN_PER_KEY },
    discovery_log: { urls_checked: [], queries_run: [], notes: 'not an array' },
  }));
});

test('perKeyShape rejects supporting_evidence over 280 chars', () => {
  const schema = perKeyShape('value');
  assert.throws(() => schema.parse({
    ...MIN_PER_KEY,
    evidence_refs: [
      {
        url: 'https://example.com',
        tier: 'tier1',
        confidence: 90,
        supporting_evidence: 'x'.repeat(281),
      },
    ],
  }));
});

test('perKeyShape rejects unknown evidence_kind enum value', () => {
  const schema = perKeyShape('value');
  assert.throws(() => schema.parse({
    ...MIN_PER_KEY,
    evidence_refs: [
      {
        url: 'https://example.com',
        tier: 'tier1',
        confidence: 90,
        supporting_evidence: '',
        evidence_kind: 'made_up_kind',
      },
    ],
  }));
});

test('perKeyShape defaults fill in for missing optional fields', () => {
  const schema = perKeyShape('value');
  const parsed = schema.parse({ value: 'PAW3395' });
  assert.equal(parsed.confidence, 0);
  assert.equal(parsed.unknown_reason, '');
  assert.deepEqual(parsed.evidence_refs, []);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'discovery_log'), false);
});

test('perKeyShape accepts optional component identity alias metadata', () => {
  const schema = perKeyShape('value');
  const parsed = schema.parse({
    ...MIN_PER_KEY,
    value: 'PAW3950',
    component_aliases: ['PixArt 3950', 'PMW3950'],
    brand_aliases: ['PixArt Imaging'],
  });

  assert.deepEqual(parsed.component_aliases, ['PixArt 3950', 'PMW3950']);
  assert.deepEqual(parsed.brand_aliases, ['PixArt Imaging']);
});

test('perKeyShape accepts native JSON types per contract (number, boolean, array, string, "unk")', () => {
  const schema = perKeyShape('value');
  assert.equal(schema.parse({ ...MIN_PER_KEY, value: 1000 }).value, 1000);         // number
  assert.equal(schema.parse({ ...MIN_PER_KEY, value: true }).value, true);          // boolean
  assert.deepEqual(schema.parse({ ...MIN_PER_KEY, value: ['2.4ghz', 'bluetooth'] }).value, ['2.4ghz', 'bluetooth']); // array
  assert.equal(schema.parse({ ...MIN_PER_KEY, value: 'PAW3395' }).value, 'PAW3395'); // string
  assert.equal(schema.parse({ ...MIN_PER_KEY, value: 'unk' }).value, 'unk');          // sentinel
});

// ── keyFinderResponseSchema: multi-key envelope ─────────────────────────

function validMultiKey(primaryKey, extra = {}) {
  return {
    primary_field_key: primaryKey,
    results: { [primaryKey]: MIN_PER_KEY, ...extra },
    discovery_log: { urls_checked: [], queries_run: [], notes: [] },
  };
}

test('keyFinderResponseSchema accepts single-key (no passengers) envelope', () => {
  const parsed = keyFinderResponseSchema.parse(validMultiKey('polling_rate'));
  assert.equal(parsed.primary_field_key, 'polling_rate');
  assert.equal(Object.keys(parsed.results).length, 1);
});

test('keyFinderResponseSchema accepts bundled envelope with multiple keys', () => {
  const parsed = keyFinderResponseSchema.parse(validMultiKey('sensor_model', {
    polling_rate: { ...MIN_PER_KEY, value: '8000' },
    click_latency_ms: { ...MIN_PER_KEY, value: '6.2' },
  }));
  assert.equal(parsed.primary_field_key, 'sensor_model');
  assert.equal(Object.keys(parsed.results).length, 3);
});

test('keyFinderResponseSchema strips per-key discovery logs and preserves only envelope discovery_log', () => {
  const parsed = keyFinderResponseSchema.parse(validMultiKey('polling_rate', {
    dpi: {
      value: 30000,
      confidence: 80,
      unknown_reason: '',
      evidence_refs: [],
      discovery_log: {
        urls_checked: ['https://passenger.example/dpi'],
        queries_run: ['passenger dpi query'],
        notes: ['should not persist on a passenger key'],
      },
    },
  }));

  assert.deepEqual(parsed.discovery_log, { urls_checked: [], queries_run: [], notes: [] });
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.results.polling_rate, 'discovery_log'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.results.dpi, 'discovery_log'), false);
});

test('keyFinderResponseSchema rejects envelope where primary_field_key is missing from results', () => {
  assert.throws(() => keyFinderResponseSchema.parse({
    primary_field_key: 'sensor_model',
    results: { polling_rate: MIN_PER_KEY },
    discovery_log: { urls_checked: [], queries_run: [], notes: [] },
  }));
});

test('keyFinderResponseSchema rejects envelope missing primary_field_key', () => {
  assert.throws(() => keyFinderResponseSchema.parse({
    results: { sensor_model: MIN_PER_KEY },
    discovery_log: { urls_checked: [], queries_run: [], notes: [] },
  }));
});

test('keyFinderResponseSchema rejects old single-key flat shape (field_key + value at top level)', () => {
  // Pre-rewrite shape: { field_key, value, confidence (0-1), evidence (plain), discovery_log (notes: string) }
  assert.throws(() => keyFinderResponseSchema.parse({
    field_key: 'polling_rate',
    value: '1000',
    confidence: 0.85,
    evidence: [{ url: 'https://example.com', snippet: 'quote' }],
    discovery_log: { urls_checked: [], queries_run: [], notes: '' },
  }));
});

test('keyFinderResponseSchema propagates per-key validation (a bad result fails the envelope)', () => {
  assert.throws(() => keyFinderResponseSchema.parse({
    primary_field_key: 'polling_rate',
    results: {
      polling_rate: { ...MIN_PER_KEY, confidence: 0.5 }, // invalid — float, should be int 0-100
    },
    discovery_log: { urls_checked: [], queries_run: [], notes: [] },
  }));
});
