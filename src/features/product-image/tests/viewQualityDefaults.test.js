import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveViewQualityConfig, CATEGORY_VIEW_QUALITY_DEFAULTS, GENERIC_VIEW_QUALITY_DEFAULT } from '../viewQualityDefaults.js';

describe('resolveViewQualityConfig', () => {

  it('returns per-view quality map with all canonical views + hero', () => {
    const map = resolveViewQualityConfig('', 'mouse', 800, 600, 50000);
    assert.ok(map.top);
    assert.ok(map.left);
    assert.ok(map.angle);
    assert.ok(map.hero);
    assert.equal(typeof map.top.minWidth, 'number');
    assert.equal(typeof map.top.minHeight, 'number');
    assert.equal(typeof map.top.minFileSize, 'number');
  });

  it('mouse top uses portrait thresholds (narrow width, tall height)', () => {
    const map = resolveViewQualityConfig('', 'mouse', 800, 600, 50000);
    // top = portrait: width < 600, height >= 600
    assert.ok(map.top.minWidth < 600, `top minWidth ${map.top.minWidth} should be < 600`);
    assert.ok(map.top.minHeight >= 600, `top minHeight ${map.top.minHeight} should be >= 600`);
  });

  it('mouse left uses landscape thresholds (wide width, short height)', () => {
    const map = resolveViewQualityConfig('', 'mouse', 800, 600, 50000);
    // left = landscape: width >= 600, height < 600
    assert.ok(map.left.minWidth >= 600, `left minWidth ${map.left.minWidth} should be >= 600`);
    assert.ok(map.left.minHeight < 600, `left minHeight ${map.left.minHeight} should be < 600`);
  });

  it('mouse angle uses landscape thresholds', () => {
    const map = resolveViewQualityConfig('', 'mouse', 800, 600, 50000);
    assert.ok(map.angle.minWidth >= 600);
    assert.ok(map.angle.minHeight < 600);
  });

  it('monitor left uses portrait thresholds (thin side profile)', () => {
    const map = resolveViewQualityConfig('', 'monitor', 800, 600, 50000);
    assert.ok(map.left.minWidth < 600, 'monitor side is very thin');
    assert.ok(map.left.minHeight >= 600);
  });

  it('keyboard top uses landscape thresholds (very wide layout)', () => {
    const map = resolveViewQualityConfig('', 'keyboard', 800, 600, 50000);
    assert.ok(map.top.minWidth >= 600);
    assert.ok(map.top.minHeight < 600);
  });

  it('falls back to flat settings for unknown category (flat > generic)', () => {
    const map = resolveViewQualityConfig('', 'headset', 800, 600, 50000);
    // Flat settings (800/600/50000) take precedence over GENERIC_VIEW_QUALITY_DEFAULT
    // because flat settings are the user's explicitly configured values
    assert.equal(map.top.minWidth, 800);
    assert.equal(map.top.minHeight, 600);
    assert.equal(map.top.minFileSize, 50000);
  });

  it('uses GENERIC_VIEW_QUALITY_DEFAULT when flat values are 0', () => {
    const map = resolveViewQualityConfig('', 'headset', 0, 0, 0);
    assert.equal(map.top.minWidth, GENERIC_VIEW_QUALITY_DEFAULT.minWidth);
    assert.equal(map.top.minHeight, GENERIC_VIEW_QUALITY_DEFAULT.minHeight);
    assert.equal(map.top.minFileSize, GENERIC_VIEW_QUALITY_DEFAULT.minFileSize);
  });

  it('JSON override takes precedence over category defaults', () => {
    const override = JSON.stringify({ top: { minWidth: 999, minHeight: 888, minFileSize: 10000 } });
    const map = resolveViewQualityConfig(override, 'mouse', 800, 600, 50000);
    assert.equal(map.top.minWidth, 999);
    assert.equal(map.top.minHeight, 888);
    assert.equal(map.top.minFileSize, 10000);
    // Other views still use category defaults
    assert.ok(map.left.minWidth >= 600);
  });

  it('partial JSON override merges with category defaults', () => {
    const override = JSON.stringify({ top: { minWidth: 200 } });
    const map = resolveViewQualityConfig(override, 'mouse', 800, 600, 50000);
    // top: override minWidth, but minHeight/minFileSize from category default
    assert.equal(map.top.minWidth, 200);
    assert.ok(map.top.minHeight >= 600, 'minHeight falls back to category default');
    assert.ok(map.top.minFileSize > 0, 'minFileSize falls back to category default');
  });

  it('invalid JSON falls back to category defaults', () => {
    const map = resolveViewQualityConfig('not valid json!!!', 'mouse', 800, 600, 50000);
    assert.ok(map.top.minHeight >= 600, 'should use category defaults after invalid JSON');
  });

  it('empty string falls back to category defaults', () => {
    const map = resolveViewQualityConfig('', 'mouse', 800, 600, 50000);
    const catDefaults = CATEGORY_VIEW_QUALITY_DEFAULTS.mouse;
    assert.equal(map.top.minWidth, catDefaults.top.minWidth);
    assert.equal(map.top.minHeight, catDefaults.top.minHeight);
  });

  it('hero view is always included in the map', () => {
    const map = resolveViewQualityConfig('', 'mouse', 800, 600, 50000);
    assert.ok(map.hero);
    assert.equal(typeof map.hero.minWidth, 'number');
  });

  it('all minFileSize values are 30000 or less by default', () => {
    const map = resolveViewQualityConfig('', 'mouse', 800, 600, 50000);
    for (const [, val] of Object.entries(map)) {
      assert.ok(val.minFileSize <= 30000, `minFileSize ${val.minFileSize} should be <= 30000`);
    }
  });

  it('CATEGORY_VIEW_QUALITY_DEFAULTS has mouse, monitor, keyboard, mousepad', () => {
    assert.ok(CATEGORY_VIEW_QUALITY_DEFAULTS.mouse);
    assert.ok(CATEGORY_VIEW_QUALITY_DEFAULTS.monitor);
    assert.ok(CATEGORY_VIEW_QUALITY_DEFAULTS.keyboard);
    assert.ok(CATEGORY_VIEW_QUALITY_DEFAULTS.mousepad);
  });

  it('every category default has the long-axis >= 600 rule', () => {
    for (const [cat, views] of Object.entries(CATEGORY_VIEW_QUALITY_DEFAULTS)) {
      for (const [view, q] of Object.entries(views)) {
        const longAxis = Math.max(q.minWidth, q.minHeight);
        assert.ok(longAxis >= 600, `${cat}.${view} long axis ${longAxis} should be >= 600`);
      }
    }
  });
});
