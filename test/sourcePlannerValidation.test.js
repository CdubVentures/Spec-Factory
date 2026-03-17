import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkShouldUseApprovedQueue,
  checkIsResumeSeed,
  checkMatchesAllowedLockedProductSlug,
  checkShouldRejectLockedManufacturerUrl,
  checkShouldRejectLockedManufacturerLocaleDuplicateUrl,
  checkHasQueuedOrVisitedComparableUrl,
  checkIsRelevantDiscoveredUrl
} from '../src/planner/sourcePlannerValidation.js';

function baseValidationCtx(overrides = {}) {
  return {
    categoryConfig: {
      sourceHosts: [
        { host: 'manufacturer.com', tierName: 'manufacturer' },
        { host: 'lab.com', tierName: 'lab' }
      ],
      denylist: []
    },
    allowlistHosts: new Set(['manufacturer.com', 'lab.com']),
    allowedCategoryProductSlugs: new Set(),
    modelSlugIdentityTokens: [],
    modelTokens: [],
    brandTokens: [],
    brandKey: '',
    sourceHostMap: new Map(),
    modelSlug: '',
    ...overrides
  };
}

function baseQueueState(overrides = {}) {
  return {
    visitedUrls: new Set(),
    priorityQueue: [],
    manufacturerQueue: [],
    queue: [],
    candidateQueue: [],
    ...overrides
  };
}

// --- checkShouldUseApprovedQueue ---

test('checkShouldUseApprovedQueue returns false when forceCandidate', () => {
  const ctx = baseValidationCtx();
  assert.equal(checkShouldUseApprovedQueue('manufacturer.com', true, true, ctx), false);
});

test('checkShouldUseApprovedQueue returns true when forceApproved', () => {
  const ctx = baseValidationCtx();
  assert.equal(checkShouldUseApprovedQueue('unknown.com', true, false, ctx), true);
});

test('checkShouldUseApprovedQueue checks allowlist when not forced', () => {
  const ctx = baseValidationCtx();
  assert.equal(checkShouldUseApprovedQueue('manufacturer.com', false, false, ctx), true);
  assert.equal(checkShouldUseApprovedQueue('unknown.com', false, false, ctx), false);
});

// --- checkIsResumeSeed ---

test('checkIsResumeSeed detects resume_ prefix', () => {
  assert.equal(checkIsResumeSeed('resume_seed'), true);
  assert.equal(checkIsResumeSeed('resume_learning'), true);
  assert.equal(checkIsResumeSeed('seed'), false);
  assert.equal(checkIsResumeSeed(''), false);
  assert.equal(checkIsResumeSeed(null), false);
});

// --- checkMatchesAllowedLockedProductSlug ---

test('checkMatchesAllowedLockedProductSlug matches exact slug', () => {
  const ctx = baseValidationCtx({
    allowedCategoryProductSlugs: new Set(['viper-v3-pro'])
  });
  assert.equal(checkMatchesAllowedLockedProductSlug('viper-v3-pro', ctx), true);
  assert.equal(checkMatchesAllowedLockedProductSlug('viper-v3', ctx), false);
});

test('checkMatchesAllowedLockedProductSlug matches slug with benign suffix', () => {
  const ctx = baseValidationCtx({
    allowedCategoryProductSlugs: new Set(['viper-v3-pro'])
  });
  assert.equal(checkMatchesAllowedLockedProductSlug('viper-v3-pro-base', ctx), true);
});

test('checkMatchesAllowedLockedProductSlug rejects non-benign suffix', () => {
  const ctx = baseValidationCtx({
    allowedCategoryProductSlugs: new Set(['viper-v3-pro'])
  });
  assert.equal(checkMatchesAllowedLockedProductSlug('viper-v3-pro-wireless', ctx), false);
});

test('checkMatchesAllowedLockedProductSlug returns false for empty slugs', () => {
  const ctx = baseValidationCtx({ allowedCategoryProductSlugs: new Set() });
  assert.equal(checkMatchesAllowedLockedProductSlug('anything', ctx), false);
  assert.equal(checkMatchesAllowedLockedProductSlug('', ctx), false);
});

// --- checkShouldRejectLockedManufacturerUrl ---

test('checkShouldRejectLockedManufacturerUrl returns false when no locked slugs', () => {
  const ctx = baseValidationCtx({ allowedCategoryProductSlugs: new Set() });
  const parsed = new URL('https://manufacturer.com/mice/some-product');
  assert.equal(checkShouldRejectLockedManufacturerUrl(parsed, ctx), false);
});

