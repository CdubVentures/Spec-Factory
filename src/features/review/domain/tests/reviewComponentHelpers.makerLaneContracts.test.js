import test from 'node:test';
import assert from 'node:assert/strict';

import {
  makerTokensFromReviewItem,
  reviewItemMatchesMakerLane,
  componentLaneSlug,
} from '../componentReviewHelpers.js';

test('makerTokensFromReviewItem extracts unique maker tokens from attributes and AI suggestions', () => {
  const item = {
    field_key: 'switch',
    product_attributes: {
      switch_brand: 'TTC',
      brand: 'Razer',
      maker: 'TTC',
    },
    ai_suggested_maker: 'TTC',
  };

  const tokens = makerTokensFromReviewItem(item, 'switch');

  assert.equal(tokens.includes('ttc'), true);
  assert.equal(tokens.includes('razer'), true);
  assert.equal(tokens.filter((token) => token === 'ttc').length, 1);
});

test('reviewItemMatchesMakerLane respects named, makerless, and allow-makerless lane contracts', () => {
  const makerItem = { product_attributes: { sensor_brand: 'PixArt' } };

  assert.equal(reviewItemMatchesMakerLane(makerItem, { componentType: 'sensor', maker: 'PixArt' }), true);
  assert.equal(reviewItemMatchesMakerLane(makerItem, { componentType: 'sensor', maker: 'TTC' }), false);
  assert.equal(reviewItemMatchesMakerLane({}, { componentType: 'sensor', maker: '' }), true);
  assert.equal(reviewItemMatchesMakerLane(makerItem, { componentType: 'sensor', maker: '' }), false);
  assert.equal(
    reviewItemMatchesMakerLane({}, {
      componentType: 'sensor',
      maker: 'PixArt',
      allowMakerlessForNamedLane: true,
    }),
    true,
  );
});

test('componentLaneSlug normalizes makerless lanes to the stable na suffix', () => {
  assert.equal(componentLaneSlug('PAW 3950', 'PixArt'), 'paw-3950_pixart');
  assert.equal(componentLaneSlug('TTC Gold', ''), 'ttc-gold_na');
  assert.equal(componentLaneSlug('FOX 50', null), 'fox-50_na');
});
