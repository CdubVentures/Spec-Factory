import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SNAPSHOT_PATH = path.resolve('implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json');
const MATRIX_PATH = path.resolve('implementation/ui-styling-system-standardization/panel-style-drift-matrix.md');
const QUEUE_PATH = path.resolve('implementation/ui-styling-system-standardization/panel-style-remediation-queue.md');

function readSnapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('panel drift snapshot stores both total and unique raw color metrics per surface', () => {
  const snapshot = readSnapshot();

  assert.equal(Array.isArray(snapshot.rows), true, 'snapshot rows should be present');
  assert.equal(snapshot.rows.length > 0, true, 'snapshot should include surfaces');

  const invalidRows = snapshot.rows.filter((row) => (
    !row?.metrics
    || !Number.isInteger(row.metrics.colorCount)
    || !Number.isInteger(row.metrics.colorUniqueCount)
    || row.metrics.colorUniqueCount > row.metrics.colorCount
  ));

  assert.deepEqual(
    invalidRows,
    [],
    `every surface should expose colorCount + colorUniqueCount metrics: ${JSON.stringify(invalidRows.slice(0, 3))}`,
  );
});

test('panel drift matrix markdown includes unique raw color columns and signals', () => {
  const text = readText(MATRIX_PATH);

  assert.equal(
    text.includes('| Surface | Raw color refs | Unique raw colors | `sf-*` refs | Radius tokens | Drift grade |'),
    true,
    'highest-drift table should include unique raw color column',
  );
  assert.equal(
    text.includes('rawColorUnique='),
    true,
    'section drift signal should include rawColorUnique metric',
  );
});

test('panel remediation queue markdown includes unique raw color columns', () => {
  const text = readText(QUEUE_PATH);

  assert.equal(
    text.includes('| Section | High | Moderate | Low | Aligned | Raw color refs | Unique raw colors |'),
    true,
    'section heat ranking should include unique raw color totals',
  );
  assert.equal(
    text.includes('| Wave | Surfaces | High | Moderate | Low | Raw color refs | Unique raw colors |'),
    true,
    'wave summary should include unique raw color totals',
  );
  assert.equal(
    text.includes('| Rank | Surface | Section | Grade | Raw color refs | Unique raw colors | `sf-*` refs | Radius tokens | Suggested wave | Complexity |'),
    true,
    'ranked queue should include per-surface unique raw color count',
  );
});
