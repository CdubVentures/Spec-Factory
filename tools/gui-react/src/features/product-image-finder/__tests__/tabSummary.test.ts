import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { derivePifTabSummary } from '../tabSummary.ts';

function cef(variantCount: number) {
  return {
    product_id: 'p',
    category: 'mouse',
    run_count: 0,
    last_ran_at: '',
    published: { colors: [], editions: [], default_color: '' },
    variant_registry: Array.from({ length: variantCount }, (_, i) => ({
      variant_id: `v${i}`,
      variant_key: `color:v${i}`,
      variant_type: 'color' as const,
      variant_label: `v${i}`,
      color_atoms: [`v${i}`],
      edition_slug: null,
      edition_display_name: null,
      created_at: '',
    })),
    runs: [],
  };
}

function pif(imageCount: number) {
  return {
    product_id: 'p',
    category: 'mouse',
    images: Array.from({ length: imageCount }, (_, i) => ({ filename: `${i}.png` })),
    runs: [],
    carousel_slots: {},
    image_count: imageCount,
  } as unknown as Parameters<typeof derivePifTabSummary>[0];
}

describe('derivePifTabSummary', () => {
  it('idle when no CEF variants yet', () => {
    const r = derivePifTabSummary(pif(0), cef(0));
    strictEqual(r.status, 'idle');
    strictEqual(r.kpi, 'no variants');
  });

  it('empty when variants exist but zero images', () => {
    const r = derivePifTabSummary(pif(0), cef(4));
    strictEqual(r.status, 'empty');
    strictEqual(r.kpi, '0 img · 4 var');
  });

  it('partial when images > 0 but below variants × 4', () => {
    const r = derivePifTabSummary(pif(5), cef(4));
    strictEqual(r.status, 'partial');
    strictEqual(r.kpi, '5 img · 4 var');
    strictEqual(r.numerator, 5);
    strictEqual(r.denominator, 16);
    strictEqual(r.percent, 31);
  });

  it('complete when images >= variants × 4', () => {
    const r = derivePifTabSummary(pif(16), cef(4));
    strictEqual(r.status, 'complete');
    strictEqual(r.kpi, '16 img · 4 var');
    strictEqual(r.numerator, 16);
    strictEqual(r.denominator, 16);
    strictEqual(r.percent, 100);
  });

  it('handles null pifData (no result yet)', () => {
    const r = derivePifTabSummary(null, cef(4));
    strictEqual(r.status, 'empty');
    strictEqual(r.kpi, '0 img · 4 var');
  });

  it('handles null cefData (treats as no variants)', () => {
    const r = derivePifTabSummary(pif(3), null);
    strictEqual(r.status, 'idle');
    strictEqual(r.kpi, 'no variants');
  });
});
