import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_PROPAGATION_CONTRACT = path.resolve('tools/gui-react/src/stores/settingsPropagationContract.ts');
const SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/settingsAuthority.ts');
const RUNTIME_AUTHORITY = path.resolve('tools/gui-react/src/stores/runtimeSettingsAuthority.ts');
const CONVERGENCE_AUTHORITY = path.resolve('tools/gui-react/src/stores/convergenceSettingsAuthority.ts');
const STORAGE_AUTHORITY = path.resolve('tools/gui-react/src/stores/storageSettingsAuthority.ts');
const UI_AUTHORITY = path.resolve('tools/gui-react/src/stores/uiSettingsAuthority.ts');
const LLM_AUTHORITY = path.resolve('tools/gui-react/src/stores/llmSettingsAuthority.ts');
const SOURCE_STRATEGY_AUTHORITY = path.resolve('tools/gui-react/src/stores/sourceStrategyAuthority.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('settings propagation contract defines cross-tab transport and domain contract', () => {
  assert.equal(fs.existsSync(SETTINGS_PROPAGATION_CONTRACT), true, 'settings propagation contract module should exist');
  const text = readText(SETTINGS_PROPAGATION_CONTRACT);

  assert.equal(text.includes('SETTINGS_PROPAGATION_STORAGE_KEY'), true, 'propagation contract should define a storage transport key');
  assert.equal(text.includes('SETTINGS_PROPAGATION_DOMAINS'), true, 'propagation contract should define canonical propagation domains');
  assert.equal(text.includes('publishSettingsPropagation'), true, 'propagation contract should expose publish helper');
  assert.equal(text.includes('subscribeSettingsPropagation'), true, 'propagation contract should expose subscribe helper');
  assert.equal(text.includes("window.addEventListener('storage'"), true, 'propagation contract should subscribe to cross-tab storage events');
});

test('settings authorities publish cross-tab propagation events after persistence', () => {
  const runtimeText = readText(RUNTIME_AUTHORITY);
  const convergenceText = readText(CONVERGENCE_AUTHORITY);
  const storageText = readText(STORAGE_AUTHORITY);
  const uiText = readText(UI_AUTHORITY);
  const llmText = readText(LLM_AUTHORITY);
  const sourceStrategyText = readText(SOURCE_STRATEGY_AUTHORITY);

  assert.equal(runtimeText.includes("publishSettingsPropagation({ domain: 'runtime' })"), true, 'runtime authority should publish runtime propagation events');
  assert.equal(convergenceText.includes("publishSettingsPropagation({ domain: 'convergence' })"), true, 'convergence authority should publish convergence propagation events');
  assert.equal(storageText.includes("publishSettingsPropagation({ domain: 'storage' })"), true, 'storage authority should publish storage propagation events');
  assert.equal(uiText.includes("publishSettingsPropagation({ domain: 'ui' })"), true, 'ui authority should publish ui propagation events');
  assert.equal(llmText.includes("publishSettingsPropagation({ domain: 'llm', category })"), true, 'llm authority should publish category-scoped llm propagation events');
  assert.equal(sourceStrategyText.includes("publishSettingsPropagation({ domain: 'source-strategy', category })"), true, 'source strategy authority should publish category-scoped source-strategy propagation events');
});

test('settings bootstrap subscribes to propagation events and reloads relevant authority slices', () => {
  const text = readText(SETTINGS_AUTHORITY);

  assert.equal(text.includes('subscribeSettingsPropagation'), true, 'settings bootstrap should subscribe to propagation bus');
  assert.equal(text.includes("case 'runtime'"), true, 'settings bootstrap should handle runtime propagation events');
  assert.equal(text.includes('runtimeReloadRef.current'), true, 'settings bootstrap should reload runtime on propagation event');
  assert.equal(text.includes("case 'convergence'"), true, 'settings bootstrap should handle convergence propagation events');
  assert.equal(text.includes('convergenceReloadRef.current'), true, 'settings bootstrap should reload convergence on propagation event');
  assert.equal(text.includes("case 'storage'"), true, 'settings bootstrap should handle storage propagation events');
  assert.equal(text.includes('storageReloadRef.current'), true, 'settings bootstrap should reload storage on propagation event');
  assert.equal(text.includes("case 'ui'"), true, 'settings bootstrap should handle ui propagation events');
  assert.equal(text.includes('uiReloadRef.current'), true, 'settings bootstrap should reload ui settings on propagation event');
  assert.equal(text.includes("case 'llm'"), true, 'settings bootstrap should handle llm propagation events');
  assert.equal(text.includes('queryClient.invalidateQueries({ queryKey: llmSettingsRoutesQueryKey(scopedCategory) })'), true, 'settings bootstrap should invalidate scoped llm query keys');
  assert.equal(text.includes("case 'source-strategy'"), true, 'settings bootstrap should handle source-strategy propagation events');
  assert.equal(text.includes("queryClient.invalidateQueries({ queryKey: ['source-strategy', scopedCategory] })"), true, 'settings bootstrap should invalidate scoped source-strategy query keys');
});

