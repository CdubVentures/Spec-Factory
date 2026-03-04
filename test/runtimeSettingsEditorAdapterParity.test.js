import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RUNTIME_EDITOR_ADAPTER = path.resolve('tools/gui-react/src/stores/runtimeSettingsEditorAdapter.ts');
const RUNTIME_FLOW_CARD = path.resolve('tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime settings editor adapter exposes parity contract and owns authority mutation path', () => {
  const adapterText = readText(RUNTIME_EDITOR_ADAPTER);

  assert.equal(
    adapterText.includes('useRuntimeSettingsAuthority({'),
    true,
    'runtime settings editor adapter should persist through runtime settings authority',
  );
  assert.equal(
    adapterText.includes('values: TValues'),
    true,
    'runtime settings editor adapter should expose values contract',
  );
  assert.equal(
    adapterText.includes('dirty: boolean'),
    true,
    'runtime settings editor adapter should expose dirty contract',
  );
  assert.equal(
    adapterText.includes('saveStatus: RuntimeEditorSaveStatus'),
    true,
    'runtime settings editor adapter should expose save-status contract',
  );
  assert.equal(
    adapterText.includes('isSaving: boolean'),
    true,
    'runtime settings editor adapter should expose isSaving contract',
  );
  assert.equal(
    adapterText.includes('hydrateFromSnapshot: (snapshot: RuntimeSettings | undefined) => void'),
    true,
    'runtime settings editor adapter should expose hydrateFromSnapshot contract',
  );
  assert.equal(
    adapterText.includes('updateKey: <K extends keyof TValues>(key: K, value: TValues[K]) => void'),
    true,
    'runtime settings editor adapter should expose typed updateKey contract',
  );
  assert.equal(
    adapterText.includes('saveNow: () => void'),
    true,
    'runtime settings editor adapter should expose saveNow contract',
  );
});

test('runtime flow card consumes runtime settings editor adapter contract', () => {
  const flowCardText = readText(RUNTIME_FLOW_CARD);

  assert.equal(
    flowCardText.includes('useRuntimeSettingsEditorAdapter<RuntimeDraft>'),
    true,
    'runtime flow card should wire runtime editor adapter',
  );
  assert.equal(
    flowCardText.includes('runtimeEditor.saveStatus.kind'),
    true,
    'runtime flow card should consume adapter save status',
  );
  assert.equal(
    flowCardText.includes('runtimeEditor.saveNow'),
    true,
    'runtime flow card should consume adapter saveNow action',
  );
});
