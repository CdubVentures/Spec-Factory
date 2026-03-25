import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLowValueHost } from '../urlQualityGate.js';

describe('isLowValueHost', () => {
  it('detects low-value social roots and subdomains', () => {
    assert.equal(isLowValueHost('reddit.com'), true);
    assert.equal(isLowValueHost('www.reddit.com'), true);
    assert.equal(isLowValueHost('old.reddit.com'), true);
  });

  it('detects support and community subdomains', () => {
    assert.equal(isLowValueHost('support.logitech.com'), true);
    assert.equal(isLowValueHost('community.corsair.com'), true);
    assert.equal(isLowValueHost('forum.razer.com'), true);
    assert.equal(isLowValueHost('mysupport.razer.com'), true);
  });

  it('allows manufacturer and review hosts', () => {
    assert.equal(isLowValueHost('www.razer.com'), false);
    assert.equal(isLowValueHost('api-p1.phoenix.razer.com'), false);
    assert.equal(isLowValueHost('rtings.com'), false);
    assert.equal(isLowValueHost('techpowerup.com'), false);
  });

  it('rejects local and test hosts', () => {
    assert.equal(isLowValueHost('aggressive.local'), true);
    assert.equal(isLowValueHost('test.localhost'), true);
    assert.equal(isLowValueHost('example.test'), true);
  });
});
