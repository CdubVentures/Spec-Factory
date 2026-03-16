import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeApplyBlockedDomainCooldown } from '../src/features/indexing/orchestration/index.js';

test('maybeApplyBlockedDomainCooldown ignores non-blocking statuses/messages', () => {
  const hitCount = new Map();
  const applied = new Set();
  let blockCalls = 0;

  const result = maybeApplyBlockedDomainCooldown({
    source: { host: 'example.com', url: 'https://example.com/spec' },
    statusCode: 200,
    message: 'ok',
    blockedDomainHitCount: hitCount,
    blockedDomainThreshold: 2,
    blockedDomainsApplied: applied,
    planner: { blockHost: () => { blockCalls += 1; return 0; } },
    logger: { warn() {} },
    normalizeHostTokenFn: (value) => String(value || '').toLowerCase(),
    hostFromHttpUrlFn: () => 'example.com',
  });

  assert.equal(result, false);
  assert.equal(blockCalls, 0);
  assert.equal(hitCount.size, 0);
  assert.equal(applied.size, 0);
});

test('maybeApplyBlockedDomainCooldown applies 403 cooldown only after threshold', () => {
  const hitCount = new Map();
  const applied = new Set();
  const warnCalls = [];
  const plannerCalls = [];

  const first = maybeApplyBlockedDomainCooldown({
    source: { host: 'example.com', url: 'https://example.com/spec' },
    statusCode: 403,
    message: '',
    blockedDomainHitCount: hitCount,
    blockedDomainThreshold: 2,
    blockedDomainsApplied: applied,
    planner: {
      blockHost: (host, reason) => {
        plannerCalls.push({ host, reason });
        return 5;
      }
    },
    logger: { warn: (...args) => warnCalls.push(args) },
    normalizeHostTokenFn: (value) => String(value || '').toLowerCase(),
    hostFromHttpUrlFn: () => 'example.com',
  });

  const second = maybeApplyBlockedDomainCooldown({
    source: { host: 'example.com', url: 'https://example.com/spec' },
    statusCode: 403,
    message: '',
    blockedDomainHitCount: hitCount,
    blockedDomainThreshold: 2,
    blockedDomainsApplied: applied,
    planner: {
      blockHost: (host, reason) => {
        plannerCalls.push({ host, reason });
        return 5;
      }
    },
    logger: { warn: (...args) => warnCalls.push(args) },
    normalizeHostTokenFn: (value) => String(value || '').toLowerCase(),
    hostFromHttpUrlFn: () => 'example.com',
  });

  assert.equal(first, false);
  assert.equal(second, true);
  assert.equal(hitCount.get('example.com'), 2);
  assert.equal(applied.has('example.com'), true);
  assert.deepEqual(plannerCalls, [{ host: 'example.com', reason: 'status_403_backoff' }]);
  assert.equal(warnCalls.length, 1);
  assert.equal(warnCalls[0][0], 'blocked_domain_cooldown_applied');
  assert.equal(warnCalls[0][1].removed_count, 5);
});

test('maybeApplyBlockedDomainCooldown applies 429 backoff reason and does not reapply once set', () => {
  const hitCount = new Map();
  const applied = new Set();
  const plannerCalls = [];

  const first = maybeApplyBlockedDomainCooldown({
    source: { host: 'example.com', url: 'https://example.com/spec' },
    statusCode: 429,
    message: 'rate limit',
    blockedDomainHitCount: hitCount,
    blockedDomainThreshold: 1,
    blockedDomainsApplied: applied,
    planner: {
      blockHost: (host, reason) => {
        plannerCalls.push({ host, reason });
        return 2;
      }
    },
    logger: { warn() {} },
    normalizeHostTokenFn: (value) => String(value || '').toLowerCase(),
    hostFromHttpUrlFn: () => 'example.com',
  });

  const second = maybeApplyBlockedDomainCooldown({
    source: { host: 'example.com', url: 'https://example.com/spec' },
    statusCode: 429,
    message: 'rate limit',
    blockedDomainHitCount: hitCount,
    blockedDomainThreshold: 1,
    blockedDomainsApplied: applied,
    planner: {
      blockHost: (host, reason) => {
        plannerCalls.push({ host, reason });
        return 2;
      }
    },
    logger: { warn() {} },
    normalizeHostTokenFn: (value) => String(value || '').toLowerCase(),
    hostFromHttpUrlFn: () => 'example.com',
  });

  assert.equal(first, true);
  assert.equal(second, false);
  assert.deepEqual(plannerCalls, [{ host: 'example.com', reason: 'status_429_backoff' }]);
});

