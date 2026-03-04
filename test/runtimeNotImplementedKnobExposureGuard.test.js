import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const FORBIDDEN_RUNTIME_SURFACE_TOKENS = Object.freeze([
  'Refresh TTL Window',
  'Per-Round Rediscovery Cap',
  'WORKERS_SEARCH',
  'WORKERS_FETCH',
  'WORKERS_PARSE',
  'WORKERS_LLM',
  'WORKER_HEALTH_CHECK_INTERVAL_MS',
  'WORKER_RESTART_BACKOFF_MS',
  '429_BLOCK_RATE_THRESHOLD',
  'MAX_BATCH_SIZE_CONFIRMATION',
  'MAX_PARALLEL_PRODUCT_WORKERS',
  'CHART_VISION_FALLBACK_ENABLED',
]);

const RUNTIME_SURFACE_FILES = Object.freeze([
  path.resolve('tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx'),
  path.resolve('tools/gui-react/src/stores/settingsManifest.ts'),
  path.resolve('src/api/services/settingsContract.js'),
  path.resolve('tools/gui-react/src/stores/runtimeSettingsDomain.ts'),
  path.resolve('src/shared/settingsDefaults.js'),
  path.resolve('src/api/routes/infraRoutes.js'),
]);

const HIERARCHY_PATH = path.resolve(
  'implementation/ai-indexing-plans/pipeline-knob-hierarchy-plan-2026-02-26.csv',
);

test('explicit not-implemented runtime knobs are not surfaced through runtime editor contract files', async () => {
  const fileContents = await Promise.all(
    RUNTIME_SURFACE_FILES.map(async (filePath) => ({
      filePath,
      content: await fs.readFile(filePath, 'utf8'),
    })),
  );

  for (const { filePath, content } of fileContents) {
    for (const forbiddenToken of FORBIDDEN_RUNTIME_SURFACE_TOKENS) {
      assert.equal(
        content.includes(forbiddenToken),
        false,
        `forbidden not-implemented knob token "${forbiddenToken}" should not appear in ${filePath}`,
      );
    }
  }
});

test('explicit not-implemented runtime knobs stay documented as not_implemented in hierarchy tracking', async () => {
  const hierarchyText = await fs.readFile(HIERARCHY_PATH, 'utf8');

  for (const knobName of FORBIDDEN_RUNTIME_SURFACE_TOKENS) {
    const csvGuardPattern = `"${knobName}","not_implemented","not_implemented"`;
    assert.equal(
      hierarchyText.includes(csvGuardPattern),
      true,
      `hierarchy should preserve ${knobName} as not_implemented`,
    );
  }
});
