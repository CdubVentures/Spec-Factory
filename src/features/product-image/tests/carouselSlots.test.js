/**
 * Carousel slot persistence contract tests.
 *
 * Tests dual-state write: JSON (durable) + SQL projection.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeCarouselSlot, clearCarouselWinners, clearAllCarouselWinners, resolveCarouselSlots } from '../imageEvaluator.js';

const TMP = path.join(os.tmpdir(), `carousel-slot-test-${Date.now()}`);
const PRODUCT_ID = 'test-product';

function makeImage(overrides = {}) {
  return {
    view: 'top',
    filename: 'top-black.png',
    url: 'https://example.com/top.png',
    variant_id: 'v_abc12345',
    variant_key: 'color:black',
    variant_label: 'Black',
    variant_type: 'color',
    quality_pass: true,
    ...overrides,
  };
}

function writeTestDoc(images, carouselSlots = {}, runs = []) {
  const doc = {
    product_id: PRODUCT_ID,
    category: 'mouse',
    selected: { images },
    cooldown_until: '',
    last_ran_at: '',
    run_count: 1,
    next_run_number: 2,
    runs,
    carousel_slots: carouselSlots,
  };
  const dir = path.join(TMP, PRODUCT_ID);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product_images.json'), JSON.stringify(doc, null, 2));
  return doc;
}

function readTestDoc() {
  return JSON.parse(fs.readFileSync(path.join(TMP, PRODUCT_ID, 'product_images.json'), 'utf8'));
}

before(() => fs.mkdirSync(TMP, { recursive: true }));
after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ } });

/* ── writeCarouselSlot ──────────────────────────────────────────── */

describe('writeCarouselSlot', () => {
  it('writes a slot to JSON', () => {
    writeTestDoc([]);
    writeCarouselSlot({
      productId: PRODUCT_ID,
      productRoot: TMP,
      variantKey: 'color:black',
      slot: 'top',
      filename: 'top-black.png',
    });
    const doc = readTestDoc();
    assert.equal(doc.carousel_slots['color:black'].top, 'top-black.png');
  });

  it('creates carousel_slots section if missing', () => {
    // Write a doc without carousel_slots
    const dir = path.join(TMP, PRODUCT_ID);
    fs.mkdirSync(dir, { recursive: true });
    const doc = { product_id: PRODUCT_ID, category: 'mouse', selected: { images: [] }, runs: [] };
    fs.writeFileSync(path.join(dir, 'product_images.json'), JSON.stringify(doc, null, 2));

    writeCarouselSlot({
      productId: PRODUCT_ID,
      productRoot: TMP,
      variantKey: 'color:black',
      slot: 'left',
      filename: 'left-black.png',
    });
    const result = readTestDoc();
    assert.equal(result.carousel_slots['color:black'].left, 'left-black.png');
  });

  it('clears a slot when filename is null', () => {
    writeTestDoc([], { 'color:black': { top: 'top-black.png' } });
    writeCarouselSlot({
      productId: PRODUCT_ID,
      productRoot: TMP,
      variantKey: 'color:black',
      slot: 'top',
      filename: null,
    });
    const doc = readTestDoc();
    assert.equal(doc.carousel_slots['color:black'].top, null);
  });

  it('preserves other slots when writing one', () => {
    writeTestDoc([], { 'color:black': { top: 'top-black.png', left: 'left-black.png' } });
    writeCarouselSlot({
      productId: PRODUCT_ID,
      productRoot: TMP,
      variantKey: 'color:black',
      slot: 'top',
      filename: 'top-black-2.png',
    });
    const doc = readTestDoc();
    assert.equal(doc.carousel_slots['color:black'].top, 'top-black-2.png');
    assert.equal(doc.carousel_slots['color:black'].left, 'left-black.png');
  });

  it('preserves other variants when writing one', () => {
    writeTestDoc([], {
      'color:black': { top: 'top-black.png' },
      'color:white': { top: 'top-white.png' },
    });
    writeCarouselSlot({
      productId: PRODUCT_ID,
      productRoot: TMP,
      variantKey: 'color:black',
      slot: 'top',
      filename: 'top-black-2.png',
    });
    const doc = readTestDoc();
    assert.equal(doc.carousel_slots['color:white'].top, 'top-white.png');
  });

  it('returns the updated carousel_slots object', () => {
    writeTestDoc([]);
    const result = writeCarouselSlot({
      productId: PRODUCT_ID,
      productRoot: TMP,
      variantKey: 'color:black',
      slot: 'angle',
      filename: 'angle-black.png',
    });
    assert.equal(result['color:black'].angle, 'angle-black.png');
  });
});

