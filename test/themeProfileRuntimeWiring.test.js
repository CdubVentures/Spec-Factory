import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const UI_STORE = path.resolve('tools/gui-react/src/stores/uiStore.ts');
const MAIN_TSX = path.resolve('tools/gui-react/src/main.tsx');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');
const APP_SHELL = path.resolve('tools/gui-react/src/components/layout/AppShell.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('ui store persists and hydrates theme profile contract through html data attributes', () => {
  const text = readText(UI_STORE);

  assert.equal(
    text.includes("const THEME_COLOR_KEY = 'ui:themeColorProfile';"),
    true,
    'uiStore should persist theme color profile with a dedicated key',
  );
  assert.equal(
    text.includes("const THEME_RADIUS_KEY = 'ui:themeRadiusProfile';"),
    true,
    'uiStore should persist radius profile with a dedicated key',
  );
  assert.equal(
    text.includes("const THEME_DENSITY_KEY = 'ui:themeDensityProfile';"),
    true,
    'uiStore should persist optional density profile with a dedicated key',
  );
  assert.equal(
    text.includes("setRootDataAttribute('data-sf-theme', normalizedProfile.color);"),
    true,
    'uiStore should apply theme profile through html data-sf-theme',
  );
  assert.equal(
    text.includes("setRootDataAttribute('data-sf-radius', normalizedProfile.radius);"),
    true,
    'uiStore should apply radius profile through html data-sf-radius',
  );
  assert.equal(
    text.includes("setRootDataAttribute('data-sf-density', normalizedProfile.density);"),
    true,
    'uiStore should apply optional density profile through html data-sf-density',
  );
  assert.equal(
    text.includes('export function hydrateUiThemeProfile(): Required<SfThemeProfile> {'),
    true,
    'uiStore should expose theme hydration for startup bootstrap',
  );
  assert.equal(
    text.includes('setThemeColorProfile: (themeColorProfile) =>'),
    true,
    'uiStore should expose runtime color profile switching',
  );
  assert.equal(
    text.includes('setThemeRadiusProfile: (themeRadiusProfile) =>'),
    true,
    'uiStore should expose runtime radius profile switching',
  );
});

test('main bootstrap hydrates theme profile before app render', () => {
  const text = readText(MAIN_TSX);

  assert.equal(
    text.includes("import { hydrateUiThemeProfile } from './stores/uiStore';"),
    true,
    'main.tsx should import uiStore theme hydration helper',
  );
  assert.equal(
    text.includes('hydrateUiThemeProfile();'),
    true,
    'main.tsx should apply persisted theme/radius profile attributes before render',
  );
});

test('pipeline settings surface no longer owns theme and radius selectors', () => {
  const text = readText(PIPELINE_SETTINGS_PAGE);

  assert.equal(
    text.includes('const themeColorProfile = useUiStore((s) => s.themeColorProfile);'),
    false,
    'pipeline settings should not read theme color profile directly after moving appearance controls to global settings panel',
  );
  assert.equal(
    text.includes('const setThemeColorProfile = useUiStore((s) => s.setThemeColorProfile);'),
    false,
    'pipeline settings should not mutate theme color profile directly after moving appearance controls to global settings panel',
  );
  assert.equal(
    text.includes('const themeRadiusProfile = useUiStore((s) => s.themeRadiusProfile);'),
    false,
    'pipeline settings should not read radius profile directly after moving appearance controls to global settings panel',
  );
  assert.equal(
    text.includes('const setThemeRadiusProfile = useUiStore((s) => s.setThemeRadiusProfile);'),
    false,
    'pipeline settings should not mutate radius profile directly after moving appearance controls to global settings panel',
  );
  assert.equal(
    text.includes('SF_THEME_COLOR_PROFILES.map((themeId) =>'),
    false,
    'pipeline settings should not render global theme options directly',
  );
  assert.equal(
    text.includes('SF_THEME_RADIUS_PROFILES.map((radiusId) =>'),
    false,
    'pipeline settings should not render global radius options directly',
  );
  assert.equal(
    text.includes('Appearance'),
    false,
    'pipeline settings header should not render the inline appearance card',
  );
});

test('app shell settings panel owns appearance controls backed by ui store', () => {
  const text = readText(APP_SHELL);

  assert.equal(
    text.includes('const themeColorProfile = useUiStore((s) => s.themeColorProfile);'),
    true,
    'app shell settings panel should read theme color profile from uiStore',
  );
  assert.equal(
    text.includes('const setThemeColorProfile = useUiStore((s) => s.setThemeColorProfile);'),
    true,
    'app shell settings panel should update theme color profile through uiStore',
  );
  assert.equal(
    text.includes('const themeRadiusProfile = useUiStore((s) => s.themeRadiusProfile);'),
    true,
    'app shell settings panel should read radius profile from uiStore',
  );
  assert.equal(
    text.includes('const setThemeRadiusProfile = useUiStore((s) => s.setThemeRadiusProfile);'),
    true,
    'app shell settings panel should update radius profile through uiStore',
  );
  assert.equal(
    text.includes('SF_THEME_COLOR_PROFILES.map((themeId) =>'),
    true,
    'app shell settings panel should render theme options from shared profile contract',
  );
  assert.equal(
    text.includes('SF_THEME_RADIUS_PROFILES.map((radiusId) =>'),
    true,
    'app shell settings panel should render radius options from shared profile contract',
  );
  assert.equal(
    text.includes('Open app settings'),
    true,
    'app shell should expose a settings trigger button in the header',
  );
  assert.equal(
    text.includes('Appearance'),
    true,
    'app shell settings panel should include an appearance section label',
  );
});

test('app shell relies on uiStore theme application instead of direct html class toggles', () => {
  const text = readText(APP_SHELL);

  assert.equal(
    text.includes("document.documentElement.classList.toggle('dark', darkMode);"),
    false,
    'AppShell should not directly mutate html dark class; uiStore owns theme profile application',
  );
});

test('pipeline theme selector surface avoids raw inline color or radius literals', () => {
  const text = readText(PIPELINE_SETTINGS_PAGE);

  assert.equal(
    /#[0-9a-fA-F]{3,8}/.test(text),
    false,
    'pipeline settings theme selector surface should avoid raw hex literals',
  );
  assert.equal(
    /borderRadius\s*:/.test(text),
    false,
    'pipeline settings theme selector surface should avoid inline radius literals',
  );
});
