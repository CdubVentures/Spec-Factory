import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { generateAstKnobInventory } from '../scripts/generateAstKnobInventory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const snapshotPath = path.join(
  repoRoot,
  'implementation',
  'ai-indexing-plans',
  'ast-knob-inventory.snapshot.json',
);

test('AST knob inventory matches committed snapshot', () => {
  const actual = generateAstKnobInventory({ repoRoot });
  const snapshotText = fs.readFileSync(snapshotPath, 'utf8');
  const expected = JSON.parse(snapshotText);

  assert.deepEqual(
    actual,
    expected,
    'AST knob inventory changed. Run: node scripts/generateAstKnobInventory.js --write',
  );
});
