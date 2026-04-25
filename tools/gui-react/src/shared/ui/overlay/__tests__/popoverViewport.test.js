import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTriggerInViewport } from '../popoverViewport.ts';

const VP = { width: 1280, height: 800 };

test('trigger fully on-screen → in viewport', () => {
  const rect = { top: 100, left: 100, bottom: 120, right: 200, width: 100, height: 20 };
  assert.equal(isTriggerInViewport(rect, VP), true);
});

test('trigger scrolled fully above viewport → not in viewport', () => {
  const rect = { top: -50, left: 100, bottom: -30, right: 200, width: 100, height: 20 };
  assert.equal(isTriggerInViewport(rect, VP), false);
});

test('trigger scrolled fully below viewport → not in viewport', () => {
  const rect = { top: 850, left: 100, bottom: 870, right: 200, width: 100, height: 20 };
  assert.equal(isTriggerInViewport(rect, VP), false);
});

test('trigger partially visible (top edge clipped) → still in viewport', () => {
  const rect = { top: -5, left: 100, bottom: 15, right: 200, width: 100, height: 20 };
  assert.equal(isTriggerInViewport(rect, VP), true);
});

test('trigger fully off-screen horizontally → not in viewport', () => {
  const rect = { top: 100, left: -200, bottom: 120, right: -100, width: 100, height: 20 };
  assert.equal(isTriggerInViewport(rect, VP), false);
});

test('zero-size rect (detached/unmounted trigger) → not in viewport', () => {
  const rect = { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
  assert.equal(isTriggerInViewport(rect, VP), false);
});
