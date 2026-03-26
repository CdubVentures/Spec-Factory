import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveBrowserPoolState } from '../browserPoolStatusHelpers.ts';

// WHY: Table-driven — covers all conditional branches in deriveBrowserPoolState.
// Tests required per CLAUDE.md: conditional rendering + computed state logic.

const worker = (pool, state) => ({ pool, state });

describe('deriveBrowserPoolState', () => {
  // ── Worker-derived status (no backend meta) ────────────────────────

  const STATUS_CASES = [
    { label: 'no workers → idle', workers: [], slotCount: 16, expected: 'idle' },
    { label: 'all queued → idle', workers: [worker('fetch', 'queued'), worker('fetch', 'queued')], slotCount: 2, expected: 'idle' },
    { label: 'some running → warming', workers: [worker('fetch', 'running'), worker('fetch', 'queued')], slotCount: 4, expected: 'warming' },
    { label: 'all running → ready', workers: [worker('fetch', 'running'), worker('fetch', 'running')], slotCount: 2, expected: 'ready' },
    { label: 'mixed active states → warming', workers: [worker('fetch', 'crawling'), worker('fetch', 'crawled'), worker('fetch', 'stuck')], slotCount: 8, expected: 'warming' },
    { label: 'non-fetch workers ignored', workers: [worker('search', 'running'), worker('llm', 'running')], slotCount: 4, expected: 'idle' },
    { label: 'crawled counts as active', workers: [worker('fetch', 'crawled'), worker('fetch', 'crawled')], slotCount: 2, expected: 'ready' },
  ];

  for (const { label, workers, slotCount, expected } of STATUS_CASES) {
    it(`status (no meta): ${label}`, () => {
      const result = deriveBrowserPoolState(workers, slotCount);
      assert.equal(result.status, expected);
    });
  }

  // ── Backend meta overrides worker-derived status ───────────────────

  it('meta warming → warming even with no workers', () => {
    const result = deriveBrowserPoolState([], 16, { status: 'warming', browsers: 4, slots: 16, pages_per_browser: 4 });
    assert.equal(result.status, 'warming');
  });

  it('meta ready + all workers active → ready', () => {
    const workers = Array.from({ length: 4 }, () => worker('fetch', 'running'));
    const result = deriveBrowserPoolState(workers, 4, { status: 'ready', browsers: 1, slots: 4 });
    assert.equal(result.status, 'ready');
  });

  it('meta ready but workers not yet active → warming (conservative)', () => {
    const result = deriveBrowserPoolState([], 16, { status: 'ready', browsers: 4, slots: 16 });
    assert.equal(result.status, 'warming');
  });

  it('meta uses backend browsers/pages values', () => {
    const result = deriveBrowserPoolState([], 16, { status: 'warming', browsers: 4, pages_per_browser: 4 });
    assert.equal(result.browsersNeeded, 4);
    assert.equal(result.pagesPerBrowser, 4);
    assert.equal(result.totalSlots, 16);
  });

  // ── Browser / page derivation ──────────────────────────────────────

  const LAYOUT_CASES = [
    { slotCount: 1, browsers: 1, pages: 1, total: 1 },
    { slotCount: 2, browsers: 1, pages: 2, total: 2 },
    { slotCount: 4, browsers: 1, pages: 4, total: 4 },
    { slotCount: 8, browsers: 2, pages: 4, total: 8 },
    { slotCount: 16, browsers: 4, pages: 4, total: 16 },
    { slotCount: 32, browsers: 8, pages: 4, total: 32 },
  ];

  for (const { slotCount, browsers, pages, total } of LAYOUT_CASES) {
    it(`layout: slotCount=${slotCount} → ${browsers}×${pages}=${total}`, () => {
      const result = deriveBrowserPoolState([], slotCount);
      assert.equal(result.browsersNeeded, browsers);
      assert.equal(result.pagesPerBrowser, pages);
      assert.equal(result.totalSlots, total);
    });
  }

  // ── Active fetch slot counting ─────────────────────────────────────

  it('activeFetchSlots counts non-queued fetch workers only', () => {
    const workers = [
      worker('fetch', 'running'),
      worker('fetch', 'crawling'),
      worker('fetch', 'queued'),
      worker('fetch', 'stuck'),
      worker('search', 'running'),
      worker('llm', 'running'),
    ];
    const result = deriveBrowserPoolState(workers, 16);
    assert.equal(result.activeFetchSlots, 3);
  });
});
