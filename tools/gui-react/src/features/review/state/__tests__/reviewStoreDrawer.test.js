import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function freshStore() {
  const mod = await loadBundledModule('tools/gui-react/src/features/review/state/reviewStore.ts', {
    prefix: 'review-store-drawer-',
  });
  const store = mod.useReviewStore;
  store.setState({
    activeCell: null,
    cellMode: 'viewing',
    editingValue: '',
    originalEditingValue: '',
    saveStatus: 'idle',
  });
  return { mod, store };
}

test('drawer contract: initial activeCell is null', async () => {
  const { store } = await freshStore();
  assert.equal(store.getState().activeCell, null);
});

test('drawer contract: drawerOpen field is NOT stored on state', async () => {
  const { store } = await freshStore();
  const state = store.getState();
  assert.equal(
    Object.prototype.hasOwnProperty.call(state, 'drawerOpen'),
    false,
    'drawerOpen must not be a stored field — it is derived from activeCell',
  );
});

test('drawer contract: useDrawerOpen selector derives from activeCell', async () => {
  const { mod, store } = await freshStore();
  assert.equal(typeof mod.selectDrawerOpen, 'function', 'selectDrawerOpen selector export required');

  assert.equal(mod.selectDrawerOpen(store.getState()), false);

  store.getState().openDrawer('p1', 'price');
  assert.equal(mod.selectDrawerOpen(store.getState()), true);

  store.getState().closeDrawer();
  assert.equal(mod.selectDrawerOpen(store.getState()), false);
});

test('openDrawer sets activeCell to provided identity', async () => {
  const { store } = await freshStore();
  store.getState().openDrawer('prod-abc', 'brand');
  assert.deepEqual(store.getState().activeCell, { productId: 'prod-abc', field: 'brand' });
});

test('closeDrawer clears activeCell to null', async () => {
  const { store } = await freshStore();
  store.getState().openDrawer('p1', 'f1');
  store.getState().closeDrawer();
  assert.equal(store.getState().activeCell, null);
});

test('closeDrawer resets cellMode to viewing', async () => {
  const { store } = await freshStore();
  store.getState().openDrawer('p1', 'f1');
  store.getState().selectCell('p1', 'f1');
  store.getState().startEditing('hello');
  assert.equal(store.getState().cellMode, 'editing');

  store.getState().closeDrawer();
  assert.equal(store.getState().cellMode, 'viewing');
});

test('closeDrawer clears editing value, original value, and saveStatus', async () => {
  const { store } = await freshStore();
  store.getState().openDrawer('p1', 'f1');
  store.getState().selectCell('p1', 'f1');
  store.getState().startEditing('draft');
  store.getState().setEditingValue('changed');
  assert.equal(store.getState().editingValue, 'changed');
  assert.equal(store.getState().saveStatus, 'unsaved');

  store.getState().closeDrawer();
  const state = store.getState();
  assert.equal(state.editingValue, '');
  assert.equal(state.originalEditingValue, '');
  assert.equal(state.saveStatus, 'idle');
});

test('selectCell keeps drawer open (activeCell set)', async () => {
  const { mod, store } = await freshStore();
  store.getState().selectCell('p1', 'field-a');
  assert.deepEqual(store.getState().activeCell, { productId: 'p1', field: 'field-a' });
  assert.equal(mod.selectDrawerOpen(store.getState()), true);
});

test('openDrawer with different identity replaces activeCell', async () => {
  const { store } = await freshStore();
  store.getState().openDrawer('p1', 'f1');
  store.getState().openDrawer('p2', 'f2');
  assert.deepEqual(store.getState().activeCell, { productId: 'p2', field: 'f2' });
});

test('closeDrawer is idempotent when already closed', async () => {
  const { mod, store } = await freshStore();
  store.getState().closeDrawer();
  store.getState().closeDrawer();
  assert.equal(store.getState().activeCell, null);
  assert.equal(mod.selectDrawerOpen(store.getState()), false);
});
