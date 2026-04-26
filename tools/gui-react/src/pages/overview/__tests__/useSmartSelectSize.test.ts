import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

interface MockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

let SMART_SELECT_SIZE_KEY: string;
let SMART_SELECT_SIZE_DEFAULT: number;
let SMART_SELECT_SIZE_MIN: number;
let SMART_SELECT_SIZE_MAX: number;
let clampSmartSelectSize: (n: unknown, fallback?: number) => number;
let readSmartSelectSize: (storage: MockStorage | null | undefined) => number;
let writeSmartSelectSize: (storage: MockStorage | null | undefined, size: number) => void;

before(async () => {
  const mod = await loadBundledModule(
    'tools/gui-react/src/pages/overview/useSmartSelectSize.ts',
    {
      prefix: 'use-smart-select-size-',
      stubs: {
        react: `
          export function useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; }
          export function useCallback(fn) { return fn; }
        `,
      },
    },
  );
  ({
    SMART_SELECT_SIZE_KEY,
    SMART_SELECT_SIZE_DEFAULT,
    SMART_SELECT_SIZE_MIN,
    SMART_SELECT_SIZE_MAX,
    clampSmartSelectSize,
    readSmartSelectSize,
    writeSmartSelectSize,
  } = mod);
});

describe('clampSmartSelectSize', () => {
  it('returns the default for null / undefined / non-numeric values', () => {
    assert.equal(clampSmartSelectSize(null), 10);
    assert.equal(clampSmartSelectSize(undefined), 10);
    assert.equal(clampSmartSelectSize('not-a-number'), 10);
    assert.equal(clampSmartSelectSize(NaN), 10);
  });

  it('honors a custom fallback when provided', () => {
    assert.equal(clampSmartSelectSize(null, 25), 25);
  });

  it('clamps below min to min', () => {
    assert.equal(clampSmartSelectSize(0), SMART_SELECT_SIZE_MIN);
    assert.equal(clampSmartSelectSize(-7), SMART_SELECT_SIZE_MIN);
  });

  it('clamps above max to max', () => {
    assert.equal(clampSmartSelectSize(51), SMART_SELECT_SIZE_MAX);
    assert.equal(clampSmartSelectSize(9999), SMART_SELECT_SIZE_MAX);
  });

  it('rounds non-integers to the nearest int', () => {
    assert.equal(clampSmartSelectSize(12.4), 12);
    assert.equal(clampSmartSelectSize(12.6), 13);
  });

  it('passes through valid in-range integers unchanged', () => {
    assert.equal(clampSmartSelectSize(1), 1);
    assert.equal(clampSmartSelectSize(10), 10);
    assert.equal(clampSmartSelectSize(50), 50);
  });

  it('accepts numeric strings', () => {
    assert.equal(clampSmartSelectSize('15'), 15);
    assert.equal(clampSmartSelectSize('60'), 50);
  });
});

describe('SMART_SELECT_SIZE constants', () => {
  it('exports the canonical key + range', () => {
    assert.equal(SMART_SELECT_SIZE_KEY, 'sf:overview:smartSelectSize');
    assert.equal(SMART_SELECT_SIZE_DEFAULT, 10);
    assert.equal(SMART_SELECT_SIZE_MIN, 1);
    assert.equal(SMART_SELECT_SIZE_MAX, 50);
  });
});

function createMockStorage(initial: Record<string, string> = {}): MockStorage & { dump: () => Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    dump: () => ({ ...data }),
  };
}

describe('readSmartSelectSize', () => {
  it('returns the default when storage is null / undefined', () => {
    assert.equal(readSmartSelectSize(null), 10);
    assert.equal(readSmartSelectSize(undefined), 10);
  });

  it('returns the default when the key is missing', () => {
    const storage = createMockStorage();
    assert.equal(readSmartSelectSize(storage), 10);
  });

  it('parses and returns a valid stored value', () => {
    const storage = createMockStorage({ 'sf:overview:smartSelectSize': '25' });
    assert.equal(readSmartSelectSize(storage), 25);
  });

  it('clamps an out-of-range stored value', () => {
    const storage = createMockStorage({ 'sf:overview:smartSelectSize': '999' });
    assert.equal(readSmartSelectSize(storage), 50);
  });

  it('returns the default when the stored value is garbage', () => {
    const storage = createMockStorage({ 'sf:overview:smartSelectSize': 'banana' });
    assert.equal(readSmartSelectSize(storage), 10);
  });

  it('survives a getItem that throws', () => {
    const storage: MockStorage = {
      getItem: () => { throw new Error('quota'); },
      setItem: () => {},
    };
    assert.equal(readSmartSelectSize(storage), 10);
  });
});

describe('writeSmartSelectSize', () => {
  it('clamps the value before writing', () => {
    const storage = createMockStorage();
    writeSmartSelectSize(storage, 999);
    assert.equal(storage.dump()['sf:overview:smartSelectSize'], '50');
  });

  it('writes integers as plain decimal strings', () => {
    const storage = createMockStorage();
    writeSmartSelectSize(storage, 12);
    assert.equal(storage.dump()['sf:overview:smartSelectSize'], '12');
  });

  it('rounds non-integers before writing', () => {
    const storage = createMockStorage();
    writeSmartSelectSize(storage, 12.6);
    assert.equal(storage.dump()['sf:overview:smartSelectSize'], '13');
  });

  it('is a no-op when storage is null / undefined', () => {
    assert.doesNotThrow(() => writeSmartSelectSize(null, 20));
    assert.doesNotThrow(() => writeSmartSelectSize(undefined, 20));
  });

  it('survives a setItem that throws', () => {
    const storage: MockStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
    };
    assert.doesNotThrow(() => writeSmartSelectSize(storage, 20));
  });
});
