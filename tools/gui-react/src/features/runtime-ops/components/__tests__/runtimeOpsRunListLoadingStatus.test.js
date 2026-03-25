import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRuntimeOpsRunListHarness,
  flattenText,
} from './helpers/runtimeOpsRunListHarness.js';

test('runtime ops page shows loading status above the picker when live fallback row is present', async () => {
  const harness = await createRuntimeOpsRunListHarness({
    prefix: 'runtime-ops-run-loading-status-',
    activeScope: true,
    processStatusResult: {
      data: {
        running: true,
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
      data: undefined,
      isLoading: true,
      isFetching: true,
    },
    renderPicker(props) {
      return {
        type: 'div',
        props: {
          children: [props.runs?.[0] ? 'picker-ready' : 'picker-missing'],
        },
      };
    },
  });

  try {
    const tree = harness.renderPage();
    const text = flattenText(tree);

    assert.match(text, /Loading run history/i);
    assert.equal(harness.getPickerProps()?.runs?.length, 1);
  } finally {
    harness.cleanup();
  }
});
