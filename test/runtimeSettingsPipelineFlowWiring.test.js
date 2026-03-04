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
    pipelineText.includes('<RuntimeSettingsFlowCard'),
    true,
    'pipeline settings page should render runtime flow card',
  );

  assert.equal(
    flowText.includes('useRuntimeSettingsEditorAdapter<RuntimeDraft>'),
    true,
    'runtime flow card should persist through runtime editor adapter',
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
    'Runtime Outputs',
    'Consensus and Learning',
    'Observability and Trace',
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
    flowText.includes('sf-callout-success'),
    true,
    'enabled runtime steps should render success callout state',
  );
  assert.equal(
    flowText.includes('sf-callout-neutral'),
    true,
    'disabled runtime steps should render neutral callout state',
  );
  assert.equal(
    flowText.includes('function RuntimeStepIcon('),
    true,
    'runtime flow sidebar should render explicit per-step icons',
  );
  assert.equal(
    flowText.includes('pointer-events-none select-none'),
    true,
    'disabled setting rows should be visibly non-interactive',
  );
  assert.equal(
    flowText.includes('Runtime Sections'),
    true,
    'runtime flow should render a sub-step sidebar for section-level navigation',
  );
  assert.equal(
    flowText.includes('runtime-flow-substep-'),
    true,
    'runtime flow should expose deterministic sub-step anchor ids for section buttons',
  );
  assert.equal(
    flowText.includes('activeRuntimeSubSteps.length > 1'),
    true,
    'runtime flow should only render sub-step sidebar when a step has multiple sections',
  );
});

test('runtime flow card payload includes full runtime settings key coverage', () => {
  const flowText = readText(RUNTIME_FLOW_CARD);

  const requiredKeys = [
    'profile',
    'searchProvider',
    'searxngBaseUrl',
    'bingSearchEndpoint',
    'googleCseCx',
    'duckduckgoBaseUrl',
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
    'fetchSchedulerMaxRetries',
    'fetchSchedulerFallbackWaitMs',
    'pageGotoTimeoutMs',
    'pageNetworkIdleTimeoutMs',
    'postLoadWaitMs',
    'frontierDbPath',
    'frontierEnableSqlite',
    'frontierStripTrackingParams',
    'frontierQueryCooldownSeconds',
    'frontierCooldown404Seconds',
    'frontierCooldown404RepeatSeconds',
    'frontierCooldown410Seconds',
    'frontierCooldownTimeoutSeconds',
    'frontierCooldown403BaseSeconds',
    'frontierCooldown429BaseSeconds',
    'frontierBlockedDomainThreshold',
    'frontierRepairSearchEnabled',
    'autoScrollEnabled',
    'autoScrollPasses',
    'autoScrollDelayMs',
    'graphqlReplayEnabled',
    'maxGraphqlReplays',
    'maxNetworkResponsesPerPage',
    'robotsTxtCompliant',
    'robotsTxtTimeoutMs',
    'runtimeScreencastFps',
    'runtimeScreencastQuality',
    'runtimeScreencastMaxWidth',
    'runtimeScreencastMaxHeight',
    'endpointSignalLimit',
    'endpointSuggestionLimit',
    'endpointNetworkScanLimit',
    'cseRescueRequiredIteration',
    'duckduckgoTimeoutMs',
    'runtimeTraceFetchRing',
    'runtimeTraceLlmRing',
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
    'fetchSchedulerEnabled',
    'preferHttpFetcher',
    'runtimeScreencastEnabled',
    'fetchCandidateSources',
    'manufacturerBroadDiscovery',
    'manufacturerSeedSearchUrls',
    'disableGoogleCse',
    'cseRescueOnlyMode',
    'duckduckgoEnabled',
    'runtimeTraceEnabled',
    'runtimeTraceLlmPayloads',
    'eventsJsonWrite',
    'authoritySnapshotEnabled',
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
