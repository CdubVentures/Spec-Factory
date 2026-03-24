/**
 * Tests for triageRejectAuditor — Search Execution phase SERP Triage reject audit.
 * Phase 1: metadata infrastructure only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sampleRejectAudit, buildAuditTrail } from '../triageRejectAuditor.js';

describe('triageRejectAuditor — sampleRejectAudit', () => {
  it('samples up to sampleSize from hard drops', () => {
    const hardDrops = [
      { url: 'https://a.com', hard_drop_reason: 'denied_host' },
      { url: 'https://b.com', hard_drop_reason: 'url_cooldown' },
      { url: 'https://c.com', hard_drop_reason: 'invalid_protocol' },
      { url: 'https://d.com', hard_drop_reason: 'utility_shell' },
    ];

    const samples = sampleRejectAudit({ hardDrops, notSelected: [], sampleSize: 3 });
    assert.ok(samples.length <= 3, 'respects sampleSize');
    assert.ok(samples.length >= 1, 'at least one sample');
  });

  it('samples highest-score misses from notSelected', () => {
    const notSelected = [
      { url: 'https://a.com', score: 100, identity_prelim: 'exact', host_trust_class: 'official' },
      { url: 'https://b.com', score: 50, identity_prelim: 'family', host_trust_class: 'trusted_review' },
      { url: 'https://c.com', score: 10, identity_prelim: 'uncertain', host_trust_class: 'community' },
    ];

    const samples = sampleRejectAudit({ hardDrops: [], notSelected, sampleSize: 2 });
    assert.ok(samples.length <= 2, 'respects sampleSize');
    // Should prefer highest-score misses
    if (samples.length > 0) {
      assert.ok(samples.some((s) => s.url === 'https://a.com'), 'includes highest-score miss');
    }
  });

  it('empty hard drops produces empty samples', () => {
    const samples = sampleRejectAudit({ hardDrops: [], notSelected: [], sampleSize: 3 });
    assert.equal(samples.length, 0);
  });

  it('null inputs handled gracefully', () => {
    const samples = sampleRejectAudit({ hardDrops: null, notSelected: null });
    assert.equal(samples.length, 0);
  });
});

describe('triageRejectAuditor — buildAuditTrail', () => {
  it('returns correct structure', () => {
    const trail = buildAuditTrail({
      auditSamples: [{ url: 'https://a.com', source: 'hard_drop', reason: 'denied_host' }],
      hardDrops: [{ url: 'https://a.com' }, { url: 'https://b.com' }],
      notSelected: [{ url: 'https://c.com' }],
      selected: [{ url: 'https://d.com' }],
    });

    assert.ok(Array.isArray(trail.hard_drop_sample), 'has hard_drop_sample');
    assert.ok(Array.isArray(trail.soft_exclude_sample), 'has soft_exclude_sample');
    assert.equal(trail.hard_drop_total, 2);
    assert.equal(trail.soft_exclude_total, 1);
  });

  it('empty inputs produce zeroed trail', () => {
    const trail = buildAuditTrail({
      auditSamples: [],
      hardDrops: [],
      notSelected: [],
      selected: [],
    });

    assert.equal(trail.hard_drop_total, 0);
    assert.equal(trail.soft_exclude_total, 0);
    assert.equal(trail.hard_drop_sample.length, 0);
    assert.equal(trail.soft_exclude_sample.length, 0);
  });
});
