import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const LLM_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('llm settings range handlers rely on shared clamp fallback contract without local parse fallbacks', () => {
  const text = readText(LLM_SETTINGS_PAGE);

  assert.equal(
    text.includes('const safeValue = Number.isFinite(value) ? value : min;'),
    true,
    'Shared clamp helper should own fallback behavior for non-finite slider input values',
  );
  assert.equal(
    text.includes('const parsedEffort = Number.isFinite(effort) ? effort : EFFORT_BOUNDS.min;'),
    true,
    'Effort-band derivation should use shared bounds fallback instead of hardcoded literals',
  );
  assert.equal(
    text.includes('effort || 3'),
    false,
    'Effort-band derivation should not fallback to hardcoded effort literals',
  );
  assert.equal(
    text.includes('Number.parseInt(e.target.value, 10) || EFFORT_BOUNDS.min'),
    false,
    'Effort slider should not include local parse fallback branches',
  );
  assert.equal(
    text.includes('Number.parseInt(e.target.value, 10) || MAX_TOKEN_BOUNDS.min'),
    false,
    'Max-token slider should not include local parse fallback branches',
  );
  assert.equal(
    text.includes('Number.parseInt(e.target.value, 10) || MIN_EVIDENCE_BOUNDS.min'),
    false,
    'Min-evidence slider should not include local parse fallback branches',
  );
  assert.equal(
    text.includes('effort: clampToRange(Number.parseInt(e.target.value, 10), EFFORT_BOUNDS.min, EFFORT_BOUNDS.max),'),
    true,
    'Effort slider should pass parsed values directly into shared clamp helper',
  );
  assert.equal(
    text.includes('max_tokens: clampToRange(Number.parseInt(e.target.value, 10), MAX_TOKEN_BOUNDS.min, MAX_TOKEN_BOUNDS.max),'),
    true,
    'Max-token slider should pass parsed values directly into shared clamp helper',
  );
  assert.equal(
    text.includes('presetConfig.minEvidenceRefsRequired ?? 1'),
    false,
    'Route presets should not use hardcoded min-evidence fallback literals',
  );
  assert.equal(
    text.includes('presetConfig.minEvidenceRefsRequired || 0'),
    false,
    'Route presets should not coerce min-evidence defaults through hardcoded zero fallbacks',
  );
  assert.equal(
    text.includes('row.llm_output_min_evidence_refs_required || 0'),
    false,
    'Route presets should preserve explicit zero values and use bounds-driven nullish fallback',
  );
  assert.equal(
    text.includes('presetConfig.minEvidenceRefsRequired ?? MIN_EVIDENCE_BOUNDS.min'),
    true,
    'Route presets should derive min-evidence fallback from shared settings bounds',
  );
  assert.equal(
    text.includes('row.llm_output_min_evidence_refs_required ?? MIN_EVIDENCE_BOUNDS.min'),
    true,
    'Route presets should derive row min-evidence fallback from shared settings bounds',
  );
});
