import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

let isTypedPhraseMatched: (input: string, phrase: string) => boolean;

before(async () => {
  const mod = await loadBundledModule(
    'tools/gui-react/src/shared/ui/feedback/TypedConfirmModal.tsx',
    {
      prefix: 'typed-confirm-modal-',
      stubs: {
        'react/jsx-runtime': `
          export function jsx(type, props) { return { type, props: props || {} }; }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
        react: `
          export function useState(init) { return [init, () => {}]; }
          export function useEffect() {}
          export function useRef() { return { current: null }; }
        `,
      },
    },
  );
  ({ isTypedPhraseMatched } = mod);
});

describe('isTypedPhraseMatched', () => {
  it('matches when input exactly equals phrase', () => {
    assert.equal(isTypedPhraseMatched('RESET', 'RESET'), true);
  });

  it('matches multi-word phrase exactly', () => {
    assert.equal(isTypedPhraseMatched('RESET ALL', 'RESET ALL'), true);
  });

  it('trims leading whitespace before matching', () => {
    assert.equal(isTypedPhraseMatched('  RESET', 'RESET'), true);
  });

  it('trims trailing whitespace before matching', () => {
    assert.equal(isTypedPhraseMatched('RESET  ', 'RESET'), true);
  });

  it('trims surrounding whitespace before matching', () => {
    assert.equal(isTypedPhraseMatched('  RESET ALL  ', 'RESET ALL'), true);
  });

  it('does not match when case differs', () => {
    assert.equal(isTypedPhraseMatched('reset', 'RESET'), false);
  });

  it('does not match on partial input', () => {
    assert.equal(isTypedPhraseMatched('RES', 'RESET'), false);
  });

  it('does not match on extra trailing characters beyond whitespace', () => {
    assert.equal(isTypedPhraseMatched('RESETX', 'RESET'), false);
  });

  it('does not match on empty input against non-empty phrase', () => {
    assert.equal(isTypedPhraseMatched('', 'RESET'), false);
  });

  it('does not match on whitespace-only input against non-empty phrase', () => {
    assert.equal(isTypedPhraseMatched('   ', 'RESET'), false);
  });

  it('matches empty input against empty phrase (degenerate)', () => {
    assert.equal(isTypedPhraseMatched('', ''), true);
  });
});
