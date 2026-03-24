import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STEALTH_USER_AGENT,
  STEALTH_VIEWPORT,
  STEALTH_INIT_SCRIPT,
  buildStealthContextOptions
} from '../stealthProfile.js';

// ---------------------------------------------------------------------------
// BP-01: User-Agent is realistic (not HeadlessChrome or EGSpecHarvester)
// ---------------------------------------------------------------------------
describe('BP-01: User-Agent is realistic', () => {
  it('UA matches current Chrome stable pattern', () => {
    assert.match(STEALTH_USER_AGENT, /Mozilla\/5\.0.*Chrome\/\d+/);
  });

  it('UA does not contain HeadlessChrome', () => {
    assert.ok(!STEALTH_USER_AGENT.includes('HeadlessChrome'));
  });

  it('UA does not contain EGSpecHarvester', () => {
    assert.ok(!STEALTH_USER_AGENT.includes('EGSpecHarvester'));
  });

  it('UA does not contain bot-like identifiers', () => {
    assert.ok(!STEALTH_USER_AGENT.toLowerCase().includes('bot'));
    assert.ok(!STEALTH_USER_AGENT.toLowerCase().includes('crawler'));
    assert.ok(!STEALTH_USER_AGENT.toLowerCase().includes('spider'));
  });
});

// ---------------------------------------------------------------------------
// BP-02: Viewport is standard (1920x1080 or similar)
// ---------------------------------------------------------------------------
describe('BP-02: Viewport is standard', () => {
  it('width is 1920', () => {
    assert.equal(STEALTH_VIEWPORT.width, 1920);
  });

  it('height is 1080', () => {
    assert.equal(STEALTH_VIEWPORT.height, 1080);
  });
});

// ---------------------------------------------------------------------------
// BP-03 to BP-06: Init script sets anti-detection properties
// ---------------------------------------------------------------------------
describe('BP-03: navigator.webdriver is overridden', () => {
  it('init script overrides navigator.webdriver', () => {
    assert.ok(STEALTH_INIT_SCRIPT.includes('webdriver'));
  });
});

describe('BP-04: plugins array is overridden', () => {
  it('init script overrides navigator.plugins', () => {
    assert.ok(STEALTH_INIT_SCRIPT.includes('plugins'));
  });
});

describe('BP-05: languages are set', () => {
  it('init script overrides navigator.languages', () => {
    assert.ok(STEALTH_INIT_SCRIPT.includes('languages'));
  });
});

// ---------------------------------------------------------------------------
// BP: buildStealthContextOptions returns complete config
// ---------------------------------------------------------------------------
describe('buildStealthContextOptions produces valid Playwright context config', () => {
  it('returns userAgent', () => {
    const opts = buildStealthContextOptions();
    assert.equal(opts.userAgent, STEALTH_USER_AGENT);
  });

  it('returns viewport', () => {
    const opts = buildStealthContextOptions();
    assert.deepStrictEqual(opts.viewport, STEALTH_VIEWPORT);
  });

  it('returns locale en-US', () => {
    const opts = buildStealthContextOptions();
    assert.equal(opts.locale, 'en-US');
  });

  it('returns timezoneId', () => {
    const opts = buildStealthContextOptions();
    assert.ok(opts.timezoneId);
  });

  it('allows userAgent override', () => {
    const opts = buildStealthContextOptions({ userAgent: 'Custom/1.0' });
    assert.equal(opts.userAgent, 'Custom/1.0');
  });
});
