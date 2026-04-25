import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveVariantColorAtoms,
  buildVariantList,
  buildGalleryImages,
  sortByPriorityAndSize,
  groupImagesByVariant,
  resolveSlots,
  resolveRunMode,
  resolveLoopId,
  buildModeBadge,
  groupRunsByLoop,
  groupEvalsByVariant,
  derivePifKpiCards,
  removeImageFromResult,
} from '../pifSelectors.ts';
import type {
  ProductImageEntry,
  ProductImageFinderRun,
  ProductImageFinderResult,
  EvalRecord,
  GalleryImage,
  VariantInfo,
} from '../../types.ts';

/* ── Test Factories ───────────────────────────────────────────────── */

function makeImage(overrides: Partial<ProductImageEntry> = {}): ProductImageEntry {
  return {
    view: 'top',
    filename: 'top-black.png',
    url: 'https://example.com/top-black.png',
    source_page: 'https://example.com',
    alt_text: 'Product top view',
    bytes: 50000,
    width: 800,
    height: 600,
    quality_pass: true,
    variant_key: 'color:black',
    variant_label: 'Black',
    variant_type: 'color',
    downloaded_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function makeGalleryImage(overrides: Partial<GalleryImage> = {}): GalleryImage {
  return {
    ...makeImage(),
    run_number: 1,
    run_model: 'gpt-5',
    run_ran_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function makeRun(overrides: Partial<ProductImageFinderRun> = {}): ProductImageFinderRun {
  return {
    run_number: 1,
    ran_at: '2026-04-01T00:00:00Z',
    model: 'gpt-5',
    fallback_used: false,
    selected: { images: [] },
    prompt: { system: 'sys', user: 'usr' },
    response: {
      images: [],
      download_errors: [],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      variant_key: 'color:black',
      variant_label: 'Black',
    },
    ...overrides,
  };
}

function makeEval(overrides: Partial<EvalRecord> = {}): EvalRecord {
  return {
    eval_number: 1,
    type: 'view',
    view: 'top',
    variant_key: 'color:black',
    model: 'gpt-5',
    ran_at: '2026-04-01T00:00:00Z',
    duration_ms: 1500,
    prompt: { system: 'sys', user: 'usr' },
    response: {},
    result: {},
    ...overrides,
  };
}

/* ── resolveVariantColorAtoms ─────────────────────────────────────── */

describe('resolveVariantColorAtoms', () => {
  it('splits color key on +', () => {
    assert.deepEqual(resolveVariantColorAtoms('color:black+red', {}), ['black', 'red']);
  });

  it('returns single atom for simple color', () => {
    assert.deepEqual(resolveVariantColorAtoms('color:black', {}), ['black']);
  });

  it('looks up edition colors combo', () => {
    const editions = { 'cod-edition': { display_name: 'CoD', colors: ['black+orange'] } };
    assert.deepEqual(resolveVariantColorAtoms('edition:cod-edition', editions), ['black', 'orange']);
  });

  it('falls back to splitting on + when edition not found', () => {
    assert.deepEqual(resolveVariantColorAtoms('edition:unknown', {}), []);
  });

  it('strips color: prefix before splitting', () => {
    assert.deepEqual(resolveVariantColorAtoms('color:dark-gray+black+orange', {}), ['dark-gray', 'black', 'orange']);
  });
});

/* ── buildVariantList ─────────────────────────────────────────────── */

describe('buildVariantList', () => {
  const mk = (over = {}) => ({
    variant_id: 'v1', variant_key: 'color:black', variant_type: 'color' as const,
    variant_label: 'Black', color_atoms: ['black'], edition_slug: null,
    edition_display_name: null, created_at: '2026-04-16T00:00:00Z',
    ...over,
  });

  it('returns empty for empty registry', () => {
    assert.deepEqual(buildVariantList([]), []);
  });

  it('builds exactly one variant per registry entry — no duplicates when editions exist', () => {
    const result = buildVariantList([
      mk({ variant_id: 'v1', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'] }),
      mk({ variant_id: 'v2', variant_key: 'color:white', variant_type: 'color', variant_label: 'White', color_atoms: ['white'] }),
      mk({ variant_id: 'v3', variant_key: 'edition:cod-bo6', variant_type: 'edition', variant_label: 'COD BO6', color_atoms: ['dark-gray','black','orange'], edition_slug: 'cod-bo6', edition_display_name: 'Call of Duty BO6' }),
    ]);
    assert.equal(result.length, 3, 'one variant per registry row');
    assert.equal(result[0].key, 'color:black');
    assert.equal(result[1].key, 'color:white');
    assert.equal(result[2].key, 'edition:cod-bo6');
  });

  it('edition registry entry only produces an edition variant (no duplicate color variant even when combo is also a color)', () => {
    const result = buildVariantList([
      mk({ variant_id: 'v1', variant_key: 'edition:gaming-ed', variant_type: 'edition', variant_label: 'Gaming', color_atoms: ['black','red'], edition_slug: 'gaming-ed', edition_display_name: 'Gaming Edition' }),
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].key, 'edition:gaming-ed');
    assert.equal(result[0].type, 'edition');
    assert.equal(result[0].label, 'Gaming Edition');
  });

  it('uses edition display_name as label for edition variants', () => {
    const result = buildVariantList([
      mk({ variant_id: 'v1', variant_key: 'edition:stealth', variant_type: 'edition', variant_label: 'Stealth', color_atoms: ['black'], edition_slug: 'stealth', edition_display_name: 'Stealth Edition' }),
    ]);
    assert.equal(result[0].label, 'Stealth Edition');
  });

  it('uses color_names[combo] as label for color variants when provided', () => {
    const result = buildVariantList(
      [mk({ variant_id: 'v1', variant_key: 'color:white+silver', variant_type: 'color', variant_label: 'White Silver', color_atoms: ['white','silver'] })],
      { 'white+silver': 'Frost White' },
    );
    assert.equal(result[0].label, 'Frost White');
  });

  it('falls back to variant_label, then formatted atom, for color variants', () => {
    const labeled = buildVariantList(
      [mk({ variant_id: 'v1', variant_key: 'color:black', variant_type: 'color', variant_label: 'Midnight Black', color_atoms: ['black'] })],
    );
    assert.equal(labeled[0].label, 'Midnight Black');

    const unlabeled = buildVariantList(
      [mk({ variant_id: 'v1', variant_key: 'color:dark-gray', variant_type: 'color', variant_label: '', color_atoms: ['dark-gray'] })],
    );
    assert.equal(unlabeled[0].label, 'Dark Gray');
  });

  it('ignores a color label that matches the raw combo (case insensitive)', () => {
    const result = buildVariantList(
      [mk({ variant_id: 'v1', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'] })],
    );
    assert.equal(result[0].label, 'Black');
  });

  it('edition without display_name falls back to variant_label, then slug', () => {
    const labeled = buildVariantList([
      mk({ variant_id: 'v1', variant_key: 'edition:mystery-ed', variant_type: 'edition', variant_label: 'Mystery Edition', color_atoms: ['black'], edition_slug: 'mystery-ed', edition_display_name: null }),
    ]);
    assert.equal(labeled[0].label, 'Mystery Edition');

    const slugOnly = buildVariantList([
      mk({ variant_id: 'v1', variant_key: 'edition:slug-only', variant_type: 'edition', variant_label: '', color_atoms: ['black'], edition_slug: 'slug-only', edition_display_name: null }),
    ]);
    assert.equal(slugOnly[0].label, 'slug-only');
  });

  it('carries variant_id from the registry onto VariantInfo', () => {
    const result = buildVariantList([
      mk({ variant_id: 'v_abc', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'] }),
    ]);
    assert.equal(result[0].variant_id, 'v_abc');
  });
});

/* ── buildGalleryImages ───────────────────────────────────────────── */

describe('buildGalleryImages', () => {
  it('returns empty for empty runs', () => {
    assert.deepEqual(buildGalleryImages([]), []);
  });

  it('flattens images from a single run', () => {
    const img = makeImage();
    const run = makeRun({ run_number: 1, selected: { images: [img] } });
    const result = buildGalleryImages([run]);
    assert.equal(result.length, 1);
    assert.equal(result[0].run_number, 1);
    assert.equal(result[0].run_model, 'gpt-5');
    assert.equal(result[0].filename, 'top-black.png');
  });

  it('sorts by run_number ascending', () => {
    const run2 = makeRun({ run_number: 2, ran_at: '2026-04-02', selected: { images: [makeImage({ filename: 'r2.png' })] } });
    const run1 = makeRun({ run_number: 1, selected: { images: [makeImage({ filename: 'r1.png' })] } });
    const result = buildGalleryImages([run2, run1]);
    assert.equal(result[0].filename, 'r1.png');
    assert.equal(result[1].filename, 'r2.png');
  });

  it('skips runs with no selected images', () => {
    const run = makeRun({ run_number: 1, selected: { images: [] } });
    assert.deepEqual(buildGalleryImages([run]), []);
  });
});

/* ── sortByPriorityAndSize ────────────────────────────────────────── */

describe('sortByPriorityAndSize', () => {
  it('sorts by category-specific view order', () => {
    const images = [
      makeGalleryImage({ view: 'angle', filename: 'a.png' }),
      makeGalleryImage({ view: 'top', filename: 't.png' }),
    ];
    const sorted = sortByPriorityAndSize(images, 'mouse');
    assert.equal(sorted[0].view, 'top');
    assert.equal(sorted[1].view, 'angle');
  });

  it('uses generic order for unknown category', () => {
    const images = [
      makeGalleryImage({ view: 'front', filename: 'f.png' }),
      makeGalleryImage({ view: 'top', filename: 't.png' }),
    ];
    const sorted = sortByPriorityAndSize(images, 'unknown-cat');
    assert.equal(sorted[0].view, 'top');
    assert.equal(sorted[1].view, 'front');
  });

  it('sorts same-view by pixel area descending', () => {
    const images = [
      makeGalleryImage({ view: 'top', width: 400, height: 300, filename: 'small.png' }),
      makeGalleryImage({ view: 'top', width: 800, height: 600, filename: 'large.png' }),
    ];
    const sorted = sortByPriorityAndSize(images, 'mouse');
    assert.equal(sorted[0].filename, 'large.png');
    assert.equal(sorted[1].filename, 'small.png');
  });

  it('hero always sorts last', () => {
    const images = [
      makeGalleryImage({ view: 'hero', filename: 'h.png' }),
      makeGalleryImage({ view: 'bottom', filename: 'b.png' }),
    ];
    const sorted = sortByPriorityAndSize(images, 'mouse');
    assert.equal(sorted[0].view, 'bottom');
    assert.equal(sorted[1].view, 'hero');
  });
});

/* ── groupImagesByVariant ─────────────────────────────────────────── */

describe('groupImagesByVariant', () => {
  it('returns groups with empty arrays when no images', () => {
    const variants: VariantInfo[] = [{ key: 'color:black', label: 'Black', type: 'color' }];
    const groups = groupImagesByVariant([], variants, 'mouse');
    assert.equal(groups.length, 1);
    assert.equal(groups[0].key, 'color:black');
    assert.deepEqual(groups[0].images, []);
  });

  it('groups images by matching variant key', () => {
    const images = [
      makeGalleryImage({ variant_key: 'color:black', filename: 'b1.png' }),
      makeGalleryImage({ variant_key: 'color:white', filename: 'w1.png' }),
    ];
    const variants: VariantInfo[] = [
      { key: 'color:black', label: 'Black', type: 'color' },
      { key: 'color:white', label: 'White', type: 'color' },
    ];
    const groups = groupImagesByVariant(images, variants, 'mouse');
    assert.equal(groups.length, 2);
    assert.equal(groups[0].images.length, 1);
    assert.equal(groups[0].images[0].filename, 'b1.png');
    assert.equal(groups[1].images[0].filename, 'w1.png');
  });

  it('preserves variant order from CEF', () => {
    const images = [makeGalleryImage({ variant_key: 'color:white', filename: 'w.png' })];
    const variants: VariantInfo[] = [
      { key: 'color:black', label: 'Black', type: 'color' },
      { key: 'color:white', label: 'White', type: 'color' },
    ];
    const groups = groupImagesByVariant(images, variants, 'mouse');
    assert.equal(groups[0].key, 'color:black');
    assert.equal(groups[1].key, 'color:white');
  });

  it('appends orphaned images with orphaned flag', () => {
    const images = [makeGalleryImage({ variant_key: 'color:red', filename: 'r.png', variant_label: 'Red' })];
    const variants: VariantInfo[] = [{ key: 'color:black', label: 'Black', type: 'color' }];
    const groups = groupImagesByVariant(images, variants, 'mouse');
    assert.equal(groups.length, 2);
    assert.equal(groups[1].key, 'color:red');
    assert.equal(groups[1].orphaned, true);
    assert.equal(groups[1].label, 'Red');
  });
});

/* ── resolveSlots ─────────────────────────────────────────────────── */

describe('resolveSlots', () => {
  it('returns all empty when no overrides or eval winners', () => {
    const slots = resolveSlots(['top', 'angle'], 0, 'color:black', {}, []);
    assert.equal(slots.length, 2);
    assert.equal(slots[0].source, 'empty');
    assert.equal(slots[1].source, 'empty');
  });

  it('user override takes precedence', () => {
    const carouselSlots = { 'color:black': { top: 'user-top.png' } };
    const slots = resolveSlots(['top'], 0, 'color:black', carouselSlots, []);
    assert.equal(slots[0].source, 'user');
    assert.equal(slots[0].filename, 'user-top.png');
  });

  it('eval winner fills slot when no user override', () => {
    const images = [makeImage({ view: 'top', filename: 'eval-top.png', eval_best: true })];
    const slots = resolveSlots(['top'], 0, 'color:black', {}, images);
    assert.equal(slots[0].source, 'eval');
    assert.equal(slots[0].filename, 'eval-top.png');
  });

  it('resolves hero slots', () => {
    const images = [
      makeImage({ hero: true, hero_rank: 1, filename: 'hero1.png' }),
      makeImage({ hero: true, hero_rank: 2, filename: 'hero2.png' }),
    ];
    const slots = resolveSlots([], 2, 'color:black', {}, images);
    assert.equal(slots.length, 2);
    assert.equal(slots[0].slot, 'hero_1');
    assert.equal(slots[0].filename, 'hero1.png');
    assert.equal(slots[0].source, 'eval');
    assert.equal(slots[1].slot, 'hero_2');
    assert.equal(slots[1].filename, 'hero2.png');
  });

  it('hero user override takes precedence over eval', () => {
    const images = [makeImage({ hero: true, hero_rank: 1, filename: 'eval-hero.png' })];
    const carouselSlots = { 'color:black': { hero_1: 'user-hero.png' } };
    const slots = resolveSlots([], 1, 'color:black', carouselSlots, images);
    assert.equal(slots[0].source, 'user');
    assert.equal(slots[0].filename, 'user-hero.png');
  });
});

/* ── resolveRunMode ───────────────────────────────────────────────── */

describe('resolveRunMode', () => {
  it('returns top-level mode', () => {
    assert.equal(resolveRunMode(makeRun({ mode: 'view' })), 'view');
  });

  it('falls back to response mode', () => {
    const run = makeRun();
    run.response.mode = 'hero';
    assert.equal(resolveRunMode(run), 'hero');
  });

  it('returns null when neither present', () => {
    assert.equal(resolveRunMode(makeRun()), null);
  });
});

/* ── resolveLoopId ────────────────────────────────────────────────── */

describe('resolveLoopId', () => {
  it('returns top-level loop_id', () => {
    assert.equal(resolveLoopId(makeRun({ loop_id: 'loop-1' })), 'loop-1');
  });

  it('falls back to response loop_id', () => {
    const run = makeRun();
    run.response.loop_id = 'loop-2';
    assert.equal(resolveLoopId(run), 'loop-2');
  });

  it('returns null when neither present', () => {
    assert.equal(resolveLoopId(makeRun()), null);
  });
});

/* ── buildModeBadge ───────────────────────────────────────────────── */

describe('buildModeBadge', () => {
  function makeLoopRun(focusView: string | null): ProductImageFinderRun {
    return makeRun({
      mode: 'view',
      loop_id: 'loop-1',
      response: {
        images: [],
        download_errors: [],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        variant_key: 'color:black',
        variant_label: 'Black',
        focus_view: focusView,
      },
    });
  }

  it('returns null when no mode', () => {
    assert.equal(buildModeBadge(makeRun()), null);
  });

  it('returns VIEW badge for standalone view mode', () => {
    const badge = buildModeBadge(makeRun({ mode: 'view' }));
    assert.equal(badge?.label, 'VIEW');
    assert.equal(badge?.className, 'sf-chip-info');
  });

  it('returns HERO badge for standalone hero mode', () => {
    const badge = buildModeBadge(makeRun({ mode: 'hero' }));
    assert.equal(badge?.label, 'HERO');
    assert.equal(badge?.className, 'sf-chip-accent');
  });

  it('adds LOOP prefix on loop view run when not insideLoop and no focus_view', () => {
    const badge = buildModeBadge(makeRun({ mode: 'view', loop_id: 'loop-1' }));
    assert.equal(badge?.label, 'LOOP VIEW');
  });

  it('shows focus view label on loop run when insideLoop=true', () => {
    const badge = buildModeBadge(makeLoopRun('top'), { insideLoop: true });
    assert.equal(badge?.label, 'TOP');
    assert.equal(badge?.className, 'sf-chip-info');
  });

  it('shows focus view label for any canonical view (bottom, angle, etc.)', () => {
    assert.equal(buildModeBadge(makeLoopRun('bottom'), { insideLoop: true })?.label, 'BOTTOM');
    assert.equal(buildModeBadge(makeLoopRun('angle'), { insideLoop: true })?.label, 'ANGLE');
    assert.equal(buildModeBadge(makeLoopRun('rear'), { insideLoop: true })?.label, 'REAR');
  });

  it('drops LOOP prefix on loop hero run when insideLoop=true', () => {
    const badge = buildModeBadge(makeRun({ mode: 'hero', loop_id: 'loop-1' }), { insideLoop: true });
    assert.equal(badge?.label, 'HERO');
    assert.equal(badge?.className, 'sf-chip-accent');
  });

  it('falls back to VIEW (no LOOP prefix) inside loop when focus_view missing on legacy run', () => {
    const badge = buildModeBadge(makeRun({ mode: 'view', loop_id: 'loop-1' }), { insideLoop: true });
    assert.equal(badge?.label, 'VIEW');
  });

  it('reads focus_view from top-level run field too (SQL projection path)', () => {
    const run = makeRun({ mode: 'view', loop_id: 'loop-1', focus_view: 'left' });
    const badge = buildModeBadge(run, { insideLoop: true });
    assert.equal(badge?.label, 'LEFT');
  });
});

/* ── groupRunsByLoop ──────────────────────────────────────────────── */

describe('groupRunsByLoop', () => {
  it('returns empty for empty runs', () => {
    assert.deepEqual(groupRunsByLoop([]), []);
  });

  it('wraps single non-loop runs individually', () => {
    const runs = [makeRun({ run_number: 1 }), makeRun({ run_number: 2 })];
    const groups = groupRunsByLoop(runs);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].type, 'single');
    assert.equal(groups[0].runs.length, 1);
  });

  it('groups runs with same loop_id', () => {
    const runs = [
      makeRun({ run_number: 1, loop_id: 'L1' }),
      makeRun({ run_number: 2, loop_id: 'L1' }),
      makeRun({ run_number: 3 }),
    ];
    const groups = groupRunsByLoop(runs);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].type, 'loop');
    assert.equal(groups[0].loopId, 'L1');
    assert.equal(groups[0].runs.length, 2);
    assert.equal(groups[1].type, 'single');
  });

  it('preserves insertion order for mixed single + loop', () => {
    const runs = [
      makeRun({ run_number: 1 }),
      makeRun({ run_number: 2, loop_id: 'L1' }),
      makeRun({ run_number: 3, loop_id: 'L1' }),
      makeRun({ run_number: 4 }),
    ];
    const groups = groupRunsByLoop(runs);
    assert.equal(groups.length, 3);
    assert.equal(groups[0].type, 'single');
    assert.equal(groups[1].type, 'loop');
    assert.equal(groups[2].type, 'single');
  });
});

/* ── groupEvalsByVariant ──────────────────────────────────────────── */

describe('groupEvalsByVariant', () => {
  it('returns empty for empty evals', () => {
    assert.deepEqual(groupEvalsByVariant([]), []);
  });

  it('groups by variant_key', () => {
    const evals = [
      makeEval({ eval_number: 1, variant_key: 'color:black' }),
      makeEval({ eval_number: 2, variant_key: 'color:white' }),
      makeEval({ eval_number: 3, variant_key: 'color:black' }),
    ];
    const groups = groupEvalsByVariant(evals);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].variantKey, 'color:black');
    assert.equal(groups[0].evals.length, 2);
    assert.equal(groups[1].variantKey, 'color:white');
    assert.equal(groups[1].evals.length, 1);
  });

  it('preserves first-appearance order', () => {
    const evals = [
      makeEval({ eval_number: 1, variant_key: 'color:white' }),
      makeEval({ eval_number: 2, variant_key: 'color:black' }),
    ];
    const groups = groupEvalsByVariant(evals);
    assert.equal(groups[0].variantKey, 'color:white');
    assert.equal(groups[1].variantKey, 'color:black');
  });
});

/* ── derivePifKpiCards ────────────────────────────────────────────── */

describe('derivePifKpiCards', () => {
  it('returns 4 cards with correct values', () => {
    const cards = derivePifKpiCards(25, 3, 5, { filled: 12, total: 15, allComplete: false });
    assert.equal(cards.length, 4);
    assert.equal(cards[0].label, 'Images');
    assert.equal(cards[0].value, '25');
    assert.equal(cards[0].tone, 'accent');
    assert.equal(cards[1].value, '3');
    assert.equal(cards[2].value, '5');
    assert.equal(cards[3].value, '12/15');
    assert.equal(cards[3].tone, 'info');
  });

  it('shows success tone when carousel complete', () => {
    const cards = derivePifKpiCards(10, 2, 3, { filled: 10, total: 10, allComplete: true });
    assert.equal(cards[3].tone, 'success');
  });

  it('shows -- when total is 0', () => {
    const cards = derivePifKpiCards(0, 0, 0, { filled: 0, total: 0, allComplete: false });
    assert.equal(cards[0].value, '0');
    assert.equal(cards[3].value, '--');
  });
});

/* ── removeImageFromResult ─────────────────────────────────────────── */

function makeResult(overrides: Partial<ProductImageFinderResult> = {}): ProductImageFinderResult {
  return {
    product_id: 'p1',
    category: 'mouse',
    images: [],
    image_count: 0,
    run_count: 0,
    last_ran_at: '2026-04-01T00:00:00Z',
    selected: { images: [] },
    runs: [],
    ...overrides,
  };
}

describe('removeImageFromResult', () => {
  it('removes image from top-level images[], runs[].selected.images[], runs[].response.images[] and decrements image_count', () => {
    const img = makeImage({ filename: 'top-black.png' });
    const run = makeRun({
      run_number: 1,
      selected: { images: [img] },
      response: { ...makeRun().response, images: [img] },
    });
    const data = makeResult({
      images: [{ view: 'top', filename: 'top-black.png', variant_key: 'color:black' }],
      image_count: 1,
      runs: [run],
    });

    const result = removeImageFromResult(data, 'top-black.png');

    assert.equal(result.images.length, 0);
    assert.equal(result.image_count, 0);
    assert.equal(result.runs[0].selected.images.length, 0);
    assert.equal(result.runs[0].response.images.length, 0);
  });

  it('removes image from multiple runs', () => {
    const img = makeImage({ filename: 'shared.png' });
    const run1 = makeRun({ run_number: 1, selected: { images: [img] }, response: { ...makeRun().response, images: [img] } });
    const run2 = makeRun({ run_number: 2, selected: { images: [img] }, response: { ...makeRun().response, images: [img] } });
    const data = makeResult({
      images: [{ view: 'top', filename: 'shared.png', variant_key: 'color:black' }],
      image_count: 1,
      runs: [run1, run2],
    });

    const result = removeImageFromResult(data, 'shared.png');

    assert.equal(result.runs[0].selected.images.length, 0);
    assert.equal(result.runs[1].selected.images.length, 0);
  });

  it('leaves run intact when last image is removed (run stays, empty array)', () => {
    const img = makeImage({ filename: 'only.png' });
    const run = makeRun({ selected: { images: [img] }, response: { ...makeRun().response, images: [img] } });
    const data = makeResult({
      images: [{ view: 'top', filename: 'only.png', variant_key: 'color:black' }],
      image_count: 1,
      runs: [run],
      run_count: 1,
    });

    const result = removeImageFromResult(data, 'only.png');

    assert.equal(result.runs.length, 1, 'run should not be removed');
    assert.equal(result.runs[0].selected.images.length, 0);
    assert.equal(result.image_count, 0);
    assert.equal(result.run_count, 1, 'run_count should not change');
  });

  it('returns data unchanged when filename not found', () => {
    const img = makeImage({ filename: 'existing.png' });
    const run = makeRun({ selected: { images: [img] }, response: { ...makeRun().response, images: [img] } });
    const data = makeResult({
      images: [{ view: 'top', filename: 'existing.png', variant_key: 'color:black' }],
      image_count: 1,
      runs: [run],
    });

    const result = removeImageFromResult(data, 'nonexistent.png');

    assert.equal(result.images.length, 1);
    assert.equal(result.image_count, 1);
    assert.equal(result.runs[0].selected.images.length, 1);
  });

  it('handles empty runs array', () => {
    const data = makeResult({ images: [], image_count: 0, runs: [] });
    const result = removeImageFromResult(data, 'anything.png');
    assert.deepEqual(result, data);
  });

  it('only removes matching filename, preserves other images', () => {
    const imgA = makeImage({ filename: 'a.png', view: 'top' });
    const imgB = makeImage({ filename: 'b.png', view: 'left' });
    const run = makeRun({
      selected: { images: [imgA, imgB] },
      response: { ...makeRun().response, images: [imgA, imgB] },
    });
    const data = makeResult({
      images: [
        { view: 'top', filename: 'a.png', variant_key: 'color:black' },
        { view: 'left', filename: 'b.png', variant_key: 'color:black' },
      ],
      image_count: 2,
      runs: [run],
    });

    const result = removeImageFromResult(data, 'a.png');

    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].filename, 'b.png');
    assert.equal(result.image_count, 1);
    assert.equal(result.runs[0].selected.images.length, 1);
    assert.equal(result.runs[0].selected.images[0].filename, 'b.png');
  });
});
