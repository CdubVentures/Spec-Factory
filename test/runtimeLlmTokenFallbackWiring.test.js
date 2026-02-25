import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const RUNTIME_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime llm token fallback wiring derives defaults from authority/bootstrap state without hardcoded literals', () => {
  const text = readText(INDEXING_PAGE);
  const runtimePanelText = readText(RUNTIME_PANEL);

  assert.equal(
    text.includes('const llmTokenPresetFallbackOptions = useMemo(() => {'),
    true,
    'IndexingPage should derive token preset fallback options from authority/bootstrap state',
  );
  assert.equal(
    text.includes('runtimeSettingsBootstrap.llmTokensPlan'),
    true,
    'Token fallback options should include runtime authority bootstrap token values',
  );
  assert.equal(
    text.includes('const fallbackPresets = llmTokenPresetFallbackOptions.length > 0'),
    true,
    'Token preset fallback should prefer authority-derived options when llm config presets are unavailable',
  );
  assert.equal(
    text.includes('[256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 8192]'),
    false,
    'Token preset fallback should not rely on hardcoded literal token arrays',
  );

  assert.equal(
    text.includes('const defaultFromConfig = parseRuntimeLlmTokenCap(indexingLlmConfig?.token_defaults?.plan);'),
    true,
    'Token default resolution should sanitize config default token cap through shared parser',
  );
  assert.equal(
    text.includes('const fallbackDefault = llmTokenPresetOptions[0] || runtimeSettingsBootstrap.llmTokensPlan;'),
    true,
    'Token default resolution should fallback to authority/bootstrap-derived defaults',
  );
  assert.equal(
    text.includes('const fallbackMaxOutputTokens = llmTokenPresetOptions[llmTokenPresetOptions.length - 1] || globalDefault;'),
    true,
    'Token max resolution should fallback to authority/bootstrap-derived preset ceiling',
  );
  assert.equal(
    text.includes("import { LLM_SETTING_LIMITS, RUNTIME_SETTING_DEFAULTS } from '../../stores/settingsManifest';"),
    true,
    'Runtime LLM token wiring should import shared LLM token limits from settings manifest',
  );
  assert.equal(
    text.includes('const LLM_MIN_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.min;'),
    true,
    'Runtime LLM token wiring should derive min token floor from shared limit contract',
  );
  assert.equal(
    text.includes('const LLM_MAX_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.max;'),
    true,
    'Runtime LLM token wiring should derive max token ceiling from shared limit contract',
  );
  assert.equal(
    text.includes('function parseRuntimeLlmTokenCap(value: unknown): number | null {'),
    true,
    'Runtime LLM token wiring should normalize token caps through a shared parser',
  );
  assert.equal(
    text.includes('Math.min(LLM_MAX_OUTPUT_TOKENS, parsed)'),
    true,
    'Runtime LLM token parser should clamp to shared max token ceiling',
  );
  assert.equal(
    text.includes('map((value) => parseRuntimeLlmTokenCap(value))'),
    true,
    'Runtime LLM token presets should use shared token-cap parser for sanitization',
  );
  assert.equal(
    text.includes('parseRuntimeLlmTokenCap(row.default_output_tokens) || 0'),
    true,
    'Runtime LLM token profiles should sanitize default token caps with shared parser',
  );
  assert.equal(
    text.includes('parseRuntimeLlmTokenCap(row.max_output_tokens) || 0'),
    true,
    'Runtime LLM token profiles should sanitize max token caps with shared parser',
  );
  assert.equal(
    text.includes('parseRuntimeLlmTokenCap(profile?.default_output_tokens) || globalDefault'),
    true,
    'Token default resolution should use shared token-cap parser',
  );
  assert.equal(
    text.includes('Math.max(\n    LLM_MIN_OUTPUT_TOKENS,\n    Math.min(LLM_MAX_OUTPUT_TOKENS, parsed),\n  )'),
    true,
    'Shared token-cap parser should enforce min/max bounds using shared limits',
  );
  assert.equal(
    text.includes('Math.max(LLM_MIN_OUTPUT_TOKENS, Number.isFinite(parsed) ? parsed : defaults.default_output_tokens)'),
    true,
    'Token clamp should enforce shared minimum token floor rather than hardcoded literals',
  );
  assert.equal(
    text.includes('token_defaults?.plan || 2048'),
    false,
    'Token default resolution should not fallback to hardcoded 2048 literal',
  );
  assert.equal(
    text.includes('profile?.max_output_tokens || 8192'),
    false,
    'Token max resolution should not fallback to hardcoded 8192 literal',
  );
  assert.equal(
    text.includes('Math.max(128'),
    false,
    'Runtime LLM token floor should not use hardcoded 128 literals',
  );
  assert.equal(
    runtimePanelText.includes('Number.parseInt(e.target.value, 10) || llmTokens'),
    false,
    'RuntimePanel token select handlers should not bypass shared clamp fallback with local llmTokens fallbacks',
  );
  assert.equal(
    runtimePanelText.includes('clampTokenForModel(phase2LlmModel, Number.parseInt(e.target.value, 10))'),
    true,
    'RuntimePanel planner token handler should pass parsed value directly through shared clamp contract',
  );
});
