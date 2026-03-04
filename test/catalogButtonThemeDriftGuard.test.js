import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CATEGORY_MANAGER_PATH = path.resolve(
  "tools/gui-react/src/pages/catalog/CategoryManager.tsx",
);
const PRODUCT_MANAGER_PATH = path.resolve(
  "tools/gui-react/src/pages/catalog/ProductManager.tsx",
);
const CATALOG_PAGE_PATH = path.resolve(
  "tools/gui-react/src/pages/catalog/CatalogPage.tsx",
);
const BRAND_MANAGER_PATH = path.resolve(
  "tools/gui-react/src/pages/studio/BrandManager.tsx",
);
const RAW_COLOR_UTILITY_PATTERN =
  /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const SF_TOKEN_PATTERN = /\bsf-[a-z0-9-]+\b/g;

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function hasButtonPrimitive(text, constName, primitiveClass) {
  const pattern = new RegExp(
    `const\\s+${constName}\\s*=\\s*['"\`][^'"\`]*\\b${primitiveClass}\\b[^'"\`]*['"\`]`,
    "m",
  );
  return pattern.test(text);
}

test("catalog and brand managers keep save/add buttons primary and non-primary buttons neutral", () => {
  const categoryText = readText(CATEGORY_MANAGER_PATH);
  const productText = readText(PRODUCT_MANAGER_PATH);
  const brandText = readText(BRAND_MANAGER_PATH);

  assert.equal(
    categoryText.includes(
      "const btnPrimary = 'px-4 py-2 text-sm sf-primary-button transition-colors disabled:opacity-50';",
    ),
    true,
    "category manager add button should use shared primary primitive",
  );

  const requiredCatalogConstants = [
    { constName: "btnPrimary", primitiveClass: "sf-primary-button" },
    { constName: "btnSecondary", primitiveClass: "sf-icon-button" },
  ];
  const productMissing = requiredCatalogConstants.filter(
    ({ constName, primitiveClass }) =>
      !hasButtonPrimitive(productText, constName, primitiveClass),
  );
  assert.deepEqual(
    productMissing,
    [],
    `product manager should map add/save to primary and action buttons to neutral icon treatment: ${JSON.stringify(productMissing)}`,
  );

  const brandMissing = requiredCatalogConstants.filter(
    ({ constName, primitiveClass }) =>
      !hasButtonPrimitive(brandText, constName, primitiveClass),
  );
  assert.deepEqual(
    brandMissing,
    [],
    `brand manager should map add/save to primary and action buttons to neutral icon treatment: ${JSON.stringify(brandMissing)}`,
  );

  const legacyPrimaryBundle = "bg-accent text-white rounded hover:bg-blue-600";
  const legacySecondaryBundle =
    "border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700";

  assert.equal(
    categoryText.includes(legacyPrimaryBundle),
    false,
    "category manager should not use legacy hardcoded primary bundle",
  );
  assert.equal(
    productText.includes(legacyPrimaryBundle),
    false,
    "product manager should not use legacy hardcoded primary bundle",
  );
  assert.equal(
    brandText.includes(legacyPrimaryBundle),
    false,
    "brand manager should not use legacy hardcoded primary bundle",
  );

  assert.equal(
    productText.includes(legacySecondaryBundle),
    false,
    "product manager should not use legacy hardcoded neutral bundle",
  );
  assert.equal(
    brandText.includes(legacySecondaryBundle),
    false,
    "brand manager should not use legacy hardcoded neutral bundle",
  );
});

test("brand manager raw utility color drift is reduced for current migration wave", () => {
  const brandText = readText(BRAND_MANAGER_PATH);
  const rawColorCount = (brandText.match(RAW_COLOR_UTILITY_PATTERN) || [])
    .length;
  assert.equal(
    rawColorCount <= 0,
    true,
    `brand manager raw utility color refs should be <= 0 for this migration wave, got ${rawColorCount}`,
  );
});

test("category manager raw utility color drift is reduced for current migration wave", () => {
  const categoryText = readText(CATEGORY_MANAGER_PATH);
  const rawColorCount = (categoryText.match(RAW_COLOR_UTILITY_PATTERN) || [])
    .length;
  assert.equal(
    rawColorCount <= 5,
    true,
    `category manager raw utility color refs should be <= 5 for this migration wave, got ${rawColorCount}`,
  );
});

test("product manager raw utility color drift is reduced for current migration wave", () => {
  const productText = readText(PRODUCT_MANAGER_PATH);
  const rawColorCount = (productText.match(RAW_COLOR_UTILITY_PATTERN) || [])
    .length;
  assert.equal(
    rawColorCount <= 0,
    true,
    `product manager raw utility color refs should be <= 0 for this migration wave, got ${rawColorCount}`,
  );
});

test("catalog page raw utility color drift is reduced for current migration wave", () => {
  const text = readText(CATALOG_PAGE_PATH);
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || [])
    .length;
  assert.equal(
    rawColorCount <= 0,
    true,
    `catalog page raw utility color refs should be <= 0 for this migration wave, got ${rawColorCount}`,
  );
});

test("catalog page semantic token density is retained", () => {
  const text = readText(CATALOG_PAGE_PATH);
  const sfCount = (text.match(SF_TOKEN_PATTERN) || []).length;
  assert.equal(
    sfCount >= 5,
    true,
    `catalog page should include at least 5 semantic sf-* tokens, got ${sfCount}`,
  );
});