/* ── clearCarouselWinners ───────────────────────────────────────── */

describe('clearCarouselWinners', () => {
  it('empties resolved carousel slots for one variant without deleting images or other variants', () => {
    const blackTop = makeImage({ view: 'top', filename: 'top-black.png', eval_best: true, eval_flags: [], eval_reasoning: 'best top', eval_source: 'https://example.com/top.png' });
    const blackLeft = makeImage({ view: 'left', filename: 'left-black.png', eval_best: true, eval_flags: [], eval_reasoning: 'best left', eval_source: 'https://example.com/left.png' });
    const blackHero = makeImage({ view: 'hero', filename: 'hero-black.png', hero: true, hero_rank: 1, eval_reasoning: 'best hero' });
    const whiteTop = makeImage({ view: 'top', filename: 'top-white.png', variant_id: 'v_white123', variant_key: 'color:white', variant_label: 'White', eval_best: true });

    writeTestDoc([
      blackTop,
      blackLeft,
      blackHero,
      whiteTop,
    ], {
      'color:black': { top: 'manual-top-black.png', hero_1: 'manual-hero-black.png' },
      'color:white': { top: 'manual-top-white.png' },
    }, [
      {
        run_number: 1,
        selected: {
          images: [
            { ...blackTop },
            { ...blackLeft },
            { ...blackHero },
            { ...whiteTop },
          ],
        },
        response: {
          images: [
            { ...blackTop },
            { ...blackLeft },
            { ...blackHero },
            { ...whiteTop },
          ],
        },
      },
    ]);

    const result = clearCarouselWinners({
      productId: PRODUCT_ID,
      productRoot: TMP,
      variantKey: 'color:black',
      variantId: 'v_abc12345',
    });

    assert.ok(result);
    const doc = readTestDoc();
    assert.equal(doc.selected.images.length, 4);
    assert.equal(doc.carousel_slots['color:black'], undefined);
    assert.deepEqual(doc.carousel_slots['color:white'], { top: 'manual-top-white.png' });

    const blackImages = doc.selected.images.filter((img) => img.variant_key === 'color:black');
    for (const img of blackImages) {
      assert.equal(img.eval_best, undefined);
      assert.equal(img.eval_flags, undefined);
      assert.equal(img.eval_reasoning, undefined);
      assert.equal(img.eval_source, undefined);
      assert.equal(img.hero, undefined);
      assert.equal(img.hero_rank, undefined);
    }

    const blackRunImages = doc.runs[0].selected.images.filter((img) => img.variant_key === 'color:black');
    for (const img of blackRunImages) {
      assert.equal(img.eval_best, undefined);
      assert.equal(img.eval_flags, undefined);
      assert.equal(img.eval_reasoning, undefined);
      assert.equal(img.eval_source, undefined);
      assert.equal(img.hero, undefined);
      assert.equal(img.hero_rank, undefined);
    }

    const blackResponseImages = doc.runs[0].response.images.filter((img) => img.variant_key === 'color:black');
    for (const img of blackResponseImages) {
      assert.equal(img.eval_best, undefined);
      assert.equal(img.eval_flags, undefined);
      assert.equal(img.eval_reasoning, undefined);
      assert.equal(img.eval_source, undefined);
      assert.equal(img.hero, undefined);
      assert.equal(img.hero_rank, undefined);
    }

    const whiteImage = doc.selected.images.find((img) => img.variant_key === 'color:white');
    assert.equal(whiteImage.eval_best, true);

    const slots = resolveCarouselSlots({
      viewBudget: ['top', 'left'],
      heroCount: 1,
      variantKey: 'color:black',
      variantId: 'v_abc12345',
      carouselSlots: doc.carousel_slots,
      images: doc.runs[0].selected.images,
    });
    assert.deepEqual(slots.map((slot) => slot.filename), [null, null, null]);
  });

  it('clears current winners from legacy selected-only documents', () => {
    writeTestDoc([
      makeImage({ view: 'top', filename: 'top-black.png', eval_best: true, eval_flags: [], eval_reasoning: 'best top', eval_source: 'https://example.com/top.png' }),
      makeImage({ view: 'left', filename: 'left-black.png', eval_best: true, eval_flags: [], eval_reasoning: 'best left', eval_source: 'https://example.com/left.png' }),
      makeImage({ view: 'hero', filename: 'hero-black.png', hero: true, hero_rank: 1, eval_reasoning: 'best hero' }),
      makeImage({ view: 'top', filename: 'top-white.png', variant_id: 'v_white123', variant_key: 'color:white', variant_label: 'White', eval_best: true }),
    ], {
      'color:black': { top: 'manual-top-black.png', hero_1: 'manual-hero-black.png' },
      'color:white': { top: 'manual-top-white.png' },
    });

    const result = clearCarouselWinners({
      productId: PRODUCT_ID,
      productRoot: TMP,
      variantKey: 'color:black',
      variantId: 'v_abc12345',
    });

    assert.ok(result);
    const doc = readTestDoc();
    assert.equal(doc.selected.images.length, 4);
    assert.equal(doc.carousel_slots['color:black'], undefined);
    assert.deepEqual(doc.carousel_slots['color:white'], { top: 'manual-top-white.png' });

    const blackImages = doc.selected.images.filter((img) => img.variant_key === 'color:black');
    for (const img of blackImages) {
      assert.equal(img.eval_best, undefined);
      assert.equal(img.eval_flags, undefined);
      assert.equal(img.eval_reasoning, undefined);
      assert.equal(img.eval_source, undefined);
      assert.equal(img.hero, undefined);
      assert.equal(img.hero_rank, undefined);
    }

    const whiteImage = doc.selected.images.find((img) => img.variant_key === 'color:white');
    assert.equal(whiteImage.eval_best, true);

    const slots = resolveCarouselSlots({
      viewBudget: ['top', 'left'],
      heroCount: 1,
      variantKey: 'color:black',
      variantId: 'v_abc12345',
      carouselSlots: doc.carousel_slots,
      images: doc.selected.images,
    });
    assert.deepEqual(slots.map((slot) => slot.filename), [null, null, null]);
  });
});

