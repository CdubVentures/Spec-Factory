import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const DEFAULTS_PATH = 'src/shared/settingsDefaults.js';
const MANIFEST_PATH = 'tools/gui-react/src/stores/settingsManifest.ts';
const CONTRACT_PATH = 'src/api/services/settingsContract.js';
const DOMAIN_PATH = 'tools/gui-react/src/stores/runtimeSettingsDomain.ts';
const INDEXING_PAGE_PATH = 'tools/gui-react/src/pages/indexing/IndexingPage.tsx';
const RUNTIME_FLOW_PATH = 'tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx';
const INFRA_PATH = 'src/api/routes/infraRoutes.js';

const KNOBS = Object.freeze([
  { key: 'localMode', label: 'Local Mode', cfgKey: 'localMode', env: 'LOCAL_MODE', type: 'bool' },
  { key: 'dryRun', label: 'Dry Run', cfgKey: 'dryRun', env: 'DRY_RUN', type: 'bool' },
  { key: 'mirrorToS3', label: 'Mirror To S3', cfgKey: 'mirrorToS3', env: 'MIRROR_TO_S3', type: 'bool' },
  { key: 'mirrorToS3Input', label: 'Mirror To S3 Input', cfgKey: 'mirrorToS3Input', env: 'MIRROR_TO_S3_INPUT', type: 'bool' },
  { key: 'localInputRoot', label: 'Local Input Root', cfgKey: 'localInputRoot', env: 'LOCAL_INPUT_ROOT', type: 'string' },
  { key: 'localOutputRoot', label: 'Local Output Root', cfgKey: 'localOutputRoot', env: 'LOCAL_OUTPUT_ROOT', type: 'string' },
  { key: 'runtimeEventsKey', label: 'Runtime Events Key', cfgKey: 'runtimeEventsKey', env: 'RUNTIME_EVENTS_KEY', type: 'string' },
  { key: 'writeMarkdownSummary', label: 'Write Markdown Summary', cfgKey: 'writeMarkdownSummary', env: 'WRITE_MARKDOWN_SUMMARY', type: 'bool' },
  { key: 'llmEnabled', label: 'LLM Enabled', cfgKey: 'llmEnabled', env: 'LLM_ENABLED', type: 'bool' },
  { key: 'llmWriteSummary', label: 'LLM Write Summary', cfgKey: 'llmWriteSummary', env: 'LLM_WRITE_SUMMARY', type: 'bool' },
  { key: 'awsRegion', label: 'AWS Region', cfgKey: 'awsRegion', env: 'AWS_REGION', type: 'string' },
  { key: 's3Bucket', label: 'S3 Bucket', cfgKey: 's3Bucket', env: 'S3_BUCKET', type: 'string' },
  { key: 's3InputPrefix', label: 'S3 Input Prefix', cfgKey: 's3InputPrefix', env: 'S3_INPUT_PREFIX', type: 'string' },
  { key: 's3OutputPrefix', label: 'S3 Output Prefix', cfgKey: 's3OutputPrefix', env: 'S3_OUTPUT_PREFIX', type: 'string' },
  { key: 'eloSupabaseAnonKey', label: 'ELO Supabase Anon Key', cfgKey: 'eloSupabaseAnonKey', env: 'ELO_SUPABASE_ANON_KEY', type: 'string' },
  { key: 'eloSupabaseEndpoint', label: 'ELO Supabase Endpoint', cfgKey: 'eloSupabaseEndpoint', env: 'ELO_SUPABASE_ENDPOINT', type: 'string' },
  { key: 'llmProvider', label: 'LLM Provider', cfgKey: 'llmProvider', env: 'LLM_PROVIDER', type: 'string' },
  { key: 'llmBaseUrl', label: 'LLM Base URL', cfgKey: 'llmBaseUrl', env: 'LLM_BASE_URL', type: 'string' },
  { key: 'openaiApiKey', label: 'OpenAI API Key', cfgKey: 'openaiApiKey', env: 'OPENAI_API_KEY', type: 'string' },
  { key: 'anthropicApiKey', label: 'Anthropic API Key', cfgKey: 'anthropicApiKey', env: 'ANTHROPIC_API_KEY', type: 'string' },
]);

test('runtime output/local knobs are defaulted, contract-backed, and surfaced in runtime flow', async () => {
  const [defaultsText, manifestText, contractText, domainText, indexingText, runtimeFlowText, infraText] = await Promise.all([
    fs.readFile(DEFAULTS_PATH, 'utf8'),
    fs.readFile(MANIFEST_PATH, 'utf8'),
    fs.readFile(CONTRACT_PATH, 'utf8'),
    fs.readFile(DOMAIN_PATH, 'utf8'),
    fs.readFile(INDEXING_PAGE_PATH, 'utf8'),
    fs.readFile(RUNTIME_FLOW_PATH, 'utf8'),
    fs.readFile(INFRA_PATH, 'utf8'),
  ]);

  for (const knob of KNOBS) {
    assert.equal(
      new RegExp(`\\b${knob.key}:`).test(defaultsText),
      true,
      `runtime defaults should include ${knob.key}`,
    );
    assert.equal(
      new RegExp(`\\b${knob.key}:`).test(manifestText),
      true,
      `runtime manifest should include ${knob.key}`,
    );
    assert.equal(
      contractText.includes(`'${knob.key}'`),
      true,
      `runtime key registry should include ${knob.key}`,
    );
    assert.equal(
      new RegExp(`${knob.key}:\\s*'${knob.cfgKey}'`).test(contractText),
      true,
      `settings contract should map ${knob.key} -> ${knob.cfgKey}`,
    );
    assert.equal(
      domainText.includes(knob.key),
      true,
      `runtime domain serializer/hydration should include ${knob.key}`,
    );
    assert.equal(
      indexingText.includes(knob.key),
      true,
      `indexing page payload/hydration should include ${knob.key}`,
    );
    assert.equal(
      runtimeFlowText.includes(knob.label),
      true,
      `runtime flow should expose UI label ${knob.label}`,
    );
    assert.equal(
      runtimeFlowText.includes(`runtimeDraft.${knob.key}`),
      true,
      `runtime flow should bind editable control state for ${knob.key}`,
    );
    assert.equal(
      infraText.includes(`envOverrides.${knob.env}`),
      true,
      `process env bridge should set ${knob.env}`,
    );
  }
});
