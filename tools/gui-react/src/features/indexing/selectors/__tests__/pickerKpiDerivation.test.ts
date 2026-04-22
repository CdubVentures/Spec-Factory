import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { derivePickerKpis, formatRelativeTime } from '../pickerKpiDerivation.ts';
import type { CatalogRow } from '../../../../types/product.ts';

function makeRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    productId: 'razer-viper-v2-pro-white',
    id: 1,
    identifier: 'rvv2pw',
    brand: 'Razer',
    model: 'Viper V2 Pro',
    base_model: 'Viper V2 Pro',
    variant: 'White',
    status: 'active',
    hasFinal: true,
    validated: true,
    confidence: 0.87,
    coverage: 0.73,
    fieldsFilled: 38,
    fieldsTotal: 52,
    lastRun: '2026-04-21T10:00:00Z',
    inActive: false,
    ...overrides,
  };
}

describe('derivePickerKpis', () => {
  it('returns empty array when row is null', () => {
    deepStrictEqual(derivePickerKpis(null), []);
  });

  it('returns four tiles in fixed order', () => {
    const tiles = derivePickerKpis(makeRow());
    strictEqual(tiles.length, 4);
    deepStrictEqual(tiles.map((t) => t.key), ['confidence', 'coverage', 'fields', 'lastRun']);
  });

  it('confidence tile reflects passing value', () => {
    const tiles = derivePickerKpis(makeRow({ confidence: 0.87 }));
    const tile = tiles.find((t) => t.key === 'confidence')!;
    strictEqual(tile.value, '0.87');
    strictEqual(tile.barTone, 'good');
    strictEqual(tile.barPct, 87);
  });

  it('confidence tile flags warn tier at 0.60-0.79', () => {
    const tiles = derivePickerKpis(makeRow({ confidence: 0.65 }));
    strictEqual(tiles.find((t) => t.key === 'confidence')!.barTone, 'warn');
  });

  it('confidence tile flags weak tier below 0.60', () => {
    const tiles = derivePickerKpis(makeRow({ confidence: 0.3 }));
    strictEqual(tiles.find((t) => t.key === 'confidence')!.barTone, 'weak');
  });

  it('coverage tile renders percentage with unit', () => {
    const tiles = derivePickerKpis(makeRow({ coverage: 0.73 }));
    const tile = tiles.find((t) => t.key === 'coverage')!;
    strictEqual(tile.value, '73');
    strictEqual(tile.unit, '%');
    strictEqual(tile.barPct, 73);
  });

  it('fields tile exposes filled / total and empty count', () => {
    const tiles = derivePickerKpis(makeRow({ fieldsFilled: 38, fieldsTotal: 52 }));
    const tile = tiles.find((t) => t.key === 'fields')!;
    strictEqual(tile.value, '38');
    strictEqual(tile.unit, '/ 52');
    strictEqual(tile.sub, '14 empty');
  });

  it('fields tile copes with zero total', () => {
    const tiles = derivePickerKpis(makeRow({ fieldsFilled: 0, fieldsTotal: 0 }));
    const tile = tiles.find((t) => t.key === 'fields')!;
    strictEqual(tile.unit, undefined);
    strictEqual(tile.barPct, 0);
    strictEqual(tile.barTone, 'neutral');
  });

  it('lastRun tile shows date prefix when present', () => {
    const nowMs = Date.parse('2026-04-21T12:00:00Z');
    const tiles = derivePickerKpis(makeRow({ lastRun: '2026-04-21T10:00:00Z' }), nowMs);
    const tile = tiles.find((t) => t.key === 'lastRun')!;
    strictEqual(tile.value, '2026-04-21');
    strictEqual(tile.sub, '2h ago');
  });

  it('lastRun tile shows "never" when missing', () => {
    const tiles = derivePickerKpis(makeRow({ lastRun: '' }));
    const tile = tiles.find((t) => t.key === 'lastRun')!;
    strictEqual(tile.value, 'never');
    strictEqual(tile.sub, 'never run');
  });

  it('clamps bar percentages to [0, 100]', () => {
    const tiles = derivePickerKpis(makeRow({ confidence: 1.5, coverage: -0.2 }));
    strictEqual(tiles.find((t) => t.key === 'confidence')!.barPct, 100);
    strictEqual(tiles.find((t) => t.key === 'coverage')!.barPct, 0);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-04-21T12:00:00Z');

  it('returns "never run" on empty or invalid input', () => {
    strictEqual(formatRelativeTime('', now), 'never run');
    strictEqual(formatRelativeTime('not-a-date', now), 'never run');
  });

  it('returns "just now" for < 1 minute', () => {
    strictEqual(formatRelativeTime('2026-04-21T11:59:30Z', now), 'just now');
  });

  it('returns minutes for < 1 hour', () => {
    strictEqual(formatRelativeTime('2026-04-21T11:45:00Z', now), '15m ago');
  });

  it('returns hours for < 1 day', () => {
    strictEqual(formatRelativeTime('2026-04-21T10:00:00Z', now), '2h ago');
  });

  it('returns days for >= 1 day', () => {
    strictEqual(formatRelativeTime('2026-04-18T12:00:00Z', now), '3d ago');
  });
});
