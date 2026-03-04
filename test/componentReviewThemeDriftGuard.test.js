import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAW_COLOR_UTILITY_PATTERN = /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const LEGACY_MICRO_TEXT_PATTERN = /text-\[(8|9|10|11)px\]/g;
const HARD_CODED_HEX_PATTERN = /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})/gi;

test('component-review migrated panels avoid raw utility color classes', () => {
  const migratedPanels = [
    'tools/gui-react/src/pages/component-review/ComponentReviewPanel.tsx',
    'tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx',
    'tools/gui-react/src/pages/component-review/EnumSubTab.tsx',
    'tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx',
  ];

  const offenders = migratedPanels.reduce((acc, relPath) => {
    const filePath = path.resolve(relPath);
    const text = fs.readFileSync(filePath, 'utf8');
    const tokens = [...new Set(text.match(RAW_COLOR_UTILITY_PATTERN) || [])].sort();
    if (tokens.length === 0) return acc;
    acc.push({ file: relPath, tokens });
    return acc;
  }, []);

  assert.deepEqual(
    offenders,
    [],
    `replace component-review migrated panel raw utility color tokens with semantic primitives: ${JSON.stringify(offenders)}`,
  );
});

test('component-review migrated panels avoid arbitrary micro text utilities', () => {
  const migratedPanels = [
    'tools/gui-react/src/pages/component-review/ComponentReviewPanel.tsx',
    'tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx',
    'tools/gui-react/src/pages/component-review/EnumSubTab.tsx',
    'tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx',
  ];

  const offenders = migratedPanels.reduce((acc, relPath) => {
    const filePath = path.resolve(relPath);
    const text = fs.readFileSync(filePath, 'utf8');
    const tokens = [...new Set(text.match(LEGACY_MICRO_TEXT_PATTERN) || [])].sort();
    if (tokens.length === 0) return acc;
    acc.push({ file: relPath, tokens });
    return acc;
  }, []);

  assert.deepEqual(
    offenders,
    [],
    `replace component-review migrated panel micro text utilities with semantic primitives: ${JSON.stringify(offenders)}`,
  );
});

test('component-review action surfaces use semantic action primitives and avoid hardcoded hex in TSX', () => {
  const actionFiles = [
    'tools/gui-react/src/pages/component-review/ComponentReviewPanel.tsx',
    'tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx',
    'tools/gui-react/src/pages/component-review/ComponentSubTab.tsx',
    'tools/gui-react/src/pages/component-review/EnumSubTab.tsx',
  ];

  const primitiveContract = [
    { path: 'tools/gui-react/src/pages/component-review/ComponentReviewPanel.tsx', tokens: ['sf-run-ai-button', 'ActionTooltip'] },
    { path: 'tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx', tokens: ['sf-confirm-button-solid', 'sf-drawer-apply-button', 'ActionTooltip'] },
    { path: 'tools/gui-react/src/pages/component-review/ComponentSubTab.tsx', tokens: ['sf-run-ai-button', 'ActionTooltip'] },
    { path: 'tools/gui-react/src/pages/component-review/EnumSubTab.tsx', tokens: ['sf-run-ai-button', 'ActionTooltip'] },
  ];

  const missingPrimitives = primitiveContract.reduce((acc, row) => {
    const text = fs.readFileSync(path.resolve(row.path), 'utf8');
    const missingTokens = row.tokens.filter((token) => !text.includes(token));
    if (missingTokens.length === 0) return acc;
    acc.push({ file: row.path, missingTokens });
    return acc;
  }, []);

  assert.deepEqual(
    missingPrimitives,
    [],
    `component-review actions should stay on semantic primitives + shared tooltip contract: ${JSON.stringify(missingPrimitives)}`,
  );

  const hexOffenders = actionFiles.reduce((acc, relPath) => {
    const text = fs.readFileSync(path.resolve(relPath), 'utf8');
    const matches = [...new Set(text.match(HARD_CODED_HEX_PATTERN) || [])].sort();
    if (matches.length === 0) return acc;
    acc.push({ file: relPath, tokens: matches });
    return acc;
  }, []);

  assert.deepEqual(
    hexOffenders,
    [],
    `component-review TSX action surfaces should not hardcode palette hex values: ${JSON.stringify(hexOffenders)}`,
  );
});
