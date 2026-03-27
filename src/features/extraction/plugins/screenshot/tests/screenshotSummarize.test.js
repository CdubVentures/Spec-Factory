import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { screenshotExtractionPlugin } from '../screenshotPlugin.js';

// WHY: Tests for the plugin `summarize(result)` method that produces
// a JSON-serializable summary for event telemetry. Buffers must never
// leak into the summary — only counts, sizes, and flags.

describe('screenshotExtractionPlugin.summarize', () => {
  it('exists as a function on the plugin', () => {
    assert.equal(typeof screenshotExtractionPlugin.summarize, 'function');
  });

  it('returns correct shape for a typical capture result', () => {
    const result = {
      screenshots: [
        { kind: 'page', format: 'jpeg', bytes: Buffer.alloc(50000), width: 1280, height: 3000, stitched: false },
        { kind: 'crop', format: 'jpeg', bytes: Buffer.alloc(8000), width: 400, height: 300, selector: '.hero' },
      ],
    };

    const summary = screenshotExtractionPlugin.summarize(result);

    assert.equal(summary.screenshot_count, 2);
    assert.equal(summary.total_bytes, 58000);
    assert.deepEqual(summary.formats, ['jpeg']);
    assert.equal(summary.has_stitched, false);
  });

  it('reports has_stitched true when any screenshot was stitched', () => {
    const result = {
      screenshots: [
        { kind: 'page', format: 'png', bytes: Buffer.alloc(200000), stitched: true, viewportCount: 4 },
      ],
    };

    const summary = screenshotExtractionPlugin.summarize(result);

    assert.equal(summary.has_stitched, true);
    assert.equal(summary.screenshot_count, 1);
    assert.equal(summary.total_bytes, 200000);
    assert.deepEqual(summary.formats, ['png']);
  });

  it('deduplicates formats across multiple screenshots', () => {
    const result = {
      screenshots: [
        { kind: 'page', format: 'jpeg', bytes: Buffer.alloc(100) },
        { kind: 'crop', format: 'png', bytes: Buffer.alloc(200) },
        { kind: 'crop', format: 'jpeg', bytes: Buffer.alloc(300) },
      ],
    };

    const summary = screenshotExtractionPlugin.summarize(result);

    assert.equal(summary.formats.length, 2);
    assert.ok(summary.formats.includes('jpeg'));
    assert.ok(summary.formats.includes('png'));
  });

  it('returns zero/empty defaults for empty screenshots array', () => {
    const summary = screenshotExtractionPlugin.summarize({ screenshots: [] });

    assert.equal(summary.screenshot_count, 0);
    assert.equal(summary.total_bytes, 0);
    assert.deepEqual(summary.formats, []);
    assert.equal(summary.has_stitched, false);
  });

  it('handles null/undefined result gracefully', () => {
    assert.deepEqual(screenshotExtractionPlugin.summarize(null), {
      screenshot_count: 0, total_bytes: 0, formats: [], has_stitched: false,
    });
    assert.deepEqual(screenshotExtractionPlugin.summarize(undefined), {
      screenshot_count: 0, total_bytes: 0, formats: [], has_stitched: false,
    });
  });

  it('does not include Buffer bytes in the summary', () => {
    const result = {
      screenshots: [{ kind: 'page', format: 'jpeg', bytes: Buffer.alloc(1000) }],
    };

    const summary = screenshotExtractionPlugin.summarize(result);
    const json = JSON.stringify(summary);

    // WHY: Verify the summary is JSON-safe and contains no binary data.
    assert.ok(json.length < 500, 'summary should be compact');
    assert.equal(typeof JSON.parse(json), 'object', 'summary must round-trip through JSON');
    // WHY: The summary may have `total_bytes` (a number), but must never contain
    // raw Buffer data. Check that no Buffer-like content appears.
    const parsed = JSON.parse(json);
    assert.equal(typeof parsed.total_bytes, 'number', 'total_bytes is a number, not a Buffer');
    for (const val of Object.values(parsed)) {
      assert.ok(!Buffer.isBuffer(val), 'no value should be a Buffer');
    }
  });
});
