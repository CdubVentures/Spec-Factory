import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

function createJsxRuntimeStub() {
  return `
    export function jsx(type, props) {
      return { type, props: props || {} };
    }
    export const jsxs = jsx;
    export const Fragment = Symbol.for('fragment');
  `;
}

function createReactStub() {
  return `
    export function useEffect() {}
    export function useMemo(factory) {
      return factory();
    }
    export function useRef(value = null) {
      return { current: value };
    }
    export function useState(initialValue) {
      const value = typeof initialValue === 'function' ? initialValue() : initialValue;
      return [value, () => {}];
    }
  `;
}

async function loadBrowserStreamModule() {
  return loadBundledModule('tools/gui-react/src/features/runtime-ops/panels/overview/BrowserStream.tsx', {
    prefix: 'runtime-ops-browser-contracts-',
    stubs: {
      react: createReactStub(),
      'react/jsx-runtime': createJsxRuntimeStub(),
      '../../../../api/client': `
        export const api = {
          async get() {
            throw new Error('unused');
          },
        };
      `,
      '../../helpers': `
        export function formatMs(value) {
          return String(value ?? 0);
        }
      `,
    },
  });
}

async function loadWorkerLivePanelModule() {
  return loadBundledModule('tools/gui-react/src/features/runtime-ops/panels/workers/WorkerLivePanel.tsx', {
    prefix: 'runtime-ops-worker-browser-contracts-',
    stubs: {
      react: createReactStub(),
      'react/jsx-runtime': createJsxRuntimeStub(),
      '../overview/BrowserStream': `
        export function BrowserStream() {
          return null;
        }
      `,
      '../../components/RuntimeIdxBadgeStrip': `
        export function RuntimeIdxBadgeStrip() {
          return null;
        }
      `,
      '../../helpers': `
        export const STAGE_ORDER = ['queued', 'fetch', 'parse'];
        export function workerStateBadgeClass() {
          return 'state';
        }
        export function poolBadgeClass() {
          return 'pool';
        }
        export function fetchModeBadgeClass() {
          return 'fetch-mode';
        }
        export function stageBadgeClass() {
          return 'stage';
        }
        export function stageMeterFillClass() {
          return 'meter';
        }
        export function stageLabel(value) {
          return String(value || '');
        }
      `,
    },
  });
}

test('BrowserStream copy stays generic and covers both browser-backed and non-browser worker gaps', async () => {
  const {
    browserStreamUnavailableDetail,
    describeBrowserStreamGap,
    shouldHydrateRetainedBrowserFrame,
  } = await loadBrowserStreamModule();

  assert.equal(
    browserStreamUnavailableDetail(),
    'The live browser view requires an active browser-backed fetch worker. Start an IndexLab run to see the browser stream.',
  );
  assert.equal(browserStreamUnavailableDetail().includes('Playwright'), false);

  assert.deepEqual(
    describeBrowserStreamGap({
      workerPool: 'fetch',
      fetchMode: 'crawlee',
      lastError: 'navigation timeout',
    }),
    {
      title: 'No stream image was captured for this browser-backed fetch worker.',
      detail: 'The fetch ended without a retained frame. Last error: navigation timeout',
    },
  );

  assert.deepEqual(
    describeBrowserStreamGap({
      workerPool: 'llm',
      fetchMode: null,
      lastError: null,
    }),
    {
      title: 'No browser image is expected for this worker pool.',
      detail: 'Search and LLM workers do not produce browser screenshots.',
    },
  );

  assert.equal(shouldHydrateRetainedBrowserFrame('ended'), true);
  assert.equal(shouldHydrateRetainedBrowserFrame('failed'), true);
  assert.equal(shouldHydrateRetainedBrowserFrame('running'), false);
  assert.equal(shouldHydrateRetainedBrowserFrame('stuck'), false);
  assert.equal(shouldHydrateRetainedBrowserFrame(undefined), false);
});

test('WorkerLivePanel derives BrowserStream props from the selected worker row', async () => {
  const { buildBrowserStreamProps } = await loadWorkerLivePanelModule();

  const worker = {
    worker_id: 'fetch-5',
    pool: 'fetch',
    state: 'stuck',
    fetch_mode: 'crawlee',
    last_error: 'captured timeout',
  };

  assert.deepEqual(
    buildBrowserStreamProps(worker, 'run-5', 'ws://runtime.test'),
    {
      runId: 'run-5',
      workerId: 'fetch-5',
      workerState: 'stuck',
      workerPool: 'fetch',
      fetchMode: 'crawlee',
      lastError: 'captured timeout',
      wsUrl: 'ws://runtime.test',
    },
  );
});
