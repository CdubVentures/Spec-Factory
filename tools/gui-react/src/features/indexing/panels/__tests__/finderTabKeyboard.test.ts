import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { nextTabId } from '../finderTabKeyboard.ts';

const IDS = ['cef', 'pif', 'rdf', 'sku'] as const;

describe('nextTabId', () => {
  it('right from middle advances one', () => {
    strictEqual(nextTabId('pif', 'right', IDS), 'rdf');
  });

  it('right from last wraps to first', () => {
    strictEqual(nextTabId('sku', 'right', IDS), 'cef');
  });

  it('left from middle retreats one', () => {
    strictEqual(nextTabId('pif', 'left', IDS), 'cef');
  });

  it('left from first wraps to last', () => {
    strictEqual(nextTabId('cef', 'left', IDS), 'sku');
  });

  it('home jumps to first', () => {
    strictEqual(nextTabId('rdf', 'home', IDS), 'cef');
  });

  it('end jumps to last', () => {
    strictEqual(nextTabId('cef', 'end', IDS), 'sku');
  });

  it('falls back to first when current id is not in list', () => {
    strictEqual(nextTabId('unknown' as 'cef', 'right', IDS), 'cef');
  });

  it('returns current when ids list is empty', () => {
    strictEqual(nextTabId('cef', 'right', [] as readonly 'cef'[]), 'cef');
  });
});
