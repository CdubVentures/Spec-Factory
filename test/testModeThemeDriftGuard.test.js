import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TEST_MODE_PAGE_PATH = path.resolve('tools/gui-react/src/pages/test-mode/TestModePage.tsx');
const RAW_COLOR_UTILITY_PATTERN = /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;

test('test mode page raw utility color drift is reduced for current migration wave', () => {
  const text = fs.readFileSync(TEST_MODE_PAGE_PATH, 'utf8');
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount <= 130,
    true,
    `test mode page raw utility color refs should be <= 130 for this migration wave, got ${rawColorCount}`,
  );
});

