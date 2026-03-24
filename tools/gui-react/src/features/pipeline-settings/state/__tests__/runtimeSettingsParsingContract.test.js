import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../test/helpers/loadBundledModule.js';

async function loadRuntimeSettingsDomain() {
  return loadBundledModule(
    'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsDomain.ts',
    { prefix: 'runtime-settings-parsing-contract-' },
  );
}

test('runtime parsing helpers preserve current fallback and trimming semantics', async () => {
  const {
    parseRuntimeInt,
    parseRuntimeFloat,
    parseRuntimeString,
  } = await loadRuntimeSettingsDomain();

  assert.equal(parseRuntimeInt('42', 7), 42);
  assert.equal(parseRuntimeInt('bad', 7), 7);

  assert.equal(parseRuntimeFloat('4.25', 7.5), 4.25);
  assert.equal(parseRuntimeFloat('bad', 7.5), 7.5);

  assert.equal(parseRuntimeString('  value  ', 'fallback'), 'value');
  assert.equal(parseRuntimeString('   ', 'fallback'), 'fallback');
});

test('runtime token helpers preserve clamp and default semantics', async () => {
  const {
    clampTokenForModel,
    parseRuntimeLlmTokenCap,
  } = await loadRuntimeSettingsDomain();

  assert.equal(parseRuntimeLlmTokenCap('0'), null);
  assert.equal(parseRuntimeLlmTokenCap('bad'), null);
  assert.equal(parseRuntimeLlmTokenCap('128'), 256);
  assert.equal(parseRuntimeLlmTokenCap('70000'), 65536);

  const resolveModelTokenDefaults = () => ({
    default_output_tokens: 4096,
    max_output_tokens: 8192,
  });

  assert.equal(clampTokenForModel('gpt-test', '128', resolveModelTokenDefaults), 256);
  assert.equal(clampTokenForModel('gpt-test', 'bad', resolveModelTokenDefaults), 4096);
  assert.equal(clampTokenForModel('gpt-test', '9000', resolveModelTokenDefaults), 8192);
});
