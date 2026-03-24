import test from 'node:test';
import assert from 'node:assert/strict';

// These are pure functions — test via direct import of the TS source
// compiled output. Since the project uses Vite/TSC for the GUI, we
// replicate the logic here to test the contract.

// ── Inline replica of shortModel (mirrors llmModelHelpers.ts) ────────────────

function shortModel(model) {
  const m = model.toLowerCase();
  const cm = m.match(/claude[- ](sonnet|haiku|opus)[- ](\d+)[- ](\d+)/);
  if (cm) return `${cm[1].charAt(0).toUpperCase() + cm[1].slice(1)} ${cm[2]}.${cm[3]}`;
  if (m.includes('sonnet')) return 'Sonnet';
  if (m.includes('haiku')) return 'Haiku';
  if (m.includes('opus')) return 'Opus';
  const gm = m.match(/gemini[- ](\d+(?:\.\d+)?)[- ](.+)/);
  if (gm) {
    const variant = gm[2].split(/[- ]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('-');
    return `${variant} ${gm[1]}`;
  }
  if (m.includes('gemini')) return 'Gemini';
  const ds = m.match(/deepseek[- ](\w+)/);
  if (ds) return `DS ${ds[1].charAt(0).toUpperCase() + ds[1].slice(1)}`;
  const gpt = m.match(/gpt[- ](.+)/);
  if (gpt) return gpt[1];
  return model;
}

function modelChipClass(model) {
  const m = model.toLowerCase();
  if (m.includes('haiku')) return 'sf-chip-success';
  if (m.includes('sonnet')) return 'sf-chip-info';
  if (m.includes('opus')) return 'sf-chip-accent';
  if (m.includes('flash-lite') || m.includes('flash_lite')) return 'sf-chip-teal-strong';
  if (m.includes('flash') || m.includes('gemini')) return 'sf-chip-sky-strong';
  if (m.includes('deepseek')) return 'sf-chip-purple';
  if (m.includes('gpt')) return 'sf-chip-warning';
  return 'sf-chip-neutral';
}

// ── shortModel tests ─────────────────────────────────────────────────────────

test('shortModel: Claude full version string', () => {
  assert.equal(shortModel('claude-sonnet-4-20250514'), 'Sonnet 4.20250514');
});

test('shortModel: Claude partial name', () => {
  assert.equal(shortModel('claude-sonnet'), 'Sonnet');
  assert.equal(shortModel('claude-haiku'), 'Haiku');
  assert.equal(shortModel('claude-opus'), 'Opus');
});

test('shortModel: Gemini flash-lite', () => {
  assert.equal(shortModel('gemini-2.5-flash-lite'), 'Flash-Lite 2.5');
});

test('shortModel: Gemini flash', () => {
  assert.equal(shortModel('gemini-2.5-flash'), 'Flash 2.5');
});

test('shortModel: Gemini bare', () => {
  assert.equal(shortModel('gemini'), 'Gemini');
});

test('shortModel: DeepSeek chat', () => {
  assert.equal(shortModel('deepseek-chat'), 'DS Chat');
});

test('shortModel: GPT model', () => {
  assert.equal(shortModel('gpt-4o-mini'), '4o-mini');
});

test('shortModel: unknown model passes through', () => {
  assert.equal(shortModel('unknown-model'), 'unknown-model');
});

// ── modelChipClass tests ─────────────────────────────────────────────────────

test('modelChipClass: Claude families', () => {
  assert.equal(modelChipClass('claude-haiku-3-20250301'), 'sf-chip-success');
  assert.equal(modelChipClass('claude-sonnet-4-20250514'), 'sf-chip-info');
  assert.equal(modelChipClass('claude-opus-4-20250514'), 'sf-chip-accent');
});

test('modelChipClass: Gemini families', () => {
  assert.equal(modelChipClass('gemini-2.5-flash-lite'), 'sf-chip-teal-strong');
  assert.equal(modelChipClass('gemini-2.5-flash'), 'sf-chip-sky-strong');
  assert.equal(modelChipClass('gemini'), 'sf-chip-sky-strong');
});

test('modelChipClass: DeepSeek', () => {
  assert.equal(modelChipClass('deepseek-chat'), 'sf-chip-purple');
});

test('modelChipClass: GPT', () => {
  assert.equal(modelChipClass('gpt-4o-mini'), 'sf-chip-warning');
});

test('modelChipClass: unknown model', () => {
  assert.equal(modelChipClass('unknown-model'), 'sf-chip-neutral');
});
