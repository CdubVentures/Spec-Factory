import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const require = createRequire(import.meta.url);

function rect(overrides = {}) {
  const base = {
    top: 100,
    left: 100,
    bottom: 120,
    right: 220,
    width: 120,
    height: 20,
    x: 100,
    y: 100,
    toJSON() { return this; },
  };
  return { ...base, ...overrides };
}

async function loadPopover() {
  const reactUrl = pathToFileURL(require.resolve('react')).href;
  const jsxRuntimeUrl = pathToFileURL(require.resolve('react/jsx-runtime')).href;
  const jsxDevRuntimeUrl = pathToFileURL(require.resolve('react/jsx-dev-runtime')).href;

  return loadBundledModule(
    'tools/gui-react/src/shared/ui/overlay/Popover.tsx',
    {
      prefix: 'popover-internal-interaction-',
      stubs: {
        react: [
          `import React from ${JSON.stringify(reactUrl)};`,
          `export * from ${JSON.stringify(reactUrl)};`,
          'export default React;',
        ].join('\n'),
        'react/jsx-runtime': `export * from ${JSON.stringify(jsxRuntimeUrl)};`,
        'react/jsx-dev-runtime': `export * from ${JSON.stringify(jsxDevRuntimeUrl)};`,
      },
    },
  );
}

test('Popover does not close when an internal click causes a transient offscreen trigger measurement', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  let triggerVisible = true;
  const originalRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (this.classList?.contains('sf-popover-trigger')) {
      return triggerVisible
        ? rect()
        : rect({ top: -80, bottom: -60, height: 20, y: -80 });
    }
    if (this.classList?.contains('sf-popover-panel')) {
      return rect({ top: 128, left: 80, bottom: 248, right: 300, width: 220, height: 120, x: 80, y: 128 });
    }
    return originalRect.call(this);
  };

  try {
    const { Popover } = await loadPopover();
    const closeRequests = [];

    function Harness() {
      const [clicks, setClicks] = useState(0);
      return React.createElement(
        Popover,
        {
          open: true,
          onOpenChange: (next) => closeRequests.push(next),
          trigger: React.createElement('span', null, 'trigger'),
          triggerLabel: 'test popover',
        },
        React.createElement(
          'button',
          {
            id: 'inside-action',
            type: 'button',
            onClick: () => {
              triggerVisible = false;
              setClicks((value) => value + 1);
            },
          },
          `inside ${clicks}`,
        ),
      );
    }

    const host = dom.window.document.getElementById('root');
    assert.ok(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(Harness));
    });

    const button = dom.window.document.getElementById('inside-action');
    assert.ok(button, 'portal button must render');

    await act(async () => {
      button.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
      button.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    assert.deepEqual(
      closeRequests.filter((value) => value === false),
      [],
      'internal click must not request close even if its action shifts the trigger',
    );

    await act(async () => {
      root.unmount();
    });
  } finally {
    dom.window.HTMLElement.prototype.getBoundingClientRect = originalRect;
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.Node = previousNode;
    globalThis.HTMLElement = previousHTMLElement;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    dom.window.close();
  }
});
