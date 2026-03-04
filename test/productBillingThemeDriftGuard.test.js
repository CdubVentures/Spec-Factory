import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PRODUCT_PAGE_PATH = path.resolve(
  'tools/gui-react/src/pages/product/ProductPage.tsx',
);
const FIELD_STATUS_TABLE_PATH = path.resolve(
  'tools/gui-react/src/pages/product/FieldStatusTable.tsx',
);
const BILLING_PAGE_PATH = path.resolve(
  'tools/gui-react/src/pages/billing/BillingPage.tsx',
);
const OVERVIEW_PAGE_PATH = path.resolve(
  'tools/gui-react/src/pages/overview/OverviewPage.tsx',
);

const RAW_COLOR_UTILITY_PATTERN =
  /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const SF_TOKEN_PATTERN = /\bsf-[a-z0-9-]+\b/g;

test('product page avoids raw utility color classes', () => {
  const text = fs.readFileSync(PRODUCT_PAGE_PATH, 'utf8');
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount <= 0,
    true,
    `product page raw utility color refs should be <= 0 for this migration wave, got ${rawColorCount}`,
  );
});

test('billing page avoids raw utility color classes', () => {
  const text = fs.readFileSync(BILLING_PAGE_PATH, 'utf8');
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount <= 0,
    true,
    `billing page raw utility color refs should be <= 0 for this migration wave, got ${rawColorCount}`,
  );
});

test('overview page avoids raw utility color classes', () => {
  const text = fs.readFileSync(OVERVIEW_PAGE_PATH, 'utf8');
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount <= 0,
    true,
    `overview page raw utility color refs should be <= 0 for this migration wave, got ${rawColorCount}`,
  );
});

test('overview page semantic token density is retained', () => {
  const text = fs.readFileSync(OVERVIEW_PAGE_PATH, 'utf8');
  const sfCount = (text.match(SF_TOKEN_PATTERN) || []).length;
  assert.equal(
    sfCount >= 5,
    true,
    `overview page should include at least 5 semantic sf-* tokens, got ${sfCount}`,
  );
});

test('field status table semantic token density is retained', () => {
  const text = fs.readFileSync(FIELD_STATUS_TABLE_PATH, 'utf8');
  const sfCount = (text.match(SF_TOKEN_PATTERN) || []).length;
  assert.equal(
    sfCount >= 5,
    true,
    `field status table should include at least 5 semantic sf-* tokens, got ${sfCount}`,
  );
});
