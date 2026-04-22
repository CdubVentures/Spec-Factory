import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { shouldFireSlash } from '../useSlashFocus.ts';

describe('shouldFireSlash', () => {
  it('fires when context is empty (body / document)', () => {
    strictEqual(shouldFireSlash({}), true);
  });

  it('fires on non-interactive elements', () => {
    strictEqual(shouldFireSlash({ tagName: 'DIV' }), true);
    strictEqual(shouldFireSlash({ tagName: 'BUTTON' }), true);
    strictEqual(shouldFireSlash({ tagName: 'SPAN' }), true);
  });

  it('does not fire from an INPUT', () => {
    strictEqual(shouldFireSlash({ tagName: 'INPUT' }), false);
  });

  it('does not fire from a TEXTAREA', () => {
    strictEqual(shouldFireSlash({ tagName: 'TEXTAREA' }), false);
  });

  it('does not fire from a SELECT', () => {
    strictEqual(shouldFireSlash({ tagName: 'SELECT' }), false);
  });

  it('is case-insensitive on tagName', () => {
    strictEqual(shouldFireSlash({ tagName: 'input' }), false);
    strictEqual(shouldFireSlash({ tagName: 'Input' }), false);
  });

  it('does not fire from a contentEditable element', () => {
    strictEqual(shouldFireSlash({ tagName: 'DIV', isContentEditable: true }), false);
  });
});
