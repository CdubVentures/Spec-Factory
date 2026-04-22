import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveIntentClassName,
  shouldShowSpinner,
  shouldBlockClick,
  type ActionButtonIntent,
} from '../internals.ts';

describe('resolveIntentClassName', () => {
  it('spammable → sf-primary-button', () => {
    assert.equal(resolveIntentClassName('spammable'), 'sf-primary-button');
  });
  it('locked → sf-action-button', () => {
    assert.equal(resolveIntentClassName('locked'), 'sf-action-button');
  });
  it('prompt → sf-prompt-preview-button', () => {
    assert.equal(resolveIntentClassName('prompt'), 'sf-prompt-preview-button');
  });
  it('history → sf-history-button (new brown token)', () => {
    assert.equal(resolveIntentClassName('history'), 'sf-history-button');
  });
  it('delete → sf-delete-button (red border, red text)', () => {
    assert.equal(resolveIntentClassName('delete'), 'sf-delete-button');
  });
  it('stop → sf-danger-button-solid (solid red for emergency halt)', () => {
    assert.equal(resolveIntentClassName('stop'), 'sf-danger-button-solid');
  });
});

describe('shouldShowSpinner', () => {
  it('locked + busy=true → true', () => {
    assert.equal(shouldShowSpinner('locked', true), true);
  });
  it('locked + busy=false → false', () => {
    assert.equal(shouldShowSpinner('locked', false), false);
  });
  it('spammable + busy=true → false (busy ignored for spammable)', () => {
    assert.equal(shouldShowSpinner('spammable', true), false);
  });
  it('prompt + busy=true → false (busy ignored for prompt)', () => {
    assert.equal(shouldShowSpinner('prompt', true), false);
  });
  it('history + busy=true → false (busy ignored for history)', () => {
    assert.equal(shouldShowSpinner('history', true), false);
  });
  it('delete + busy=true → false (busy ignored for delete)', () => {
    assert.equal(shouldShowSpinner('delete', true), false);
  });
  it('stop + busy=true → true (stop locks like locked)', () => {
    assert.equal(shouldShowSpinner('stop', true), true);
  });
  it('stop + busy=false → false', () => {
    assert.equal(shouldShowSpinner('stop', false), false);
  });
});

describe('shouldBlockClick', () => {
  const allIntents: ActionButtonIntent[] = ['spammable', 'locked', 'prompt', 'history', 'delete', 'stop'];

  it('disabled=true blocks every intent, regardless of busy', () => {
    for (const intent of allIntents) {
      assert.equal(shouldBlockClick(intent, false, true), true, `${intent} + disabled=true + busy=false`);
      assert.equal(shouldBlockClick(intent, true, true), true, `${intent} + disabled=true + busy=true`);
    }
  });

  it('locked + busy=true (not disabled) → blocked', () => {
    assert.equal(shouldBlockClick('locked', true, false), true);
  });

  it('locked + busy=false (not disabled) → not blocked', () => {
    assert.equal(shouldBlockClick('locked', false, false), false);
  });

  it('spammable + busy=true (not disabled) → not blocked (busy ignored)', () => {
    assert.equal(shouldBlockClick('spammable', true, false), false);
  });

  it('prompt + busy=true (not disabled) → not blocked (busy ignored)', () => {
    assert.equal(shouldBlockClick('prompt', true, false), false);
  });

  it('history + busy=true (not disabled) → not blocked (busy ignored)', () => {
    assert.equal(shouldBlockClick('history', true, false), false);
  });

  it('delete + busy=true (not disabled) → not blocked (busy ignored)', () => {
    assert.equal(shouldBlockClick('delete', true, false), false);
  });

  it('stop + busy=true (not disabled) → blocked (stop locks like locked)', () => {
    assert.equal(shouldBlockClick('stop', true, false), true);
  });

  it('stop + busy=false (not disabled) → not blocked', () => {
    assert.equal(shouldBlockClick('stop', false, false), false);
  });
});
