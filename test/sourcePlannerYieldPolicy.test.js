import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHostYieldState } from '../src/planner/sourcePlannerYieldPolicy.js';

// --- Table-driven yield policy tests ---

const YIELD_CASES = [
  {
    name: 'blocked host returns blocked',
    host: 'blocked.com',
    rootDomain: 'blocked.com',
    fieldYieldMap: {},
    blockedHosts: new Set(['blocked.com']),
    hostCounts: new Map(),
    maxPagesPerDomain: 2,
    expect: { state: 'blocked', reason: 'blocked_host' },
  },
  {
    name: 'capped host returns capped',
    host: 'full.com',
    rootDomain: 'full.com',
    fieldYieldMap: {},
    blockedHosts: new Set(),
    hostCounts: new Map([['full.com', 2]]),
    maxPagesPerDomain: 2,
    expect: { state: 'capped', reason: 'host_count_at_cap' },
  },
  {
    name: 'host count above cap returns capped',
    host: 'full.com',
    rootDomain: 'full.com',
    fieldYieldMap: {},
    blockedHosts: new Set(),
    hostCounts: new Map([['full.com', 5]]),
    maxPagesPerDomain: 2,
    expect: { state: 'capped', reason: 'host_count_at_cap' },
  },
  {
    name: 'high-yield host returns promoted (host-level)',
    host: 'good.com',
    rootDomain: 'good.com',
    fieldYieldMap: {
      by_host: { 'good.com': { accepted: 5, seen: 6 } },
    },
    blockedHosts: new Set(),
    hostCounts: new Map(),
    maxPagesPerDomain: 2,
    expect: { state: 'promoted', reason: 'high_yield_host' },
  },
  {
    name: 'high-yield domain returns promoted (domain-level fallback)',
    host: 'sub.good.com',
    rootDomain: 'good.com',
    fieldYieldMap: {
      by_domain: { 'good.com': { accepted: 4, seen: 5 } },
    },
    blockedHosts: new Set(),
    hostCounts: new Map(),
    maxPagesPerDomain: 2,
    expect: { state: 'promoted', reason: 'high_yield_domain' },
  },
  {
    name: 'low-yield host returns caution',
    host: 'bad.com',
    rootDomain: 'bad.com',
    fieldYieldMap: {
      by_host: { 'bad.com': { accepted: 0, seen: 8 } },
    },
    blockedHosts: new Set(),
    hostCounts: new Map(),
    maxPagesPerDomain: 2,
    expect: { state: 'caution', reason: 'low_yield_host' },
  },
  {
    name: 'low-yield domain returns caution (domain-level)',
    host: 'sub.bad.com',
    rootDomain: 'bad.com',
    fieldYieldMap: {
      by_domain: { 'bad.com': { accepted: 0, seen: 10 } },
    },
    blockedHosts: new Set(),
    hostCounts: new Map(),
    maxPagesPerDomain: 2,
    expect: { state: 'caution', reason: 'low_yield_domain' },
  },
  {
    name: 'no yield data returns normal',
    host: 'new.com',
    rootDomain: 'new.com',
    fieldYieldMap: {},
    blockedHosts: new Set(),
    hostCounts: new Map(),
    maxPagesPerDomain: 2,
    expect: { state: 'normal', reason: 'no_yield_data' },
  },
  {
    name: 'under min-support (2 attempts) returns normal',
    host: 'few.com',
    rootDomain: 'few.com',
    fieldYieldMap: {
      by_host: { 'few.com': { accepted: 0, seen: 2 } },
    },
    blockedHosts: new Set(),
    hostCounts: new Map(),
    maxPagesPerDomain: 2,
    expect: { state: 'normal', reason: 'below_min_support' },
  },
  {
    name: 'host-level takes precedence over domain-level',
    host: 'sub.mixed.com',
    rootDomain: 'mixed.com',
    fieldYieldMap: {
      by_host: { 'sub.mixed.com': { accepted: 5, seen: 6 } },
      by_domain: { 'mixed.com': { accepted: 0, seen: 10 } },
    },
    blockedHosts: new Set(),
    hostCounts: new Map(),
    maxPagesPerDomain: 2,
    expect: { state: 'promoted', reason: 'high_yield_host' },
  },
  {
    name: 'blocked takes precedence over yield state',
    host: 'blocked.com',
    rootDomain: 'blocked.com',
    fieldYieldMap: {
      by_host: { 'blocked.com': { accepted: 10, seen: 10 } },
    },
    blockedHosts: new Set(['blocked.com']),
    hostCounts: new Map(),
    maxPagesPerDomain: 2,
    expect: { state: 'blocked', reason: 'blocked_host' },
  },
  {
    name: 'capped takes precedence over yield-based promotion',
    host: 'full.com',
    rootDomain: 'full.com',
    fieldYieldMap: {
      by_host: { 'full.com': { accepted: 10, seen: 10 } },
    },
    blockedHosts: new Set(),
    hostCounts: new Map([['full.com', 3]]),
    maxPagesPerDomain: 2,
    expect: { state: 'capped', reason: 'host_count_at_cap' },
  },
];

for (const { name, host, rootDomain, fieldYieldMap, blockedHosts, hostCounts, maxPagesPerDomain, expect: expected } of YIELD_CASES) {
  test(`resolveHostYieldState: ${name}`, () => {
    const result = resolveHostYieldState({
      host,
      rootDomain,
      fieldYieldMap,
      blockedHosts,
      hostCounts,
      maxPagesPerDomain,
    });
    assert.equal(result.state, expected.state, `state should be ${expected.state}`);
    assert.equal(result.reason, expected.reason, `reason should be ${expected.reason}`);
  });
}
