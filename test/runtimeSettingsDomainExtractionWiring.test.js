import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const RUNTIME_FLOW_CARD = path.resolve('tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx');
const RUNTIME_DOMAIN = path.resolve('tools/gui-react/src/stores/runtimeSettingsDomain.ts');
const RUNTIME_EDITOR_ADAPTER = path.resolve('tools/gui-react/src/stores/runtimeSettingsEditorAdapter.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime domain extraction wiring moves runtime hydration/serialization internals out of IndexingPage', () => {
  const indexingPageText = readText(INDEXING_PAGE);
  const runtimeDomainText = readText(RUNTIME_DOMAIN);

  assert.equal(fs.existsSync(RUNTIME_DOMAIN), true, 'runtime settings domain module should exist');
  assert.equal(
    runtimeDomainText.includes('export function createRuntimeHydrationBindings'),
    true,
    'runtime domain module should own hydration binding creation',
  );
  assert.equal(
    runtimeDomainText.includes('export function hydrateRuntimeSettingsFromBindings'),
    true,
    'runtime domain module should own runtime hydration apply logic',
  );
  assert.equal(
    runtimeDomainText.includes('export function collectRuntimeSettingsPayload'),
    true,
    'runtime domain module should own runtime payload serialization',
  );
  assert.equal(
    runtimeDomainText.includes('export function parseRuntimeInt'),
    true,
    'runtime domain module should own runtime integer parsing helper',
  );
  assert.equal(
    runtimeDomainText.includes('export function parseRuntimeFloat'),
    true,
    'runtime domain module should own runtime float parsing helper',
  );

  assert.equal(
    indexingPageText.includes("from '../../stores/runtimeSettingsDomain'"),
    true,
    'IndexingPage should consume extracted runtime domain helpers',
  );
  assert.equal(
    indexingPageText.includes('createRuntimeHydrationBindings({'),
    true,
    'IndexingPage should build runtime hydration bindings through shared helper',
  );
  assert.equal(
    indexingPageText.includes('hydrateRuntimeSettingsFromBindings('),
    true,
    'IndexingPage should hydrate runtime state through shared helper',
  );
  assert.equal(
    indexingPageText.includes('collectRuntimeSettingsPayloadFromDomain({'),
    true,
    'IndexingPage should serialize runtime payload through shared helper',
  );
  assert.equal(
    indexingPageText.includes('const runtimeStringHydrationBindings = useMemo(() => (['),
    false,
    'IndexingPage should not keep page-local string hydration table after extraction',
  );
  assert.equal(
    indexingPageText.includes('const parseRuntimeInt = (value: string, fallback: number) => {'),
    false,
    'IndexingPage should not keep page-local integer parsing helper after extraction',
  );
});

test('runtime flow card wiring consumes runtime editor adapter', () => {
  const flowCardText = readText(RUNTIME_FLOW_CARD);
  const adapterText = readText(RUNTIME_EDITOR_ADAPTER);

  assert.equal(fs.existsSync(RUNTIME_EDITOR_ADAPTER), true, 'runtime editor adapter module should exist');
  assert.equal(
    adapterText.includes('export function useRuntimeSettingsEditorAdapter'),
    true,
    'runtime editor adapter hook should be exported',
  );
  assert.equal(
    flowCardText.includes('useRuntimeSettingsEditorAdapter<RuntimeDraft>'),
    true,
    'runtime flow card should use runtime editor adapter hook',
  );
});
