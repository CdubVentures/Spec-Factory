import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const LLM_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('review llm effort badge color maps to effort tiers', () => {
  const text = readText(LLM_SETTINGS_PAGE);

  assert.equal(
    text.includes("if (effortBand === '1-3') return 'sf-chip-success';"),
    true,
    'effort badge should map low effort to success tone',
  );
  assert.equal(
    text.includes("if (effortBand === '4-6') return 'sf-chip-info';"),
    true,
    'effort badge should map medium effort to info tone',
  );
  assert.equal(
    text.includes("if (effortBand === '7-8') return 'sf-chip-warning';"),
    true,
    'effort badge should map high effort to warning tone',
  );
  assert.equal(
    text.includes("return 'sf-chip-danger';"),
    true,
    'effort badge should map very high effort to danger tone',
  );
  assert.equal(
    text.includes("return 'sf-chip-accent';"),
    false,
    'effort badge should not use a single fixed accent tone for all effort levels',
  );
});
