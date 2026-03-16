import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveHintToken,
  resolveHintTokens,
} from '../src/features/indexing/discovery/hintTokenResolver.js';
import { loadSourceRegistry } from '../src/features/indexing/discovery/sourceRegistry.js';

function buildMouseRegistry() {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), 'category_authority', 'mouse', 'sources.json'), 'utf8')
  );
  return loadSourceRegistry('mouse', raw).registry;
}

describe('hintTokenResolver', () => {
  it('razer.com with registry → host, source_entry populated', () => {
    const reg = buildMouseRegistry();
    const r = resolveHintToken('razer.com', reg);
    assert.equal(r.classification, 'host');
    assert.equal(r.host, 'razer.com');
    assert.ok(r.source_entry, 'source_entry should be populated');
    assert.equal(r.source_entry.tier, 'tier1_manufacturer');
    assert.equal(r.raw, 'razer.com');
  });

  it('docs.razer.com → host (subdomain match)', () => {
    const reg = buildMouseRegistry();
    const r = resolveHintToken('docs.razer.com', reg);
    assert.equal(r.classification, 'host');
    assert.ok(r.source_entry);
  });

  it('unknown-site.xyz → host, source_entry=null', () => {
    const reg = buildMouseRegistry();
    const r = resolveHintToken('unknown-site.xyz', reg);
    assert.equal(r.classification, 'host');
    assert.equal(r.host, 'unknown-site.xyz');
    assert.equal(r.source_entry, null);
  });

  it('v2.0 → unresolved (not a valid domain)', () => {
    const reg = buildMouseRegistry();
    const r = resolveHintToken('v2.0', reg);
    assert.equal(r.classification, 'unresolved');
  });

  it('manufacturer → tier', () => {
    const reg = buildMouseRegistry();
    const r = resolveHintToken('manufacturer', reg);
    assert.equal(r.classification, 'tier');
    assert.equal(r.tier, 'manufacturer');
  });

  it('lab → tier', () => {
    const reg = buildMouseRegistry();
    const r = resolveHintToken('lab', reg);
    assert.equal(r.classification, 'tier');
    assert.equal(r.tier, 'lab');
  });

  it('manual → intent', () => {
    const reg = buildMouseRegistry();
    const r = resolveHintToken('manual', reg);
    assert.equal(r.classification, 'intent');
    assert.equal(r.intent, 'manual');
  });

  it('datasheet → intent', () => {
    const reg = buildMouseRegistry();
    const r = resolveHintToken('datasheet', reg);
    assert.equal(r.classification, 'intent');
  });

  it('specification → intent', () => {
    const reg = buildMouseRegistry();
    const r = resolveHintToken('specification', reg);
    assert.equal(r.classification, 'intent');
  });

  it('xyzzy123 → unresolved', () => {
    const reg = buildMouseRegistry();
    const r = resolveHintToken('xyzzy123', reg);
    assert.equal(r.classification, 'unresolved');
  });

  it('empty/null → unresolved', () => {
    const reg = buildMouseRegistry();
    for (const val of [null, undefined, '']) {
      const r = resolveHintToken(val, reg);
      assert.equal(r.classification, 'unresolved', `expected unresolved for ${JSON.stringify(val)}`);
    }
  });

  it('resolveHintTokens batch processes array', () => {
    const reg = buildMouseRegistry();
    const results = resolveHintTokens(['razer.com', 'manufacturer', 'manual', 'xyzzy'], reg);
    assert.equal(results.length, 4);
    assert.equal(results[0].classification, 'host');
    assert.equal(results[1].classification, 'tier');
    assert.equal(results[2].classification, 'intent');
    assert.equal(results[3].classification, 'unresolved');
  });
});