/* ── resolveCarouselSlots ───────────────────────────────────────── */

describe('clearAllCarouselWinners', () => {
  it('empties resolved carousel slots for every variant without deleting images, runs, or eval history', () => {
    const blackTop = makeImage({ view: 'top', filename: 'top-black.png', eval_best: true, eval_flags: [], eval_reasoning: 'best top', eval_source: 'https://example.com/top.png' });
    const blackHero = makeImage({ view: 'hero', filename: 'hero-black.png', hero: true, hero_rank: 1, eval_reasoning: 'best hero' });
    const whiteTop = makeImage({ view: 'top', filename: 'top-white.png', variant_id: 'v_white123', variant_key: 'color:white', variant_label: 'White', eval_best: true, eval_reasoning: 'best white' });

    const baseDoc = writeTestDoc([
      blackTop,
      blackHero,
      whiteTop,
    ], {
      'color:black': { top: 'manual-top-black.png', hero_1: 'manual-hero-black.png' },
      'color:white': { top: 'manual-top-white.png' },
    }, [
      {
        run_number: 1,
        selected: { images: [{ ...blackTop }, { ...blackHero }, { ...whiteTop }] },
        response: { images: [{ ...blackTop }, { ...blackHero }, { ...whiteTop }] },
      },
    ]);
    baseDoc.evaluations = [{ eval_number: 1, variant_key: 'color:black', type: 'view' }];
    fs.writeFileSync(path.join(TMP, PRODUCT_ID, 'product_images.json'), JSON.stringify(baseDoc, null, 2));

    const result = clearAllCarouselWinners({
      productId: PRODUCT_ID,
      productRoot: TMP,
    });

    assert.ok(result);
    const doc = readTestDoc();
    assert.equal(doc.selected.images.length, 3);
    assert.equal(doc.runs.length, 1);
    assert.deepEqual(doc.evaluations, [{ eval_number: 1, variant_key: 'color:black', type: 'view' }]);
    assert.deepEqual(doc.carousel_slots, {});

    for (const img of doc.selected.images) {
      assert.equal(img.eval_best, undefined);
      assert.equal(img.eval_flags, undefined);
      assert.equal(img.eval_reasoning, undefined);
      assert.equal(img.eval_source, undefined);
      assert.equal(img.hero, undefined);
      assert.equal(img.hero_rank, undefined);
    }

    for (const img of doc.runs[0].selected.images) {
      assert.equal(img.eval_best, undefined);
      assert.equal(img.eval_reasoning, undefined);
      assert.equal(img.hero, undefined);
      assert.equal(img.hero_rank, undefined);
    }

    for (const img of doc.runs[0].response.images) {
      assert.equal(img.eval_best, undefined);
      assert.equal(img.eval_reasoning, undefined);
      assert.equal(img.hero, undefined);
      assert.equal(img.hero_rank, undefined);
    }

    const blackSlots = resolveCarouselSlots({
      viewBudget: ['top'],
      heroCount: 1,
      variantKey: 'color:black',
      variantId: 'v_abc12345',
      carouselSlots: doc.carousel_slots,
      images: doc.selected.images,
    });
    const whiteSlots = resolveCarouselSlots({
      viewBudget: ['top'],
      heroCount: 0,
      variantKey: 'color:white',
      variantId: 'v_white123',
      carouselSlots: doc.carousel_slots,
      images: doc.selected.images,
    });
    assert.deepEqual(blackSlots.map((slot) => slot.filename), [null, null]);
    assert.deepEqual(whiteSlots.map((slot) => slot.filename), [null]);
  });
});

