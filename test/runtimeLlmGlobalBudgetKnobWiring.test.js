import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const DEFAULTS_PATH = 'src/shared/settingsDefaults.js';
const MANIFEST_PATH = 'tools/gui-react/src/stores/settingsManifest.ts';
const CONTRACT_PATH = 'src/api/services/settingsContract.js';
const AUTHORITY_PATH = 'tools/gui-react/src/stores/runtimeSettingsAuthority.ts';
const DOMAIN_PATH = 'tools/gui-react/src/stores/runtimeSettingsDomain.ts';
const INDEXING_PAGE_PATH = 'tools/gui-react/src/pages/indexing/IndexingPage.tsx';
const RUNTIME_FLOW_PATH = 'tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx';
const INFRA_PATH = 'src/api/routes/infraRoutes.js';

const KNOBS = Object.freeze([
  {
    key: 'llmMaxCallsPerRound',
    label: 'LLM Max Calls / Round',
    env: 'LLM_MAX_CALLS_PER_ROUND',
  },
  {
    key: 'llmMaxOutputTokens',
    label: 'LLM Max Output Tokens',
    env: 'LLM_MAX_OUTPUT_TOKENS',
  },
  {
    key: 'llmVerifySampleRate',
    label: 'LLM Verify Sample Rate',
    env: 'LLM_VERIFY_SAMPLE_RATE',
  },
]);

test('global LLM budget knobs are defaulted, contract-backed, runtime-serialized, and env-wired', async () => {
  const [
    defaultsText,
    manifestText,
    contractText,
    authorityText,
    domainText,
    indexingText,
    runtimeFlowText,
    infraText,
  ] = await Promise.all([
    fs.readFile(DEFAULTS_PATH, 'utf8'),
    fs.readFile(MANIFEST_PATH, 'utf8'),
    fs.readFile(CONTRACT_PATH, 'utf8'),
    fs.readFile(AUTHORITY_PATH, 'utf8'),
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
      new RegExp(`${knob.key}:\\s*'${knob.key}'`).test(contractText),
      true,
      `runtime GET contract map should include ${knob.key}`,
    );
    assert.equal(
      new RegExp(`${knob.key}:\\s*Object\\.freeze\\(`).test(contractText),
      true,
      `runtime PUT integer bounds should include ${knob.key}`,
    );
    assert.equal(
      authorityText.includes(knob.key),
      true,
      `runtime authority baseline should include ${knob.key}`,
    );
    assert.equal(
      domainText.includes(knob.key),
      true,
      `runtime serializer/hydration should include ${knob.key}`,
    );
    assert.equal(
      indexingText.includes(knob.key),
      true,
      `indexing payload bridge should include ${knob.key}`,
    );
    assert.equal(
      runtimeFlowText.includes(`label="${knob.label}"`),
      true,
      `runtime flow should expose ${knob.label}`,
    );
    assert.equal(
      runtimeFlowText.includes(`runtimeDraft.${knob.key}`),
      true,
      `runtime flow state binding should include ${knob.key}`,
    );
    assert.equal(
      infraText.includes(`envOverrides.${knob.env}`),
      true,
      `process env bridge should set ${knob.env}`,
    );
  }
});
