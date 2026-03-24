import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDomainCapSummary,
  resolveRuntimeDomainCapSummary,
} from './helpers/searchResultsHelpersHarness.js';

describe('resolveDomainCapSummary', () => {
  it('uses fast profile clamps when explicit knobs are not present', () => {
    const summary = resolveDomainCapSummary({ profile: 'fast' });
    assert.equal(summary.value, '2');
    assert.match(summary.tooltip, /Fast profile: clamps max pages\/domain to 2\./);
  });

  it('uses thorough profile floors when explicit knobs are not present', () => {
    const summary = resolveDomainCapSummary({ profile: 'thorough' });
    assert.equal(summary.value, '>=8');
    assert.match(summary.tooltip, /Thorough profile: raises floors to at least 8 pages\/domain\./);
  });

  it('prefers explicit knob values when provided', () => {
    const summary = resolveDomainCapSummary({
      profile: 'standard',
      maxPagesPerDomain: 5,
    });
    assert.equal(summary.value, '5');
    assert.equal(summary.uberDomainFloor, 6);
    assert.match(summary.tooltip, /Current domain cap display: 5/);
  });
});

describe('resolveRuntimeDomainCapSummary', () => {
  it('stays in hydrating state until runtime settings become available', () => {
    const summary = resolveRuntimeDomainCapSummary(undefined);
    assert.equal(summary.value, 'hydrating');
    assert.match(summary.tooltip, /still hydrating/i);
  });

  it('stays in hydrating state for an empty runtime snapshot payload', () => {
    const summary = resolveRuntimeDomainCapSummary({});
    assert.equal(summary.value, 'hydrating');
    assert.match(summary.tooltip, /still hydrating/i);
  });

  it('delegates to the resolved cap summary once runtime settings are hydrated', () => {
    const summary = resolveRuntimeDomainCapSummary({
      maxPagesPerDomain: 5,
    });
    assert.equal(summary.value, '5');
    assert.equal(summary.uberDomainFloor, 6);
  });
});
