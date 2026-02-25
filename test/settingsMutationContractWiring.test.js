import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_MUTATION_CONTRACT = path.resolve('tools/gui-react/src/stores/settingsMutationContract.ts');
const RUNTIME_AUTHORITY = path.resolve('tools/gui-react/src/stores/runtimeSettingsAuthority.ts');
const CONVERGENCE_AUTHORITY = path.resolve('tools/gui-react/src/stores/convergenceSettingsAuthority.ts');
const STORAGE_AUTHORITY = path.resolve('tools/gui-react/src/stores/storageSettingsAuthority.ts');
const UI_AUTHORITY = path.resolve('tools/gui-react/src/stores/uiSettingsAuthority.ts');
const LLM_AUTHORITY = path.resolve('tools/gui-react/src/stores/llmSettingsAuthority.ts');
const SOURCE_STRATEGY_AUTHORITY = path.resolve('tools/gui-react/src/stores/sourceStrategyAuthority.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('shared settings mutation contract defines optimistic update + rollback semantics', () => {
  assert.equal(fs.existsSync(SETTINGS_MUTATION_CONTRACT), true, 'settings mutation contract module should exist');
  const text = readText(SETTINGS_MUTATION_CONTRACT);

  assert.equal(text.includes('createSettingsOptimisticMutationContract'), true, 'contract should expose a shared optimistic mutation helper');
  assert.equal(text.includes('queryClient.cancelQueries({ queryKey })'), true, 'contract should cancel in-flight queries before optimistic writes');
  assert.equal(text.includes('onMutate: async'), true, 'contract should define optimistic update behavior in onMutate');
  assert.equal(text.includes('rollbackQueryData'), true, 'contract should define shared rollback behavior');
  assert.equal(text.includes('queryClient.removeQueries({ queryKey, exact: true })'), true, 'contract should remove optimistic-only cache entries on rollback when needed');
});

test('settings authority writers consume shared optimistic mutation contract', () => {
  const runtimeText = readText(RUNTIME_AUTHORITY);
  const convergenceText = readText(CONVERGENCE_AUTHORITY);
  const storageText = readText(STORAGE_AUTHORITY);
  const uiText = readText(UI_AUTHORITY);
  const llmText = readText(LLM_AUTHORITY);
  const sourceStrategyText = readText(SOURCE_STRATEGY_AUTHORITY);

  assert.equal(runtimeText.includes('createSettingsOptimisticMutationContract'), true, 'runtime settings authority should use shared mutation contract');
  assert.equal(convergenceText.includes('createSettingsOptimisticMutationContract'), true, 'convergence settings authority should use shared mutation contract');
  assert.equal(storageText.includes('createSettingsOptimisticMutationContract'), true, 'storage settings authority should use shared mutation contract');
  assert.equal(uiText.includes('createSettingsOptimisticMutationContract'), true, 'ui settings authority should use shared mutation contract');
  assert.equal(llmText.includes('createSettingsOptimisticMutationContract'), true, 'llm settings authority should use shared mutation contract');
  assert.equal(sourceStrategyText.includes('createSettingsOptimisticMutationContract'), true, 'source strategy authority should use shared mutation contract');
});

