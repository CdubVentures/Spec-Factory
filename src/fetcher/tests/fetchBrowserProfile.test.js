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

  it('injects toString protection before any other patches', () => {
    const toStringIndex = STEALTH_INIT_SCRIPT.indexOf('Function.prototype.toString');
    const firstDefineProperty = STEALTH_INIT_SCRIPT.indexOf('Object.defineProperty');
    assert.ok(toStringIndex !== -1, 'must contain toString protection');
    assert.ok(firstDefineProperty !== -1, 'must contain defineProperty calls');
    assert.ok(toStringIndex < firstDefineProperty, 'toString must come before first defineProperty');
  });

  it('installs chrome.runtime, chrome.app, chrome.csi, and chrome.loadTimes stubs', () => {
    assert.ok(STEALTH_INIT_SCRIPT.includes('chrome.runtime'), 'must stub chrome.runtime');
    assert.ok(STEALTH_INIT_SCRIPT.includes('chrome.app'), 'must stub chrome.app');
    assert.ok(STEALTH_INIT_SCRIPT.includes('chrome.csi'), 'must stub chrome.csi');
    assert.ok(STEALTH_INIT_SCRIPT.includes('chrome.loadTimes'), 'must stub chrome.loadTimes');
    assert.ok(STEALTH_INIT_SCRIPT.includes('InstallState'), 'chrome.app must have InstallState');
    assert.ok(STEALTH_INIT_SCRIPT.includes('RunningState'), 'chrome.app must have RunningState');
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
