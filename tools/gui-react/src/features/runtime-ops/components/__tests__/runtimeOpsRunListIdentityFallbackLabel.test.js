import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeOpsRunListHarness } from './helpers/runtimeOpsRunListHarness.js';

test('runtime ops page loading fallback row does not duplicate the category when identity is missing', async () => {
  const harness = await createRuntimeOpsRunListHarness({
    prefix: 'runtime-ops-run-loading-fallback-label-',
    activeScope: true,
    processStatusResult: {
      data: {
        running: true,
        run_id: '20260318-bff1e',
        runId: '20260318-bff1e',
        startedAt: '2026-03-18T06:15:04.000Z',
        category: 'mouse',
        product_id: '',
        productId: '',
        brand: '',
        model: '',
        variant: '',
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
          children: [props.runs?.[0]?.picker_label || 'picker'],
        },
      };
    },
  });

  try {
    harness.renderPage();

    const pickerProps = harness.getPickerProps();
    assert.equal(pickerProps?.runs?.[0]?.picker_label, 'Mouse - bff1e');
  } finally {
    harness.cleanup();
  }
});
