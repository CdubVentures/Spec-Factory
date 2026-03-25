import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeOpsRunListHarness } from './helpers/runtimeOpsRunListHarness.js';

test('runtime ops page builds active fallback label from live run identity and target storage', async () => {
  const harness = await createRuntimeOpsRunListHarness({
    prefix: 'runtime-ops-run-active-fallback-',
    activeScope: true,
    processStatusResult: {
      data: {
        running: true,
        relocating: false,
        run_id: '20260318061504-16a0b3',
        runId: '20260318061504-16a0b3',
        startedAt: '2026-03-18T06:15:04.000Z',
        category: 'mouse',
        product_id: 'mouse-razer-viper-v3-pro-white',
        productId: 'mouse-razer-viper-v3-pro-white',
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: 'White',
        storage_destination: 's3',
        storageDestination: 's3',
      },
      isLoading: false,
      isFetching: false,
    },
    runsQueryResult: {
      data: { root: '', runs: [] },
      isLoading: false,
      isFetching: false,
    },
    renderPicker() {
      return { type: 'div', props: { children: ['ready'] } };
    },
  });

  try {
    harness.renderPage();

    const pickerProps = harness.getPickerProps();
    assert.equal(pickerProps?.runs?.[0]?.picker_label, 'Mouse • Razer Viper V3 Pro White - 6a0b3');
    assert.equal(pickerProps?.runs?.[0]?.storage_origin, 's3');
    assert.equal(pickerProps?.runs?.[0]?.storage_state, 'live');
  } finally {
    harness.cleanup();
  }
});
