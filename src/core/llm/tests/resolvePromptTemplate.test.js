import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePromptTemplate,
  extractTemplateVariables,
  validateTemplate,
} from '../resolvePromptTemplate.js';

// ─── resolvePromptTemplate ────────────────────────────────────────────────────

describe('resolvePromptTemplate', () => {

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('replaces a single variable', () => {
    const result = resolvePromptTemplate('Hello {{NAME}}!', { NAME: 'World' });
    assert.equal(result, 'Hello World!');
  });

  it('replaces multiple distinct variables', () => {
    const template = '{{BRAND}} {{MODEL}} is great';
    const result = resolvePromptTemplate(template, { BRAND: 'Logitech', MODEL: 'G502' });
    assert.equal(result, 'Logitech G502 is great');
  });

  it('replaces the same variable appearing multiple times', () => {
    const template = '{{NAME}} likes {{NAME}}';
    const result = resolvePromptTemplate(template, { NAME: 'Alice' });
    assert.equal(result, 'Alice likes Alice');
  });

  it('replaces variable with multi-line value', () => {
    const template = 'Before\n{{BLOCK}}\nAfter';
    const result = resolvePromptTemplate(template, { BLOCK: 'line1\nline2\nline3' });
    assert.equal(result, 'Before\nline1\nline2\nline3\nAfter');
  });

  it('handles template with no variables', () => {
    const template = 'Just plain text with no placeholders.';
    const result = resolvePromptTemplate(template, {});
    assert.equal(result, 'Just plain text with no placeholders.');
  });

  it('handles variable names with underscores and numbers', () => {
    const template = '{{VAR_1}} and {{LONG_VARIABLE_NAME_2}}';
    const result = resolvePromptTemplate(template, { VAR_1: 'a', LONG_VARIABLE_NAME_2: 'b' });
    assert.equal(result, 'a and b');
  });

  // ── Empty / missing variables ───────────────────────────────────────────────

  it('leaves unknown variables as literal text', () => {
    const result = resolvePromptTemplate('Hello {{UNKNOWN}}!', {});
    assert.equal(result, 'Hello {{UNKNOWN}}!');
  });

  it('replaces known variables and leaves unknown ones', () => {
    const template = '{{KNOWN}} and {{UNKNOWN}}';
    const result = resolvePromptTemplate(template, { KNOWN: 'yes' });
    assert.equal(result, 'yes and {{UNKNOWN}}');
  });

  it('replaces variable with empty string', () => {
    const result = resolvePromptTemplate('A{{VAR}}B', { VAR: '' });
    assert.equal(result, 'AB');
  });

  // ── Whitespace preservation ──────────────────────────────────────────────────

  it('preserves blank lines when empty variable is substituted', () => {
    // WHY: No collapse — default templates must produce byte-identical output.
    const template = 'Before\n\n{{EMPTY_VAR}}\n\nAfter';
    const result = resolvePromptTemplate(template, { EMPTY_VAR: '' });
    assert.equal(result, 'Before\n\n\n\nAfter');
  });

  it('preserves exactly 2 consecutive newlines', () => {
    const template = 'A\n\nB';
    const result = resolvePromptTemplate(template, {});
    assert.equal(result, 'A\n\nB');
  });

  it('preserves many consecutive newlines without collapsing', () => {
    const template = 'A\n\n\n\n\n\nB';
    const result = resolvePromptTemplate(template, {});
    assert.equal(result, 'A\n\n\n\n\n\nB');
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it('returns empty string for empty template', () => {
    const result = resolvePromptTemplate('', { FOO: 'bar' });
    assert.equal(result, '');
  });

  it('handles template that is only a variable', () => {
    const result = resolvePromptTemplate('{{WHOLE}}', { WHOLE: 'entire content' });
    assert.equal(result, 'entire content');
  });

  it('does not match malformed placeholders (single braces)', () => {
    const result = resolvePromptTemplate('{NAME}', { NAME: 'test' });
    assert.equal(result, '{NAME}');
  });

  it('does not match triple braces', () => {
    const result = resolvePromptTemplate('{{{NAME}}}', { NAME: 'test' });
    // Should match the inner {{NAME}} and leave the outer braces
    assert.equal(result, '{test}');
  });

  it('handles variable value containing double braces (no recursive resolution)', () => {
    const result = resolvePromptTemplate('{{VAR}}', { VAR: 'has {{OTHER}} in it' });
    assert.equal(result, 'has {{OTHER}} in it');
  });

  it('handles null/undefined variables map gracefully', () => {
    // Contract: should not throw
    const result1 = resolvePromptTemplate('{{FOO}}', null);
    assert.equal(typeof result1, 'string');
    const result2 = resolvePromptTemplate('{{FOO}}', undefined);
    assert.equal(typeof result2, 'string');
  });
});

// ─── extractTemplateVariables ─────────────────────────────────────────────────

describe('extractTemplateVariables', () => {

  it('extracts single variable', () => {
    assert.deepEqual(extractTemplateVariables('Hello {{NAME}}!'), ['NAME']);
  });

  it('extracts multiple distinct variables in order of first appearance', () => {
    const result = extractTemplateVariables('{{B}} then {{A}} then {{C}}');
    assert.deepEqual(result, ['B', 'A', 'C']);
  });

  it('deduplicates repeated variables', () => {
    const result = extractTemplateVariables('{{X}} and {{Y}} and {{X}}');
    assert.deepEqual(result, ['X', 'Y']);
  });

  it('returns empty array for no variables', () => {
    assert.deepEqual(extractTemplateVariables('no variables here'), []);
  });

  it('returns empty array for empty string', () => {
    assert.deepEqual(extractTemplateVariables(''), []);
  });

  it('handles variables with underscores and numbers', () => {
    const result = extractTemplateVariables('{{VAR_1}} {{LONG_NAME_2}}');
    assert.deepEqual(result, ['VAR_1', 'LONG_NAME_2']);
  });

  it('does not extract from single braces', () => {
    assert.deepEqual(extractTemplateVariables('{NOT_A_VAR}'), []);
  });
});

// ─── validateTemplate ─────────────────────────────────────────────────────────

describe('validateTemplate', () => {

  const defs = [
    { name: 'REQUIRED_1', required: true },
    { name: 'REQUIRED_2', required: true },
    { name: 'OPTIONAL_1', required: false },
  ];

  it('returns empty missing array when all required variables present', () => {
    const template = '{{REQUIRED_1}} {{REQUIRED_2}} {{OPTIONAL_1}}';
    const result = validateTemplate(template, defs);
    assert.deepEqual(result.missing, []);
  });

  it('returns empty missing when optional variables are absent', () => {
    const template = '{{REQUIRED_1}} {{REQUIRED_2}}';
    const result = validateTemplate(template, defs);
    assert.deepEqual(result.missing, []);
  });

  it('detects single missing required variable', () => {
    const template = '{{REQUIRED_1}}';
    const result = validateTemplate(template, defs);
    assert.deepEqual(result.missing, ['REQUIRED_2']);
  });

  it('detects multiple missing required variables', () => {
    const template = 'no variables at all';
    const result = validateTemplate(template, defs);
    assert.deepEqual(result.missing, ['REQUIRED_1', 'REQUIRED_2']);
  });

  it('returns empty missing for empty defs array', () => {
    const result = validateTemplate('{{FOO}}', []);
    assert.deepEqual(result.missing, []);
  });

  it('returns empty missing for template with no defs requiring', () => {
    const optionalOnly = [{ name: 'A', required: false }, { name: 'B', required: false }];
    const result = validateTemplate('', optionalOnly);
    assert.deepEqual(result.missing, []);
  });
});
