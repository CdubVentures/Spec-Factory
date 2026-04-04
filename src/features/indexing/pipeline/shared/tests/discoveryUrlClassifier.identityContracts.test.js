import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeIdentityMatchLevel,
  detectMultiModelHint,
  detectVariantGuardHit,
} from '../urlClassifier.js';

test('computeIdentityMatchLevel returns none for empty input', () => {
  assert.equal(computeIdentityMatchLevel(), 'none');
  assert.equal(computeIdentityMatchLevel({}), 'none');
});

test('computeIdentityMatchLevel distinguishes strong partial and weak matches', () => {
  const cases = [
    [{
      url: 'https://razer.com/viper',
      title: 'Razer Viper V3 Pro',
      snippet: '',
      identityLock: { brand: 'Razer', base_model: 'Viper V3', variant: 'Pro' },
    }, 'strong'],
    [{
      url: 'https://RAZER.COM/VIPER-V3-PRO',
      title: 'RAZER VIPER V3 PRO',
      snippet: '',
      identityLock: { brand: 'razer', base_model: 'viper v3', variant: 'pro' },
    }, 'strong'],
    [{
      url: 'https://razer.com',
      title: 'Razer Viper V3',
      snippet: '',
      identityLock: { brand: 'Razer', base_model: 'Viper V3' },
    }, 'partial'],
    [{
      url: 'https://razer.com',
      title: 'Razer Gaming',
      snippet: '',
      identityLock: { brand: 'Razer', base_model: 'Viper V3' },
    }, 'weak'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(computeIdentityMatchLevel(input), expected);
  }
});

test('detectVariantGuardHit detects non-target variants and skips the target variant', () => {
  assert.equal(detectVariantGuardHit(), false);
  assert.equal(detectVariantGuardHit({}), false);
  assert.equal(detectVariantGuardHit({
    title: 'Razer Viper V2 review',
    variantGuardTerms: ['V2'],
    targetVariant: 'V3',
  }), true);
  assert.equal(detectVariantGuardHit({
    title: 'Razer Viper V3 Pro',
    variantGuardTerms: ['V3'],
    targetVariant: 'V3',
  }), false);
});

test('detectMultiModelHint detects comparison-style titles and rejects single-product titles', () => {
  const positiveCases = [
    { title: 'Viper V3 vs G Pro X' },
    { title: 'Top 10 gaming mice' },
    { title: 'Best 5 gaming mice 2024' },
    { snippet: 'Full comparison of mice' },
  ];
  const negativeCases = [
    undefined,
    {},
    { title: 'canvas rendering module' },
    { title: 'Razer Viper V3 Pro review' },
  ];

  for (const value of positiveCases) {
    assert.equal(detectMultiModelHint(value), true, JSON.stringify(value));
  }
  for (const value of negativeCases) {
    assert.equal(detectMultiModelHint(value), false, JSON.stringify(value));
  }
});