test('checkShouldRejectLockedManufacturerUrl allows low-overlap sibling (1 of 2 tokens)', () => {
  const ctx = baseValidationCtx({
    allowedCategoryProductSlugs: new Set(['viper-v3-pro']),
    modelSlugIdentityTokens: ['viper', 'pro']
  });
  // Only 'viper' matches (1 of 2 required), so this is NOT rejected
  const parsed = new URL('https://manufacturer.com/mice/viper-v3-hyperspeed');
  assert.equal(checkShouldRejectLockedManufacturerUrl(parsed, ctx), false);
});

test('checkShouldRejectLockedManufacturerUrl rejects high-overlap sibling (2 of 2 tokens)', () => {
  const ctx = baseValidationCtx({
    allowedCategoryProductSlugs: new Set(['viper-v3-pro']),
    modelSlugIdentityTokens: ['viper', 'pro']
  });
  // Both 'viper' and 'pro' match → reject
  const parsed = new URL('https://manufacturer.com/mice/viper-pro-wireless');
  assert.equal(checkShouldRejectLockedManufacturerUrl(parsed, ctx), true);
});

test('checkShouldRejectLockedManufacturerUrl allows exact match', () => {
  const ctx = baseValidationCtx({
    allowedCategoryProductSlugs: new Set(['viper-v3-pro']),
    modelSlugIdentityTokens: ['viper', 'pro']
  });
  const parsed = new URL('https://manufacturer.com/mice/viper-v3-pro');
  assert.equal(checkShouldRejectLockedManufacturerUrl(parsed, ctx), false);
});

// --- checkShouldRejectLockedManufacturerLocaleDuplicateUrl ---

test('checkShouldRejectLockedManufacturerLocaleDuplicateUrl rejects locale-prefixed locked product', () => {
  const ctx = baseValidationCtx({
    allowedCategoryProductSlugs: new Set(['viper-v3-pro'])
  });
  const parsed = new URL('https://manufacturer.com/en-us/mice/viper-v3-pro');
  assert.equal(
    checkShouldRejectLockedManufacturerLocaleDuplicateUrl(parsed, {}, ctx),
    true
  );
});

test('checkShouldRejectLockedManufacturerLocaleDuplicateUrl allows when allowResume', () => {
  const ctx = baseValidationCtx({
    allowedCategoryProductSlugs: new Set(['viper-v3-pro'])
  });
  const parsed = new URL('https://manufacturer.com/en-us/mice/viper-v3-pro');
  assert.equal(
    checkShouldRejectLockedManufacturerLocaleDuplicateUrl(parsed, { allowResume: true }, ctx),
    false
  );
});

test('checkShouldRejectLockedManufacturerLocaleDuplicateUrl allows non-locale paths', () => {
  const ctx = baseValidationCtx({
    allowedCategoryProductSlugs: new Set(['viper-v3-pro'])
  });
  const parsed = new URL('https://manufacturer.com/mice/viper-v3-pro');
  assert.equal(
    checkShouldRejectLockedManufacturerLocaleDuplicateUrl(parsed, {}, ctx),
    false
  );
});

// --- checkHasQueuedOrVisitedComparableUrl ---

test('checkHasQueuedOrVisitedComparableUrl finds visited URL', () => {
  const qs = baseQueueState({
    visitedUrls: new Set(['https://example.com/mice/product'])
  });
  const parsed = new URL('https://example.com/mice/product');
  assert.equal(checkHasQueuedOrVisitedComparableUrl(parsed, {}, qs), true);
});

test('checkHasQueuedOrVisitedComparableUrl finds queued URL', () => {
  const qs = baseQueueState({
    queue: [{ url: 'https://example.com/mice/product' }]
  });
  const parsed = new URL('https://example.com/mice/product');
  assert.equal(checkHasQueuedOrVisitedComparableUrl(parsed, {}, qs), true);
});

test('checkHasQueuedOrVisitedComparableUrl returns false for new URL', () => {
  const qs = baseQueueState();
  const parsed = new URL('https://example.com/mice/product');
  assert.equal(checkHasQueuedOrVisitedComparableUrl(parsed, {}, qs), false);
});

test('checkHasQueuedOrVisitedComparableUrl supports stripLocale option', () => {
  const qs = baseQueueState({
    visitedUrls: new Set(['https://example.com/mice/product'])
  });
  const parsed = new URL('https://example.com/en/mice/product');
  assert.equal(checkHasQueuedOrVisitedComparableUrl(parsed, { stripLocale: true }, qs), true);
});

