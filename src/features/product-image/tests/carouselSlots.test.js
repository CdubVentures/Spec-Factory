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
import { writeCarouselSlot, resolveCarouselSlots } from '../imageEvaluator.js';

const TMP = path.join(os.tmpdir(), `carousel-slot-test-${Date.now()}`);
const PRODUCT_ID = 'test-product';

function makeImage(overrides = {}) {
  return {
    view: 'top',
    filename: 'top-black.png',
    url: 'https://example.com/top.png',
    variant_key: 'color:black',
    variant_label: 'Black',
    variant_type: 'color',
    quality_pass: true,
    ...overrides,
  };
}

function writeTestDoc(images, carouselSlots = {}) {
  const doc = {
    product_id: PRODUCT_ID,
    category: 'mouse',
    selected: { images },
    cooldown_until: '',
    last_ran_at: '',
    run_count: 1,
    next_run_number: 2,
    runs: [],
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

/* ── resolveCarouselSlots ───────────────────────────────────────── */

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
});
