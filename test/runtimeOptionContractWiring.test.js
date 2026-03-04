import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SHARED_DEFAULTS = path.resolve('src/shared/settingsDefaults.js');
const SETTINGS_MANIFEST = path.resolve('tools/gui-react/src/stores/settingsManifest.ts');
const SETTINGS_CONTRACT = path.resolve('src/api/services/settingsContract.js');
const RUNTIME_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx');
const STORAGE_PAGE = path.resolve('tools/gui-react/src/pages/storage/StoragePage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime/storage option values are centralized in shared settings option contract', () => {
  const sharedDefaultsText = readText(SHARED_DEFAULTS);
  const settingsManifestText = readText(SETTINGS_MANIFEST);
  const settingsContractText = readText(SETTINGS_CONTRACT);
  const runtimePanelText = readText(RUNTIME_PANEL);
  const storagePageText = readText(STORAGE_PAGE);

  assert.equal(
    sharedDefaultsText.includes('SETTINGS_OPTION_VALUES'),
    true,
    'shared settings defaults should define canonical option value contract',
  );
  assert.equal(
    sharedDefaultsText.includes("profile: Object.freeze(['fast', 'standard', 'thorough'])"),
    true,
    'runtime profile option values should be shared-contract owned',
  );
  assert.equal(
    sharedDefaultsText.includes("searchProvider: Object.freeze(['none', 'google', 'bing', 'searxng', 'duckduckgo', 'dual'])"),
    true,
    'runtime search-provider option values should be shared-contract owned',
  );
  assert.equal(
    sharedDefaultsText.includes("resumeMode: Object.freeze(['auto', 'force_resume', 'start_over'])"),
    true,
    'runtime resume-mode option values should be shared-contract owned',
  );
  assert.equal(
    sharedDefaultsText.includes("scannedPdfOcrBackend: Object.freeze(['auto', 'tesseract', 'none'])"),
    true,
    'runtime OCR backend option values should be shared-contract owned',
  );
  assert.equal(
    sharedDefaultsText.includes("destinationType: Object.freeze(['local', 's3'])"),
    true,
    'storage destination option values should be shared-contract owned',
  );

  assert.equal(
    settingsManifestText.includes('RUNTIME_PROFILE_OPTIONS'),
    true,
    'settings manifest should expose runtime profile options from shared option contract',
  );
  assert.equal(
    settingsManifestText.includes('RUNTIME_SEARCH_PROVIDER_OPTIONS'),
    true,
    'settings manifest should expose runtime search-provider options from shared option contract',
  );
  assert.equal(
    settingsManifestText.includes('RUNTIME_RESUME_MODE_OPTIONS'),
    true,
    'settings manifest should expose runtime resume-mode options from shared option contract',
  );
  assert.equal(
    settingsManifestText.includes('RUNTIME_OCR_BACKEND_OPTIONS'),
    true,
    'settings manifest should expose runtime OCR backend options from shared option contract',
  );
  assert.equal(
    settingsManifestText.includes('STORAGE_DESTINATION_OPTIONS'),
    true,
    'settings manifest should expose storage destination options from shared option contract',
  );

  assert.equal(
    settingsContractText.includes('allowed: SETTINGS_OPTION_VALUES.runtime.profile'),
    true,
    'runtime route enum validation should use shared profile option contract',
  );
  assert.equal(
    settingsContractText.includes('allowed: SETTINGS_OPTION_VALUES.runtime.resumeMode'),
    true,
    'runtime route enum validation should use shared resume-mode option contract',
  );
  assert.equal(
    settingsContractText.includes('allowed: SETTINGS_OPTION_VALUES.runtime.scannedPdfOcrBackend'),
    true,
    'runtime route enum validation should use shared OCR backend option contract',
  );
  assert.equal(
    settingsContractText.includes('allowed: SETTINGS_OPTION_VALUES.runtime.searchProvider'),
    true,
    'runtime route enum validation should use shared search-provider option contract',
  );

  assert.equal(
    runtimePanelText.includes('RUNTIME_PROFILE_OPTIONS.map'),
    true,
    'runtime panel should render profile options from shared manifest options',
  );
  assert.equal(
    runtimePanelText.includes('RUNTIME_SEARCH_PROVIDER_OPTIONS.map'),
    true,
    'runtime panel should render search-provider options from shared manifest options',
  );
  assert.equal(
    runtimePanelText.includes('RUNTIME_OCR_BACKEND_OPTIONS.map'),
    true,
    'runtime panel should render OCR backend options from shared manifest options',
  );
  assert.equal(
    runtimePanelText.includes('RUNTIME_RESUME_MODE_OPTIONS.map'),
    true,
    'runtime panel should render resume mode options from shared manifest options',
  );
  assert.equal(
    runtimePanelText.includes('<option value="fast">Run Profile: fast</option>'),
    false,
    'runtime panel should not hardcode runtime profile option literals',
  );
  assert.equal(
    runtimePanelText.includes('<option value="none">Search Provider: none</option>'),
    false,
    'runtime panel should not hardcode search-provider option literals',
  );
  assert.equal(
    runtimePanelText.includes('<option value="tesseract">tesseract</option>'),
    false,
    'runtime panel should not hardcode OCR backend option literals',
  );
  assert.equal(
    runtimePanelText.includes('<option value="force_resume">force resume</option>'),
    false,
    'runtime panel should not hardcode resume-mode option literals',
  );

  assert.equal(
    storagePageText.includes('STORAGE_DESTINATION_OPTIONS'),
    true,
    'storage page should use shared storage destination option contract',
  );
  assert.equal(
    storagePageText.includes("const DESTINATION_KEYS = ['local', 's3']"),
    false,
    'storage page should not hardcode storage destination option literals',
  );
});
