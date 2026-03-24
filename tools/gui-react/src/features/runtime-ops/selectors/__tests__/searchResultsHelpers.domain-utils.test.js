import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSiteScope,
  providerDisplayLabel,
  parseDomainFromUrl,
  enrichResultDomains,
  makeResult,
  makeDetail,
} from './helpers/searchResultsHelpersHarness.js';

describe('extractSiteScope', () => {
  it('returns null for query without site: prefix', () => {
    assert.equal(extractSiteScope('Endgame Gear OP1w specs'), null);
  });

  it('extracts domain from site: prefix at start of query', () => {
    assert.equal(extractSiteScope('site:razer.com Endgame Gear OP1w specs'), 'razer.com');
  });

  it('extracts domain from site: prefix in middle of query', () => {
    assert.equal(extractSiteScope('Endgame Gear site:razer.com specs'), 'razer.com');
  });

  it('returns null for empty string', () => {
    assert.equal(extractSiteScope(''), null);
  });

  it('returns null for undefined', () => {
    assert.equal(extractSiteScope(undefined), null);
  });

  it('extracts domain with subdomain', () => {
    assert.equal(extractSiteScope('site:support.logitech.com G Pro specs'), 'support.logitech.com');
  });
});

// ── providerDisplayLabel ──

describe('providerDisplayLabel', () => {
  it('returns canonical label for dual provider', () => {
    assert.equal(providerDisplayLabel('dual'), 'Dual');
  });

  it('formats compound provider with + separator', () => {
    assert.equal(providerDisplayLabel('google+searxng'), 'Google + SearXNG');
    assert.equal(providerDisplayLabel('google+bing'), 'Google + Bing');
  });

  it('returns "SearXNG" for searxng', () => {
    assert.equal(providerDisplayLabel('searxng'), 'SearXNG');
  });

  it('returns capitalized name for google', () => {
    assert.equal(providerDisplayLabel('google'), 'Google');
  });

  it('returns capitalized name for bing', () => {
    assert.equal(providerDisplayLabel('bing'), 'Bing');
  });

  it('returns raw value for unknown providers', () => {
    assert.equal(providerDisplayLabel('custom_provider'), 'custom_provider');
  });

  it('returns empty string for empty/undefined', () => {
    assert.equal(providerDisplayLabel(''), '');
    assert.equal(providerDisplayLabel(undefined), '');
  });
});

// ── parseDomainFromUrl ──

describe('parseDomainFromUrl', () => {
  it('extracts hostname from valid URL', () => {
    assert.equal(parseDomainFromUrl('https://www.razer.com/mice/viper-v3-pro'), 'www.razer.com');
  });

  it('extracts hostname from URL without www', () => {
    assert.equal(parseDomainFromUrl('https://rtings.com/mouse/reviews/razer'), 'rtings.com');
  });

  it('returns empty string for empty input', () => {
    assert.equal(parseDomainFromUrl(''), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(parseDomainFromUrl(undefined), '');
  });

  it('returns empty string for invalid URL', () => {
    assert.equal(parseDomainFromUrl('not-a-url'), '');
  });

  it('extracts hostname from URL with port', () => {
    assert.equal(parseDomainFromUrl('https://localhost:3000/api/test'), 'localhost');
  });

  it('extracts hostname from tracking URL with query params', () => {
    assert.equal(parseDomainFromUrl('https://example.com/y.js?ad_domain=amazon.com'), 'example.com');
  });
});

// ── enrichResultDomains ──

describe('enrichResultDomains', () => {
  it('fills empty domain from URL', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ domain: '', url: 'https://razer.com/mice/viper' }),
          makeResult({ domain: '', url: 'https://rtings.com/mouse/reviews' }),
        ],
      }),
    ];
    const enriched = enrichResultDomains(details);
    assert.equal(enriched[0].results[0].domain, 'razer.com');
    assert.equal(enriched[0].results[1].domain, 'rtings.com');
  });

  it('preserves existing non-empty domain', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ domain: 'already-set.com', url: 'https://different.com/page' }),
        ],
      }),
    ];
    const enriched = enrichResultDomains(details);
    assert.equal(enriched[0].results[0].domain, 'already-set.com');
  });

  it('does not mutate original details', () => {
    const original = [
      makeDetail({
        results: [makeResult({ domain: '', url: 'https://example.com/page' })],
      }),
    ];
    const enriched = enrichResultDomains(original);
    assert.equal(original[0].results[0].domain, '');
    assert.equal(enriched[0].results[0].domain, 'example.com');
  });

  it('handles empty details array', () => {
    const enriched = enrichResultDomains([]);
    assert.deepEqual(enriched, []);
  });

  it('strips www. prefix from parsed domains', () => {
    const details = [
      makeDetail({
        results: [makeResult({ domain: '', url: 'https://www.amazon.com/dp/12345' })],
      }),
    ];
    const enriched = enrichResultDomains(details);
    assert.equal(enriched[0].results[0].domain, 'amazon.com');
  });
});

// â”€â”€ resolveDomainCapSummary â”€â”€
