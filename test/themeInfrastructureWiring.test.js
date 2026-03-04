import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const THEME_CSS = path.resolve('tools/gui-react/src/theme.css');
const MAIN_TSX = path.resolve('tools/gui-react/src/main.tsx');
const INDEX_CSS = path.resolve('tools/gui-react/src/index.css');
const TAILWIND_CONFIG = path.resolve('tools/gui-react/tailwind.config.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('theme infrastructure has centralized token source with theme/radius profile overrides and compatibility aliases', () => {
  assert.equal(fs.existsSync(THEME_CSS), true, 'theme.css should exist as centralized theme source');

  const text = readText(THEME_CSS);
  assert.equal(text.includes(':root {'), true, 'theme.css should define light token values');
  assert.equal(
    text.includes("html[data-sf-theme='dark'] {"),
    true,
    'theme.css should define dark token values through data-sf-theme',
  );
  assert.equal(
    text.includes("html[data-sf-radius='tight'] {"),
    true,
    'theme.css should define tight radius profile override',
  );
  assert.equal(
    text.includes("html[data-sf-radius='standard'] {"),
    true,
    'theme.css should define standard radius profile override',
  );
  assert.equal(
    text.includes("html[data-sf-radius='relaxed'] {"),
    true,
    'theme.css should define relaxed radius profile override',
  );
  assert.equal(
    text.includes("html[data-sf-radius='pill-heavy'] {"),
    true,
    'theme.css should define pill-heavy radius profile override',
  );

  assert.equal(text.includes('--sf-token-surface-base'), true, 'theme.css should define surface tokens');
  assert.equal(text.includes('--sf-token-font-size-caption'), true, 'theme.css should define typography tokens');
  assert.equal(text.includes('--sf-token-space-1'), true, 'theme.css should define spacing tokens');
  assert.equal(text.includes('--sf-token-radius-lg'), true, 'theme.css should define radius tokens');
  assert.equal(text.includes('--sf-token-radius-chip'), true, 'theme.css should define semantic chip radius token');

  assert.equal(
    text.includes('--sf-bg-start: var(--sf-token-surface-canvas-start);'),
    true,
    'theme.css should expose legacy --sf-* alias for migration safety',
  );
  assert.equal(
    text.includes('--sf-text: rgb(var(--sf-color-text-primary-rgb));'),
    true,
    'theme.css should expose text alias backed by semantic token channels',
  );

  assert.equal(text.includes('.sf-primitive-panel'), true, 'theme.css should define panel primitive class');
  assert.equal(text.includes('.sf-primitive-input'), true, 'theme.css should define input primitive class');
  assert.equal(text.includes('.sf-primitive-table-shell'), true, 'theme.css should define table-shell primitive class');
});

test('main imports theme before index styles', () => {
  const text = readText(MAIN_TSX);
  const themeImport = text.indexOf("import './theme.css';");
  const indexImport = text.indexOf("import './index.css';");
  const themeHydrationCall = text.indexOf('hydrateUiThemeProfile();');

  assert.notEqual(themeImport, -1, 'main.tsx should import theme.css');
  assert.notEqual(indexImport, -1, 'main.tsx should import index.css');
  assert.equal(themeImport < indexImport, true, 'theme.css should load before index.css');
  assert.notEqual(themeHydrationCall, -1, 'main.tsx should hydrate theme profile attributes at startup');
});

test('index.css consumes token references and keeps shell behaviors', () => {
  const text = readText(INDEX_CSS);

  assert.equal(text.includes(':root {'), false, 'index.css should not own root token declarations');
  assert.equal(
    text.includes("html[data-sf-theme='dark'] {"),
    false,
    'index.css should not own dark token declarations',
  );

  assert.equal(text.includes('color: rgb(var(--sf-color-text-primary-rgb));'), true, 'index.css should consume semantic text channels');
  assert.equal(text.includes('var(--sf-state-warning-fg)'), true, 'index.css warning styling should consume semantic state tokens');
  assert.equal(text.includes('var(--sf-state-info-fg)'), true, 'index.css saving styling should consume semantic state tokens');
  assert.equal(text.includes('var(--sf-state-error-fg)'), true, 'index.css error styling should consume semantic state tokens');

  assert.equal(text.includes('.sf-shell'), true, 'index.css should preserve shell component styles');
  assert.equal(text.includes('.sf-shell-warning'), true, 'index.css should preserve warning shell class');
  assert.equal(text.includes('.sf-shell-saving'), true, 'index.css should preserve saving shell class');
  assert.equal(text.includes('.sf-shell-error'), true, 'index.css should preserve error shell class');
});

test('tailwind config exposes semantic variable-driven utilities and approved scales', () => {
  const text = readText(TAILWIND_CONFIG);

  assert.equal(
    text.includes("DEFAULT: 'rgb(var(--sf-color-surface-rgb) / <alpha-value>)'"),
    true,
    'tailwind should map surface color to semantic css variable channels',
  );
  assert.equal(
    text.includes("DEFAULT: 'rgb(var(--sf-color-accent-rgb) / <alpha-value>)'"),
    true,
    'tailwind should map accent color to semantic css variable channels',
  );
  assert.equal(text.includes('fontFamily:'), true, 'tailwind should expose semantic font families');
  assert.equal(text.includes('spacing:'), true, 'tailwind should expose approved spacing scale tokens');
  assert.equal(text.includes('borderRadius:'), true, 'tailwind should expose approved radius scale tokens');

  assert.equal(text.includes("'1.5': 'var(--sf-space-1-5)'"), true, 'tailwind spacing should include approved 1.5 scale token');
  assert.equal(text.includes("lg: 'var(--sf-radius-lg)'"), true, 'tailwind border radius should include semantic lg token');
});
