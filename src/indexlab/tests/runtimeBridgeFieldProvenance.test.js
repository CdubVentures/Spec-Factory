// WHY: Per-field provenance accumulator on the bridge. buildFieldHistories
// needs `provenance[fieldKey].evidence[]` with { url, rootDomain, host_class,
// evidence_class, tier, tierName } per (source, field) pair. The bridge already
// handles source_processed events — we extend it to populate fieldProvenance
// state so the finalization hook can call buildFieldHistories() with it.

import { describe, it } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { IndexLabRuntimeBridge } from '../runtimeBridge.js';

async function makeBridge() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-fieldprov-'));
  const bridge = new IndexLabRuntimeBridge({ outRoot: tmpDir });
  bridge.onRuntimeEvent({
    runId: 'run-fp-001', event: 'run_started', ts: '2026-04-21T00:00:00Z',
    category: 'mouse', productId: 'mouse-test-01',
  });
  await bridge.queue;
  return bridge;
}

describe('bridge fieldProvenance accumulator', () => {
  it('initializes state.fieldProvenance as an empty object', async () => {
    const bridge = await makeBridge();
    deepStrictEqual(bridge.fieldProvenance, {});
  });

  it('source_processed with 2 candidate fields adds 2 evidence entries (one per field)', async () => {
    const bridge = await makeBridge();
    bridge.onRuntimeEvent({
      runId: 'run-fp-001', event: 'source_processed', ts: '2026-04-21T00:01:00Z',
      url: 'https://rtings.com/mouse/review/razer-viper',
      host: 'rtings.com',
      content_type: 'text/html',
      tier: 2, tierName: 'review', status: 200,
      candidates: [
        { field: 'weight', value: '58g', confidence: 0.9 },
        { field: 'dpi', value: '30000', confidence: 0.95 },
      ],
    });
    await bridge.queue;
    ok(bridge.fieldProvenance.weight, 'weight field must have an entry');
    ok(bridge.fieldProvenance.dpi, 'dpi field must have an entry');
    strictEqual(bridge.fieldProvenance.weight.evidence.length, 1);
    strictEqual(bridge.fieldProvenance.dpi.evidence.length, 1);
  });

  it('evidence entry has url and rootDomain derived from host', async () => {
    const bridge = await makeBridge();
    bridge.onRuntimeEvent({
      runId: 'run-fp-001', event: 'source_processed', ts: '2026-04-21T00:01:00Z',
      url: 'https://rtings.com/mouse/review/razer-viper',
      host: 'rtings.com',
      content_type: 'text/html',
      tier: 2, tierName: 'review', status: 200,
      candidates: [{ field: 'weight' }],
    });
    await bridge.queue;
    const ev = bridge.fieldProvenance.weight.evidence[0];
    strictEqual(ev.url, 'https://rtings.com/mouse/review/razer-viper');
    strictEqual(ev.rootDomain, 'rtings.com');
  });

  it('evidence entry host_class + evidence_class come from classifyHostClass/classifyEvidenceClass', async () => {
    const bridge = await makeBridge();
    bridge.onRuntimeEvent({
      runId: 'run-fp-001', event: 'source_processed', ts: '2026-04-21T00:01:00Z',
      url: 'https://coolermaster.com/mouse/mm731',
      host: 'coolermaster.com',
      content_type: 'text/html',
      tier: 1, tierName: 'manufacturer', status: 200,
      candidates: [{ field: 'weight' }],
    });
    await bridge.queue;
    const ev = bridge.fieldProvenance.weight.evidence[0];
    // tier=1 + manufacturer → host_class='official'
    strictEqual(ev.host_class, 'official');
    // tier=1 + text/html → evidence_class='manufacturer_html'
    strictEqual(ev.evidence_class, 'manufacturer_html');
  });

  it('multiple source_processed events for the same field accumulate evidence', async () => {
    const bridge = await makeBridge();
    bridge.onRuntimeEvent({
      runId: 'run-fp-001', event: 'source_processed', ts: '2026-04-21T00:01:00Z',
      url: 'https://rtings.com/a', host: 'rtings.com', tier: 2, tierName: 'review',
      content_type: 'text/html', candidates: [{ field: 'weight' }],
    });
    await bridge.queue;
    bridge.onRuntimeEvent({
      runId: 'run-fp-001', event: 'source_processed', ts: '2026-04-21T00:02:00Z',
      url: 'https://techpowerup.com/b', host: 'techpowerup.com', tier: 2, tierName: 'review',
      content_type: 'text/html', candidates: [{ field: 'weight' }],
    });
    await bridge.queue;
    strictEqual(bridge.fieldProvenance.weight.evidence.length, 2, 'should accumulate 2 evidence entries');
    const domains = bridge.fieldProvenance.weight.evidence.map((e) => e.rootDomain);
    deepStrictEqual(domains.sort(), ['rtings.com', 'techpowerup.com']);
  });

  it('source_processed with empty candidates is a no-op (no crash)', async () => {
    const bridge = await makeBridge();
    bridge.onRuntimeEvent({
      runId: 'run-fp-001', event: 'source_processed', ts: '2026-04-21T00:01:00Z',
      url: 'https://example.com', host: 'example.com', tier: 0,
      content_type: 'text/html', candidates: [],
    });
    await bridge.queue;
    deepStrictEqual(bridge.fieldProvenance, {});
  });

  it('candidates with missing field key are skipped', async () => {
    const bridge = await makeBridge();
    bridge.onRuntimeEvent({
      runId: 'run-fp-001', event: 'source_processed', ts: '2026-04-21T00:01:00Z',
      url: 'https://example.com', host: 'example.com', tier: 0,
      content_type: 'text/html',
      candidates: [{ value: 'abc' }, { field: '' }, { field: 'dpi' }],
    });
    await bridge.queue;
    ok(!bridge.fieldProvenance[''], 'empty-string field key must not create an entry');
    ok(bridge.fieldProvenance.dpi, 'valid field must still be recorded');
    strictEqual(Object.keys(bridge.fieldProvenance).length, 1);
  });
});
