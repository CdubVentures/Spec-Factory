import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STEALTH_USER_AGENT,
  STEALTH_VIEWPORT,
  STEALTH_INIT_SCRIPT,
  buildStealthContextOptions
} from '../stealthProfile.js';

describe('stealth browser profile presents a mainstream desktop browser', () => {
  it('publishes a Chrome user agent without automation markers', () => {
    assert.match(STEALTH_USER_AGENT, /Mozilla\/5\.0.*Chrome\/\d+/);
    assert.ok(!STEALTH_USER_AGENT.includes('HeadlessChrome'));
    assert.ok(!STEALTH_USER_AGENT.includes('EGSpecHarvester'));
    assert.ok(!STEALTH_USER_AGENT.toLowerCase().includes('bot'));
    assert.ok(!STEALTH_USER_AGENT.toLowerCase().includes('crawler'));
    assert.ok(!STEALTH_USER_AGENT.toLowerCase().includes('spider'));
  });

  it('uses a standard desktop viewport', () => {
    assert.equal(STEALTH_VIEWPORT.width, 1920);
    assert.equal(STEALTH_VIEWPORT.height, 1080);
  });

  it('injects anti-detection navigator overrides before page scripts run', () => {
    assert.ok(STEALTH_INIT_SCRIPT.includes('webdriver'));
    assert.ok(STEALTH_INIT_SCRIPT.includes('plugins'));
    assert.ok(STEALTH_INIT_SCRIPT.includes('languages'));
  });
});

describe('stealth browser context options keep the safe defaults', () => {
  it('returns the default browser identity and locale settings', () => {
    const opts = buildStealthContextOptions();
    assert.equal(opts.userAgent, STEALTH_USER_AGENT);
    assert.deepStrictEqual(opts.viewport, STEALTH_VIEWPORT);
    assert.equal(opts.locale, 'en-US');
    assert.ok(opts.timezoneId);
  });

  it('allows a caller to override the user agent without losing the standard viewport', () => {
    const opts = buildStealthContextOptions({ userAgent: 'Custom/1.0' });
    assert.equal(opts.userAgent, 'Custom/1.0');
    assert.deepStrictEqual(opts.viewport, STEALTH_VIEWPORT);
  });
});