// --- checkIsRelevantDiscoveredUrl ---

test('checkIsRelevantDiscoveredUrl rejects static assets', () => {
  const ctx = baseValidationCtx();
  const cases = ['.css', '.js', '.png', '.jpg', '.webp', '.svg', '.gif', '.ico', '.woff2', '.json'];
  for (const ext of cases) {
    const parsed = new URL(`https://manufacturer.com/assets/file${ext}`);
    assert.equal(
      checkIsRelevantDiscoveredUrl(parsed, {}, ctx),
      false,
      `should reject ${ext}`
    );
  }
});

test('checkIsRelevantDiscoveredUrl rejects locale-prefixed non-manufacturer URLs', () => {
  const ctx = baseValidationCtx();
  const parsed = new URL('https://lab.com/en/product/mouse');
  assert.equal(checkIsRelevantDiscoveredUrl(parsed, {}, ctx), false);
});

test('checkIsRelevantDiscoveredUrl rejects root path', () => {
  const ctx = baseValidationCtx();
  const parsed = new URL('https://manufacturer.com/');
  assert.equal(checkIsRelevantDiscoveredUrl(parsed, {}, ctx), false);
});

test('checkIsRelevantDiscoveredUrl rejects negative keywords without model token', () => {
  const ctx = baseValidationCtx();
  const negativePaths = ['/cart', '/checkout', '/account', '/blog', '/forum'];
  for (const path of negativePaths) {
    const parsed = new URL(`https://manufacturer.com${path}/page`);
    assert.equal(
      checkIsRelevantDiscoveredUrl(parsed, {}, ctx),
      false,
      `should reject ${path}`
    );
  }
});

test('checkIsRelevantDiscoveredUrl accepts sitemap paths', () => {
  const ctx = baseValidationCtx();
  const parsed = new URL('https://manufacturer.com/sitemap.xml');
  assert.equal(
    checkIsRelevantDiscoveredUrl(parsed, {}, ctx),
    true
  );
});

test('checkIsRelevantDiscoveredUrl accepts manufacturer product paths with model tokens', () => {
  const ctx = baseValidationCtx({
    modelTokens: ['superlight'],
    sourceHostMap: new Map([['manufacturer.com', { role: 'manufacturer' }]])
  });
  const parsed = new URL('https://manufacturer.com/mice/g-pro-x-superlight-2');
  assert.equal(
    checkIsRelevantDiscoveredUrl(parsed, { manufacturerContext: true }, ctx),
    true
  );
});

test('checkIsRelevantDiscoveredUrl rejects non-manufacturer blog even with model token', () => {
  const ctx = baseValidationCtx({
    modelTokens: ['superlight'],
    sourceHostMap: new Map([['review.com', { role: 'review' }]])
  });
  const parsed = new URL('https://review.com/blog/superlight-review');
  assert.equal(
    checkIsRelevantDiscoveredUrl(parsed, {}, ctx),
    false
  );
});

test('checkIsRelevantDiscoveredUrl rejects unbranded follow-ups on brand-prefixed hosts', () => {
  const ctx = baseValidationCtx({
    brandKey: 'razer',
    modelTokens: ['viper'],
    brandTokens: ['razer'],
    sourceHostMap: new Map([['razer.com', { role: 'manufacturer' }]])
  });
  const parsed = new URL('https://razer.com/mice/viper-mini');
  assert.equal(
    checkIsRelevantDiscoveredUrl(parsed, { manufacturerContext: true }, ctx),
    false
  );
});

test('checkIsRelevantDiscoveredUrl accepts branded follow-ups on brand-prefixed hosts', () => {
  const ctx = baseValidationCtx({
    brandKey: 'razer',
    modelTokens: ['viper'],
    brandTokens: ['razer'],
    sourceHostMap: new Map([['razer.com', { role: 'manufacturer' }]])
  });
  const parsed = new URL('https://razer.com/mice/razer-viper-v3-pro');
  assert.equal(
    checkIsRelevantDiscoveredUrl(parsed, { manufacturerContext: true }, ctx),
    true
  );
});

test('checkIsRelevantDiscoveredUrl accepts manufacturer product path in manufacturer context', () => {
  const ctx = baseValidationCtx({
    modelTokens: [],
    brandTokens: [],
    sourceHostMap: new Map([['manufacturer.com', { role: 'manufacturer' }]])
  });
  const parsed = new URL('https://manufacturer.com/product/some-mouse');
  assert.equal(
    checkIsRelevantDiscoveredUrl(parsed, { manufacturerContext: true }, ctx),
    true
  );
});
