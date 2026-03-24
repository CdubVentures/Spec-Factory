import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvidenceClass } from './helpers/buildFieldHistoriesHarness.js';

test('classifyEvidenceClass', async (t) => {
  await t.test('tier 1 html resolves to manufacturer_html', () => {
    assert.equal(classifyEvidenceClass({ tier: 1, tierName: 'manufacturer', method: 'dom', host: 'logitechg.com' }), 'manufacturer_html');
  });

  await t.test('tier 1 pdf method resolves to manual_pdf', () => {
    assert.equal(classifyEvidenceClass({ tier: 1, tierName: 'manufacturer', method: 'pdf_table', host: 'logitechg.com' }), 'manual_pdf');
  });

  await t.test('tier 1 pdf url resolves to manual_pdf', () => {
    assert.equal(classifyEvidenceClass({ tier: 1, tierName: 'manufacturer', method: 'dom', host: 'logitechg.com', url: 'https://logitechg.com/manual.pdf' }), 'manual_pdf');
  });

  await t.test('tier 1 support host resolves to support_docs', () => {
    assert.equal(classifyEvidenceClass({ tier: 1, tierName: 'manufacturer', method: 'dom', host: 'support.logi.com' }), 'support_docs');
  });

  await t.test('review tier name resolves to review', () => {
    assert.equal(classifyEvidenceClass({ tier: 2, tierName: 'review', method: 'dom', host: 'rtings.com' }), 'review');
  });

  await t.test('retailer tier name resolves to retailer', () => {
    assert.equal(classifyEvidenceClass({ tier: 2, tierName: 'retailer', method: 'dom', host: 'amazon.com' }), 'retailer');
  });

  await t.test('benchmark hosts resolve to benchmark', () => {
    assert.equal(classifyEvidenceClass({ tier: 2, tierName: 'professional', method: 'dom', host: 'userbenchmark.com' }), 'benchmark');
  });

  await t.test('database hosts resolve to database', () => {
    assert.equal(classifyEvidenceClass({ tier: 2, tierName: 'professional', method: 'dom', host: 'techpowerup.com' }), 'database');
  });

  await t.test('tier 3 falls back to fallback_web', () => {
    assert.equal(classifyEvidenceClass({ tier: 3, tierName: 'community', method: 'dom', host: 'reddit.com' }), 'fallback_web');
  });

  await t.test('nullish input falls back to fallback_web', () => {
    assert.equal(classifyEvidenceClass(null), 'fallback_web');
    assert.equal(classifyEvidenceClass({}), 'fallback_web');
  });
});
