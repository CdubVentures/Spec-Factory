import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const RUNTIME_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx');
const RUNTIME_SETTINGS_DOMAIN = path.resolve('tools/gui-react/src/stores/runtimeSettingsDomain.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime llm token fallback wiring derives defaults from authority/bootstrap state without hardcoded literals', () => {
  const text = readText(INDEXING_PAGE);
  const runtimePanelText = readText(RUNTIME_PANEL);
  const runtimeDomainText = readText(RUNTIME_SETTINGS_DOMAIN);

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
  assert.match(
    text,
    /import\s*\{[\s\S]*LLM_SETTING_LIMITS[\s\S]*RUNTIME_SETTING_DEFAULTS[\s\S]*\}\s*from\s*'..\/..\/stores\/settingsManifest';/,
    'Runtime LLM token wiring should import shared LLM token limits from settings manifest',
  );
  assert.equal(
    text.includes('const LLM_MIN_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.min;'),
    true,
    'Runtime LLM token wiring should derive min token floor from shared limit contract',
  );
  assert.equal(
    runtimeDomainText.includes('const LLM_MAX_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.max;'),
    true,
    'Shared runtime domain should derive max token ceiling from shared limit contract',
  );
  assert.equal(
    runtimeDomainText.includes('export function parseRuntimeLlmTokenCap(value: unknown): number | null {'),
    true,
    'Shared runtime domain should normalize token caps through a shared parser',
  );
  assert.equal(
    runtimeDomainText.includes('Math.min(LLM_MAX_OUTPUT_TOKENS, parsed)'),
    true,
    'Shared runtime domain token parser should clamp to shared max token ceiling',
  );
  assert.equal(
    text.includes('function parseRuntimeLlmTokenCap(value: unknown): number | null {'),
    false,
    'IndexingPage should consume token-cap parsing from shared runtime domain instead of local parser copies',
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
    /Math\.max\(\s*LLM_MIN_OUTPUT_TOKENS,\s*Math\.min\(LLM_MAX_OUTPUT_TOKENS,\s*parsed\),\s*\)/s.test(runtimeDomainText),
    true,
    'Shared runtime domain token parser should enforce min/max bounds using shared limits',
  );
  assert.equal(
    /Math\.max\(\s*LLM_MIN_OUTPUT_TOKENS,\s*Number\.isFinite\(parsed\)\s*\?\s*parsed\s*:\s*defaults\.default_output_tokens,\s*\)/s.test(runtimeDomainText),
    true,
    'Shared runtime domain token clamp should enforce shared minimum token floor rather than hardcoded literals',
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
