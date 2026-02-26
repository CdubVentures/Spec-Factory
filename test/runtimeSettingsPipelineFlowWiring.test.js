import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');
const RUNTIME_FLOW_CARD = path.resolve('tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('pipeline settings renders runtime flow card as the phase-3 runtime settings surface', () => {
  const pipelineText = readText(PIPELINE_SETTINGS_PAGE);
  const flowText = readText(RUNTIME_FLOW_CARD);

  assert.equal(
    pipelineText.includes("import { RuntimeSettingsFlowCard } from './RuntimeSettingsFlowCard';"),
    true,
    'pipeline settings page should import runtime flow card',
  );
  assert.equal(
    pipelineText.includes('<RuntimeSettingsFlowCard />'),
    true,
    'pipeline settings page should render runtime flow card',
  );

  assert.equal(
    flowText.includes('useRuntimeSettingsAuthority({'),
    true,
    'runtime flow card should persist via runtime settings authority',
  );
  assert.equal(
    flowText.includes('readRuntimeSettingsBootstrap('),
    true,
    'runtime flow card should bootstrap from shared runtime snapshot helper',
  );
  assert.equal(
    flowText.includes('usePersistedTab<RuntimeStepId>('),
    true,
    'runtime flow card should persist active runtime step in session tab store',
  );
  assert.equal(
    flowText.includes('setRuntimeAutoSaveEnabled'),
    true,
    'runtime flow card should wire runtime autosave toggle through ui store',
  );
  assert.equal(
    flowText.includes('window.confirm('),
    true,
    'runtime flow card should gate reset defaults behind explicit confirmation prompt',
  );
});

test('runtime flow card keeps runtime step order and enabled-dot semantics', () => {
  const flowText = readText(RUNTIME_FLOW_CARD);

  const orderedLabels = [
    'Run Setup',
    'Fetch and Render',
    'OCR',
    'Planner and Triage',
    'Role Routing',
    'Fallback Routing',
  ];
  let previousIndex = -1;
  for (const label of orderedLabels) {
    const nextIndex = flowText.indexOf(`label: '${label}'`);
    assert.ok(nextIndex > previousIndex, `step label order should follow pipeline execution: ${label}`);
    previousIndex = nextIndex;
  }

  assert.equal(
    flowText.includes('bg-emerald-500'),
    true,
    'enabled runtime steps should render green dot state',
  );
  assert.equal(
    flowText.includes('bg-gray-400'),
    true,
    'disabled runtime steps should render gray dot state',
  );
});

test('runtime flow card payload includes full runtime settings key coverage', () => {
  const flowText = readText(RUNTIME_FLOW_CARD);

  const requiredKeys = [
    'profile',
    'searchProvider',
    'phase2LlmModel',
    'phase3LlmModel',
    'llmModelFast',
    'llmModelReasoning',
    'llmModelExtract',
    'llmModelValidate',
    'llmModelWrite',
    'llmFallbackPlanModel',
    'llmFallbackExtractModel',
    'llmFallbackValidateModel',
    'llmFallbackWriteModel',
    'resumeMode',
    'scannedPdfOcrBackend',
    'fetchConcurrency',
    'perHostMinDelayMs',
    'llmTokensPlan',
    'llmTokensTriage',
    'llmTokensFast',
    'llmTokensReasoning',
    'llmTokensExtract',
    'llmTokensValidate',
    'llmTokensWrite',
    'llmTokensPlanFallback',
    'llmTokensExtractFallback',
    'llmTokensValidateFallback',
    'llmTokensWriteFallback',
    'resumeWindowHours',
    'reextractAfterHours',
    'scannedPdfOcrMaxPages',
    'scannedPdfOcrMaxPairs',
    'scannedPdfOcrMinCharsPerPage',
    'scannedPdfOcrMinLinesPerPage',
    'scannedPdfOcrMinConfidence',
    'crawleeRequestHandlerTimeoutSecs',
    'dynamicFetchRetryBudget',
    'dynamicFetchRetryBackoffMs',
    'dynamicFetchPolicyMapJson',
    'scannedPdfOcrEnabled',
    'scannedPdfOcrPromoteCandidates',
    'phase2LlmEnabled',
    'phase3LlmTriageEnabled',
    'llmFallbackEnabled',
    'reextractIndexed',
    'discoveryEnabled',
    'dynamicCrawleeEnabled',
    'crawleeHeadless',
  ];

  for (const key of requiredKeys) {
    assert.equal(
      flowText.includes(`${key}:`),
      true,
      `runtime flow payload should include key: ${key}`,
    );
  }

  assert.equal(
    flowText.includes('function settingLabel(label: string, tip: string)'),
    true,
    'runtime flow should centralize tooltip rendering through settingLabel helper',
  );
  const settingRowCount = (flowText.match(/<SettingRow label=/g) || []).length;
  assert.ok(settingRowCount >= 25, `runtime flow should define broad setting-row coverage (found ${settingRowCount})`);
});