describe('resolveCarouselSlots', () => {
  const viewBudget = ['top', 'left', 'angle'];

  it('returns empty placeholders when no slots or eval data', () => {
    const result = resolveCarouselSlots({
      viewBudget,
      heroCount: 3,
      variantKey: 'color:black',
      carouselSlots: {},
      images: [],
    });
    assert.equal(result.length, 6); // 3 views + 3 heroes
    assert.equal(result[0].slot, 'top');
    assert.equal(result[0].filename, null);
    assert.equal(result[0].source, 'empty');
    assert.equal(result[3].slot, 'hero_1');
  });

  it('fills from eval_best when no user override', () => {
    const result = resolveCarouselSlots({
      viewBudget,
      heroCount: 3,
      variantKey: 'color:black',
      carouselSlots: {},
      images: [
        makeImage({ view: 'top', filename: 'top-black.png', eval_best: true }),
        makeImage({ view: 'top', filename: 'top-black-2.png', eval_best: false }),
      ],
    });
    const topSlot = result.find(s => s.slot === 'top');
    assert.equal(topSlot.filename, 'top-black.png');
    assert.equal(topSlot.source, 'eval');
  });

  it('prefers dependency-aligned required images over a mismatching eval_best pick', () => {
    const result = resolveCarouselSlots({
      viewBudget: ['top'],
      heroCount: 0,
      variantKey: 'color:black',
      carouselSlots: {},
      images: [
        makeImage({
          view: 'top',
          filename: 'top-no-wire.png',
          eval_best: true,
          eval_actual_view: 'top',
          eval_usable_as_required_view: true,
          eval_quality: 'pass',
          eval_dependency_status: 'mismatch',
          width: 1600,
          height: 1000,
        }),
        makeImage({
          view: 'top',
          filename: 'top-wired.png',
          eval_best: false,
          eval_actual_view: 'top',
          eval_usable_as_required_view: true,
          eval_quality: 'pass',
          eval_dependency_status: 'aligned',
          width: 1200,
          height: 800,
        }),
      ],
    });

    assert.deepEqual(result.map(s => [s.slot, s.filename, s.source]), [
      ['top', 'top-wired.png', 'eval'],
    ]);
  });

  it('falls back to a dependency mismatch for a required slot when no better candidate exists', () => {
    const result = resolveCarouselSlots({
      viewBudget: ['top'],
      heroCount: 0,
      variantKey: 'color:black',
      carouselSlots: {},
      images: [
        makeImage({
          view: 'top',
          filename: 'top-no-wire.png',
          eval_best: true,
          eval_actual_view: 'top',
          eval_usable_as_required_view: true,
          eval_quality: 'pass',
          eval_dependency_status: 'mismatch',
        }),
      ],
    });

    assert.deepEqual(result.map(s => [s.slot, s.filename, s.source]), [
      ['top', 'top-no-wire.png', 'eval'],
    ]);
  });

  it('user override takes precedence over eval_best', () => {
    const result = resolveCarouselSlots({
      viewBudget,
      heroCount: 3,
      variantKey: 'color:black',
      carouselSlots: { 'color:black': { top: 'top-black-2.png' } },
      images: [
        makeImage({ view: 'top', filename: 'top-black.png', eval_best: true }),
        makeImage({ view: 'top', filename: 'top-black-2.png', eval_best: false }),
      ],
    });
    const topSlot = result.find(s => s.slot === 'top');
    assert.equal(topSlot.filename, 'top-black-2.png');
    assert.equal(topSlot.source, 'user');
  });

  it('fills hero slots from hero data', () => {
    const result = resolveCarouselSlots({
      viewBudget,
      heroCount: 3,
      variantKey: 'color:black',
      carouselSlots: {},
      images: [
        makeImage({ view: 'top', filename: 'top-black.png', hero: true, hero_rank: 1 }),
        makeImage({ view: 'left', filename: 'left-black.png', hero: true, hero_rank: 2 }),
      ],
    });
    const hero1 = result.find(s => s.slot === 'hero_1');
    const hero2 = result.find(s => s.slot === 'hero_2');
    assert.equal(hero1.filename, 'top-black.png');
    assert.equal(hero1.source, 'eval');
    assert.equal(hero2.filename, 'left-black.png');
  });

  it('user override on hero slot', () => {
    const result = resolveCarouselSlots({
      viewBudget,
      heroCount: 3,
      variantKey: 'color:black',
      carouselSlots: { 'color:black': { hero_1: 'angle-black.png' } },
      images: [
        makeImage({ view: 'top', filename: 'top-black.png', hero: true, hero_rank: 1 }),
      ],
    });
    const hero1 = result.find(s => s.slot === 'hero_1');
    assert.equal(hero1.filename, 'angle-black.png');
    assert.equal(hero1.source, 'user');
  });

  it('cleared slot (null) falls back to eval', () => {
    const result = resolveCarouselSlots({
      viewBudget,
      heroCount: 3,
      variantKey: 'color:black',
      carouselSlots: { 'color:black': { top: null } },
      images: [
        makeImage({ view: 'top', filename: 'top-black.png', eval_best: true }),
      ],
    });
    const topSlot = result.find(s => s.slot === 'top');
    // null in carousel_slots means "no override" — fall back to eval
    assert.equal(topSlot.filename, 'top-black.png');
    assert.equal(topSlot.source, 'eval');
  });

  it('__cleared__ sentinel blocks eval auto-fill', () => {
    const result = resolveCarouselSlots({
      viewBudget,
      heroCount: 3,
      variantKey: 'color:black',
      carouselSlots: { 'color:black': { top: '__cleared__' } },
      images: [
        makeImage({ view: 'top', filename: 'top-black.png', eval_best: true }),
      ],
    });
    const topSlot = result.find(s => s.slot === 'top');
    assert.equal(topSlot.filename, null);
    assert.equal(topSlot.source, 'empty');
  });

  it('__cleared__ sentinel on hero slot blocks auto-fill', () => {
    const result = resolveCarouselSlots({
      viewBudget,
      heroCount: 3,
      variantKey: 'color:black',
      carouselSlots: { 'color:black': { hero_1: '__cleared__' } },
      images: [
        makeImage({ view: 'top', filename: 'top-black.png', hero: true, hero_rank: 1 }),
      ],
    });
    const hero1 = result.find(s => s.slot === 'hero_1');
    assert.equal(hero1.filename, null);
    assert.equal(hero1.source, 'empty');
  });

  it('renders manually added empty per-variant placeholders outside configured slots', () => {
    const result = resolveCarouselSlots({
      viewBudget: ['left'],
      heroCount: 0,
      variantKey: 'color:black',
      carouselSlots: {
        'color:black': {
          top: '__cleared__',
          top3: '__cleared__',
          hero_1: '__cleared__',
        },
      },
      images: [],
    });

    assert.deepEqual(result.map(s => [s.slot, s.filename, s.source]), [
      ['left', null, 'empty'],
      ['top', null, 'empty'],
      ['top3', null, 'empty'],
      ['hero_1', null, 'empty'],
    ]);
  });

  it('renders manually filled per-variant placeholders even without eval candidates', () => {
    const result = resolveCarouselSlots({
      viewBudget: ['left'],
      heroCount: 0,
      variantKey: 'color:black',
      carouselSlots: {
        'color:black': {
          top3: 'manual-top-3.png',
        },
      },
      images: [],
    });

    assert.deepEqual(result.map(s => [s.slot, s.filename, s.source]), [
      ['left', null, 'empty'],
      ['top3', 'manual-top-3.png', 'user'],
    ]);
  });

  it('fills an empty required slot from a classified candidate found in another view search', () => {
    const result = resolveCarouselSlots({
      viewBudget: ['top', 'front'],
      heroCount: 0,
      variantKey: 'color:black',
      carouselSlots: {},
      images: [
        makeImage({
          view: 'front',
          filename: 'front-search-top.png',
          eval_best: false,
          eval_actual_view: 'top',
          eval_matches_requested_view: false,
          eval_usable_as_required_view: true,
          eval_usable_as_carousel_extra: true,
          eval_duplicate: false,
          eval_flags: [],
          width: 1200,
          height: 800,
        }),
      ],
    });
    assert.deepEqual(result.map(s => [s.slot, s.filename, s.source]), [
      ['top', 'front-search-top.png', 'eval'],
      ['front', null, 'empty'],
    ]);
  });

  it('adds numbered extra slots from unused good classified images without filling the wrong required view', () => {
    const result = resolveCarouselSlots({
      viewBudget: ['top', 'front'],
      heroCount: 0,
      variantKey: 'color:black',
      carouselSlots: {},
      images: [
        makeImage({ view: 'top', filename: 'top-black.png', eval_best: true, eval_actual_view: 'top', eval_usable_as_required_view: true, eval_usable_as_carousel_extra: true }),
        makeImage({
          view: 'front',
          filename: 'front-search-top.png',
          eval_best: false,
          eval_actual_view: 'top',
          eval_matches_requested_view: false,
          eval_usable_as_required_view: true,
          eval_usable_as_carousel_extra: true,
          eval_duplicate: false,
          eval_flags: [],
        }),
      ],
    });
    assert.deepEqual(result.map(s => [s.slot, s.filename, s.source]), [
      ['top', 'top-black.png', 'eval'],
      ['front', null, 'empty'],
      ['top2', 'front-search-top.png', 'eval'],
    ]);
  });

  it('fills configured optional carousel placeholders even when the image is not a numbered extra', () => {
    const result = resolveCarouselSlots({
      viewBudget: ['top', 'left'],
      carouselSlotViews: ['top', 'left', 'right'],
      heroCount: 0,
      variantKey: 'color:black',
      carouselSlots: {},
      images: [
        makeImage({
          view: 'right',
          filename: 'right-black.png',
          eval_best: true,
          eval_actual_view: 'right',
          eval_usable_as_required_view: true,
          eval_usable_as_carousel_extra: false,
          eval_duplicate: false,
          eval_flags: [],
        }),
      ],
    });

    assert.deepEqual(result.map(s => [s.slot, s.filename, s.source]), [
      ['top', null, 'empty'],
      ['left', null, 'empty'],
      ['right', 'right-black.png', 'eval'],
    ]);
  });

  it('does not use dependency mismatches or duplicates as numbered extra slots', () => {
    const result = resolveCarouselSlots({
      viewBudget: ['top'],
      heroCount: 0,
      variantKey: 'color:black',
      carouselSlots: {},
      images: [
        makeImage({
          view: 'top',
          filename: 'top-wired.png',
          eval_best: true,
          eval_actual_view: 'top',
          eval_usable_as_required_view: true,
          eval_usable_as_carousel_extra: true,
          eval_duplicate: false,
          eval_flags: [],
          eval_dependency_status: 'aligned',
        }),
        makeImage({
          view: 'top',
          filename: 'top-no-wire.png',
          eval_best: false,
          eval_actual_view: 'top',
          eval_usable_as_required_view: true,
          eval_usable_as_carousel_extra: true,
          eval_duplicate: false,
          eval_flags: [],
          eval_dependency_status: 'mismatch',
          width: 1600,
          height: 1000,
        }),
        makeImage({
          view: 'top',
          filename: 'top-wired-tight-crop.png',
          eval_best: false,
          eval_actual_view: 'top',
          eval_usable_as_required_view: true,
          eval_usable_as_carousel_extra: true,
          eval_duplicate: true,
          eval_flags: [],
          eval_dependency_status: 'aligned',
          width: 1500,
          height: 900,
        }),
        makeImage({
          view: 'top',
          filename: 'top-wired-distinct.png',
          eval_best: false,
          eval_actual_view: 'top',
          eval_usable_as_required_view: true,
          eval_usable_as_carousel_extra: true,
          eval_duplicate: false,
          eval_flags: [],
          eval_dependency_status: 'aligned',
          width: 1200,
          height: 800,
        }),
      ],
    });

    assert.deepEqual(result.map(s => [s.slot, s.filename, s.source]), [
      ['top', 'top-wired.png', 'eval'],
      ['top2', 'top-wired-distinct.png', 'eval'],
    ]);
  });

  it('adds generic product extras as img slots and skips duplicate or flagged candidates', () => {
    const result = resolveCarouselSlots({
      viewBudget: ['top'],
      heroCount: 0,
      variantKey: 'color:black',
      carouselSlots: {},
      images: [
        makeImage({ view: 'top', filename: 'top-black.png', eval_best: true, eval_actual_view: 'top', eval_usable_as_required_view: true, eval_usable_as_carousel_extra: true }),
        makeImage({
          view: 'angle',
          filename: 'generic-product.png',
          eval_best: false,
          eval_actual_view: 'generic',
          eval_usable_as_required_view: false,
          eval_usable_as_carousel_extra: true,
          eval_duplicate: false,
          eval_flags: [],
          width: 1400,
          height: 900,
        }),
        makeImage({
          view: 'angle',
          filename: 'duplicate-product.png',
          eval_actual_view: 'generic',
          eval_usable_as_carousel_extra: true,
          eval_duplicate: true,
          eval_flags: [],
        }),
        makeImage({
          view: 'angle',
          filename: 'cropped-product.png',
          eval_actual_view: 'generic',
          eval_usable_as_carousel_extra: true,
          eval_duplicate: false,
          eval_flags: ['cropped'],
        }),
      ],
    });
    assert.deepEqual(result.map(s => [s.slot, s.filename, s.source]), [
      ['top', 'top-black.png', 'eval'],
      ['img1', 'generic-product.png', 'eval'],
    ]);
  });
});
