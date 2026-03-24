import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, withWindowStub } from '../../../../../test/helpers/browserStorageHarness.js';
import { loadBundledModule } from '../../../../../test/helpers/loadBundledModule.js';

const INDEXLAB_STORAGE_KEY = 'indexlab-store';

function loadIndexlabStoreModule() {
  return loadBundledModule('tools/gui-react/src/stores/indexlabStore.ts', {
    prefix: 'indexlab-store-',
  });
}

test('indexlab picker brand/model/variant/run state persists in localStorage', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const firstModule = await withWindowStub({ localStorage, sessionStorage }, () => loadIndexlabStoreModule());
  const firstStore = firstModule.useIndexLabStore;

  firstStore.getState().setPickerBrand('Razer');
  firstStore.getState().setPickerModel('Viper V3 Pro');
  firstStore.getState().setPickerProductId('razer-viper-v3-pro');
  firstStore.getState().setPickerRunId('run-123');

  const raw = localStorage.getItem(INDEXLAB_STORAGE_KEY);
  assert.ok(typeof raw === 'string' && raw.length > 0, 'indexlab store should write persisted picker state');

  const persisted = JSON.parse(raw);
  assert.equal(persisted?.state?.pickerBrand, 'Razer');
  assert.equal(persisted?.state?.pickerModel, 'Viper V3 Pro');
  assert.equal(persisted?.state?.pickerProductId, 'razer-viper-v3-pro');
  assert.equal(persisted?.state?.pickerRunId, 'run-123');

  const secondModule = await withWindowStub({ localStorage, sessionStorage }, () => loadIndexlabStoreModule());
  const secondState = secondModule.useIndexLabStore.getState();
  assert.equal(secondState.pickerBrand, 'Razer');
  assert.equal(secondState.pickerModel, 'Viper V3 Pro');
  assert.equal(secondState.pickerProductId, 'razer-viper-v3-pro');
  assert.equal(secondState.pickerRunId, 'run-123');
});

test('indexlab picker brand change resets model and variant selection', async () => {
  const localStorage = createStorage({}, { trackCalls: false });
  const sessionStorage = createStorage({}, { trackCalls: false });

  const mod = await withWindowStub({ localStorage, sessionStorage }, () => loadIndexlabStoreModule());
  const store = mod.useIndexLabStore;

  store.getState().setPickerBrand('Logitech');
  store.getState().setPickerModel('G Pro X Superlight 2');
  store.getState().setPickerProductId('logitech-g-pro-x-superlight-2');
  store.getState().setPickerBrand('Pulsar');

  const state = store.getState();
  assert.equal(state.pickerBrand, 'Pulsar');
  assert.equal(state.pickerModel, '');
  assert.equal(state.pickerProductId, '');
});
