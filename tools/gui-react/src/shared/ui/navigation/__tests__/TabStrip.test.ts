import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

/*
 * TabStrip is a React component — full DOM testing would require jsdom/vitest.
 * Per project conventions (node --test, no Jest/Vitest), we test the logic layer:
 * the class-string builder and label formatter that TabStrip uses.
 */

let buildTabItemClass: (active: boolean) => string;
let formatTabLabel: (label: string, count?: number) => string;

before(async () => {
  const mod = await loadBundledModule(
    'tools/gui-react/src/shared/ui/navigation/TabStrip.tsx',
    {
      prefix: 'tab-strip-',
      stubs: {
        'react/jsx-runtime': `
          export function jsx(type, props) {
            return { type, props: props || {} };
          }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
      },
    },
  );
  ({ buildTabItemClass, formatTabLabel } = mod);
});

describe('TabStrip logic', () => {
  describe('buildTabItemClass', () => {
    it('returns sf-tab-item for inactive tab', () => {
      const cls = buildTabItemClass(false);
      assert.ok(cls.includes('sf-tab-item'));
      assert.ok(!cls.includes('sf-tab-item-active'));
    });

    it('returns sf-tab-item and sf-tab-item-active for active tab', () => {
      const cls = buildTabItemClass(true);
      assert.ok(cls.includes('sf-tab-item'));
      assert.ok(cls.includes('sf-tab-item-active'));
    });
  });

  describe('formatTabLabel', () => {
    it('returns label alone when no count', () => {
      assert.equal(formatTabLabel('Overview'), 'Overview');
    });

    it('returns label alone when count is undefined', () => {
      assert.equal(formatTabLabel('Overview', undefined), 'Overview');
    });

    it('appends count in parentheses when provided', () => {
      assert.equal(formatTabLabel('Fields', 12), 'Fields (12)');
    });

    it('appends zero count', () => {
      assert.equal(formatTabLabel('Errors', 0), 'Errors (0)');
    });
  });
});
