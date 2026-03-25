import test from 'node:test';
import assert from 'node:assert/strict';

import {
  docHintMatchesDocKind,
  guessDocKind,
  normalizeDocHint,
} from '../urlClassifier.js';

test('guessDocKind classifies the supported document families', () => {
  const cases = [
    [{ pathname: '/manual.pdf', title: 'User guide' }, 'manual_pdf'],
    [{ pathname: '/spec.pdf', title: 'Specification' }, 'spec_pdf'],
    [{ title: 'Teardown of the Viper V3' }, 'teardown_review'],
    [{ title: 'Review and benchmark results', pathname: '/review' }, 'lab_review'],
    [{ pathname: '/datasheet' }, 'spec'],
    [{ pathname: '/support/download' }, 'support'],
    [{ pathname: '/product/viper-v3-pro' }, 'product_page'],
    [{ pathname: '/random-page', title: 'Random title' }, 'other'],
    [{}, 'other'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(guessDocKind(input), expected, JSON.stringify(input));
  }
});

test('normalizeDocHint normalizes whitespace hyphens and empty input', () => {
  assert.equal(normalizeDocHint('manual pdf'), 'manual_pdf');
  assert.equal(normalizeDocHint('lab-review'), 'lab_review');
  assert.equal(normalizeDocHint(''), '');
  assert.equal(normalizeDocHint(null), '');
});

test('docHintMatchesDocKind matches exact and mapped doc-hint families', () => {
  assert.equal(docHintMatchesDocKind('spec', 'spec'), true);
  assert.equal(docHintMatchesDocKind('manual', 'manual_pdf'), true);
  assert.equal(docHintMatchesDocKind('manual', 'support'), true);
  assert.equal(docHintMatchesDocKind('review', 'lab_review'), true);
  assert.equal(docHintMatchesDocKind('pdf', 'spec_pdf'), true);
  assert.equal(docHintMatchesDocKind('', 'spec'), false);
  assert.equal(docHintMatchesDocKind('spec', ''), false);
  assert.equal(docHintMatchesDocKind('unknown', 'spec'), false);
});
