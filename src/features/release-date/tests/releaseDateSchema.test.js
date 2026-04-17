/**
 * releaseDateSchema — Zod response validation tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { releaseDateFinderResponseSchema } from '../releaseDateSchema.js';

describe('releaseDateFinderResponseSchema', () => {
  it('accepts a full valid response', () => {
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024-03-15',
      confidence: 90,
      unknown_reason: '',
      evidence: [{
        source_url: 'https://mfr.example.com/press',
        source_page: 'Press release',
        source_type: 'manufacturer',
        tier: 'tier1',
        excerpt: 'Available March 15, 2024',
      }],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    });
    assert.equal(parsed.release_date, '2024-03-15');
    assert.equal(parsed.confidence, 90);
    assert.equal(parsed.evidence.length, 1);
  });

  it('accepts "unk" as release_date', () => {
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: 'unk',
      confidence: 0,
      unknown_reason: 'No sources cite a launch date',
      evidence: [],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    });
    assert.equal(parsed.release_date, 'unk');
  });

  it('defaults missing evidence to empty array', () => {
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024-03',
      confidence: 60,
    });
    assert.deepEqual(parsed.evidence, []);
  });

  it('defaults missing discovery_log to empty', () => {
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024',
      confidence: 50,
    });
    assert.deepEqual(parsed.discovery_log, { urls_checked: [], queries_run: [], notes: [] });
  });

  it('rejects confidence outside 0-100', () => {
    assert.throws(() => releaseDateFinderResponseSchema.parse({
      release_date: '2024-03-15', confidence: 150,
    }));
    assert.throws(() => releaseDateFinderResponseSchema.parse({
      release_date: '2024-03-15', confidence: -10,
    }));
  });

  it('rejects non-integer confidence', () => {
    assert.throws(() => releaseDateFinderResponseSchema.parse({
      release_date: '2024-03-15', confidence: 85.5,
    }));
  });

  it('coerces unknown source_type to "other"', () => {
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024',
      confidence: 50,
      evidence: [{ source_url: 'x', source_type: 'manufacturer' }],
    });
    assert.equal(parsed.evidence[0].source_type, 'manufacturer');
    // Unknown source_type → Zod throws
    assert.throws(() => releaseDateFinderResponseSchema.parse({
      release_date: '2024', confidence: 50,
      evidence: [{ source_url: 'x', source_type: 'unknown_category' }],
    }));
  });

  it('defaults tier to "unknown" when omitted', () => {
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024',
      confidence: 50,
      evidence: [{ source_url: 'x' }],
    });
    assert.equal(parsed.evidence[0].tier, 'unknown');
  });
});
