import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const AVAILABILITY_GUIDANCE_PATH = path.resolve(
  'tools/gui-react/src/pages/product/AvailabilityGuidance.tsx',
);
const HELPER_LLM_STATUS_PATH = path.resolve(
  'tools/gui-react/src/pages/product/HelperLlmStatus.tsx',
);
const PIPELINE_PROGRESS_PATH = path.resolve(
  'tools/gui-react/src/pages/product/PipelineProgress.tsx',
);
const EVENT_LOG_PATH = path.resolve(
  'tools/gui-react/src/pages/runtime/EventLog.tsx',
);
const PROCESS_OUTPUT_PATH = path.resolve(
  'tools/gui-react/src/pages/runtime/ProcessOutput.tsx',
);
const QUEUE_SNAPSHOT_PATH = path.resolve(
  'tools/gui-react/src/pages/runtime/QueueSnapshot.tsx',
);

const RAW_COLOR_UTILITY_PATTERN =
  /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const SF_TOKEN_PATTERN = /\bsf-[a-z0-9-]+\b/g;

test('availability guidance panel uses semantic callout/chip primitives', () => {
  const text = fs.readFileSync(AVAILABILITY_GUIDANCE_PATH, 'utf8');

  assert.equal(
    text.includes('sf-callout sf-callout-success'),
    true,
    'all-good availability state should use semantic success callout',
  );
  assert.equal(
    text.includes('sf-surface-card'),
    true,
    'availability guidance shell should use semantic surface card primitive',
  );
  const requiredChipClasses = ['sf-chip-danger', 'sf-chip-warning-strong', 'sf-chip-warning-soft'];
  const missingChipClasses = requiredChipClasses.filter(
    (className) => !text.includes(className),
  );
  assert.deepEqual(
    missingChipClasses,
    [],
    `availability guidance severity groups should use semantic chip primitives: ${JSON.stringify(missingChipClasses)}`,
  );
});

test('availability guidance panel avoids raw utility color classes', () => {
  const text = fs.readFileSync(AVAILABILITY_GUIDANCE_PATH, 'utf8');
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount,
    0,
    `availability guidance should avoid raw utility color classes, found ${rawColorCount}`,
  );
});

test('queue snapshot action bar uses semantic form/button primitives', () => {
  const text = fs.readFileSync(QUEUE_SNAPSHOT_PATH, 'utf8');

  const requiredControlClasses = ['className="sf-select', 'className="w-12 sf-input'];
  const missingControlClasses = requiredControlClasses.filter(
    (fragment) => !text.includes(fragment),
  );
  assert.deepEqual(
    missingControlClasses,
    [],
    `queue snapshot controls should use semantic input/select primitives: ${JSON.stringify(missingControlClasses)}`,
  );

  const requiredButtonClasses = [
    'sf-primary-button',
    'sf-warning-button-solid',
    'sf-run-ai-button',
    'sf-danger-button-solid',
  ];
  const missingButtonClasses = requiredButtonClasses.filter(
    (className) => !text.includes(className),
  );
  assert.deepEqual(
    missingButtonClasses,
    [],
    `queue snapshot actions should use semantic button primitives: ${JSON.stringify(missingButtonClasses)}`,
  );
});

test('queue snapshot panel avoids raw utility color classes', () => {
  const text = fs.readFileSync(QUEUE_SNAPSHOT_PATH, 'utf8');
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount,
    0,
    `queue snapshot should avoid raw utility color classes, found ${rawColorCount}`,
  );
});

test('helper llm status panel avoids raw utility color classes', () => {
  const text = fs.readFileSync(HELPER_LLM_STATUS_PATH, 'utf8');
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount,
    0,
    `helper llm status should avoid raw utility color classes, found ${rawColorCount}`,
  );
});

test('pipeline progress panel avoids raw utility color classes', () => {
  const text = fs.readFileSync(PIPELINE_PROGRESS_PATH, 'utf8');
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount,
    0,
    `pipeline progress should avoid raw utility color classes, found ${rawColorCount}`,
  );
});

test('pipeline progress semantic token density is retained', () => {
  const text = fs.readFileSync(PIPELINE_PROGRESS_PATH, 'utf8');
  const sfCount = (text.match(SF_TOKEN_PATTERN) || []).length;
  assert.equal(
    sfCount >= 5,
    true,
    `pipeline progress should include at least 5 semantic sf-* tokens, got ${sfCount}`,
  );
});

test('event log panel avoids raw utility color classes', () => {
  const text = fs.readFileSync(EVENT_LOG_PATH, 'utf8');
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount,
    0,
    `event log should avoid raw utility color classes, found ${rawColorCount}`,
  );
});

test('event log semantic token density is retained', () => {
  const text = fs.readFileSync(EVENT_LOG_PATH, 'utf8');
  const sfCount = (text.match(SF_TOKEN_PATTERN) || []).length;
  assert.equal(
    sfCount >= 5,
    true,
    `event log should include at least 5 semantic sf-* tokens, got ${sfCount}`,
  );
});

test('process output panel avoids raw utility color classes', () => {
  const text = fs.readFileSync(PROCESS_OUTPUT_PATH, 'utf8');
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount,
    0,
    `process output should avoid raw utility color classes, found ${rawColorCount}`,
  );
});
