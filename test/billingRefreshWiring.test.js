import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BILLING_PAGE_PATH = resolve('tools/gui-react/src/pages/billing/BillingPage.tsx');
const OVERVIEW_PAGE_PATH = resolve('tools/gui-react/src/pages/overview/OverviewPage.tsx');

function hasRefetchIntervalForQueryKey(source, keyPattern) {
  const pattern = new RegExp(`${keyPattern}[\\s\\S]*?refetchInterval\\s*:`, 'm');
  return pattern.test(source);
}

test('BillingPage refreshes single-category billing and learning queries', () => {
  const source = readFileSync(BILLING_PAGE_PATH, 'utf8');
  assert.equal(
    hasRefetchIntervalForQueryKey(source, "queryKey:\\s*\\['billing',\\s*category\\]"),
    true,
  );
  assert.equal(
    hasRefetchIntervalForQueryKey(source, "queryKey:\\s*\\['learning',\\s*category\\]"),
    true,
  );
});

test('BillingPage refreshes all-category billing queries', () => {
  const source = readFileSync(BILLING_PAGE_PATH, 'utf8');
  assert.equal(
    hasRefetchIntervalForQueryKey(source, "queryKey:\\s*\\['billing',\\s*cat\\]"),
    true,
  );
});

test('OverviewPage refreshes billing query', () => {
  const source = readFileSync(OVERVIEW_PAGE_PATH, 'utf8');
  assert.equal(
    hasRefetchIntervalForQueryKey(source, "queryKey:\\s*\\['billing',\\s*category\\]"),
    true,
  );
});
