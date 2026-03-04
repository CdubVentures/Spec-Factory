import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const APP_SHELL = path.resolve('tools/gui-react/src/components/layout/AppShell.tsx');
const DRAWER_SHELL = path.resolve('tools/gui-react/src/components/common/DrawerShell.tsx');
const DATA_TABLE = path.resolve('tools/gui-react/src/components/common/DataTable.tsx');
const THEME_CSS = path.resolve('tools/gui-react/src/theme.css');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('AppShell pilot uses semantic header/button classes from theme primitives', () => {
  const text = readText(APP_SHELL);

  assert.equal(text.includes('sf-shell-title'), true, 'AppShell title should use semantic title class');
  assert.equal(text.includes('sf-shell-header-control'), true, 'AppShell header settings trigger should use semantic control class');
  assert.equal(text.includes('sf-shell-header-drawer'), true, 'AppShell header drawer should use semantic drawer shell class');
  assert.equal(text.includes('sf-shell-header-drawer-toggle'), true, 'AppShell header drawer chevron should use semantic toggle class');
  assert.equal(text.includes('sf-shell-field-test-button-active'), true, 'AppShell should use semantic active state class for field test button');
  assert.equal(text.includes('sf-shell-field-test-button-idle'), true, 'AppShell should use semantic idle state class for field test button');
  assert.equal(text.includes('Open app settings'), true, 'AppShell should render a settings trigger in the header');
  assert.match(
    text,
    /<header className="[^"]*\bsf-shell-header\b[^"]*\bz-30\b[^"]*">/,
    'AppShell header should keep a higher stacking layer so the settings panel is visible above tab navigation',
  );
  assert.match(
    text,
    /className="[^"]*\bsf-shell-header-control\b[^"]*\binline-flex\b[^"]*\bh-8\b[^"]*\bw-8\b[^"]*"/,
    'settings trigger should use fixed h-8/w-8 sizing',
  );
  assert.match(
    text,
    /className="[^"]*\bsf-shell-header-drawer-toggle\b[^"]*\binline-flex\b[^"]*\bh-8\b[^"]*\bw-8\b[^"]*"/,
    'drawer chevron trigger should use fixed h-8/w-8 sizing',
  );
  assert.equal(
    text.includes('sf-icon-button sf-shell-header-drawer-toggle'),
    false,
    'drawer chevron trigger should not stack sf-icon-button border over drawer shell border',
  );
});

test('DrawerShell pilot uses semantic drawer primitives and removes arbitrary text sizing drift', () => {
  const text = readText(DRAWER_SHELL);

  assert.equal(text.includes('sf-primitive-panel sf-drawer-shell'), true, 'DrawerShell root should use panel primitive + drawer shell class');
  assert.equal(text.includes('sf-drawer-header'), true, 'DrawerShell should use semantic header class');
  assert.equal(text.includes('sf-drawer-subtitle'), true, 'DrawerShell subtitle should use semantic typography class');
  assert.equal(text.includes('sf-drawer-close'), true, 'DrawerShell close button should use semantic control class');
  assert.equal(text.includes('sf-drawer-section-label'), true, 'Drawer section labels should use semantic label class');
  assert.equal(text.includes('sf-drawer-card'), true, 'Drawer cards should use semantic card class');
  assert.equal(text.includes('sf-drawer-action-stack'), true, 'Drawer action stack should use semantic stack class');
  assert.equal(text.includes('sf-primitive-input sf-drawer-input'), true, 'Drawer manual input should use semantic input primitive');
  assert.equal(text.includes('sf-drawer-apply-button'), true, 'Drawer apply button should use semantic action class');

  assert.equal(text.includes('text-[10px]'), false, 'DrawerShell should not keep text-[10px] literal classes after pilot migration');
  assert.equal(text.includes('text-[9px]'), false, 'DrawerShell should not keep text-[9px] literal classes after pilot migration');
});

test('DataTable pilot uses semantic table primitives and removes arbitrary header text sizing drift', () => {
  const text = readText(DATA_TABLE);

  assert.equal(text.includes('sf-primitive-input sf-table-search-input'), true, 'DataTable search input should use semantic primitive/input class');
  assert.equal(text.includes('sf-primitive-table-shell'), true, 'DataTable shell should use semantic table primitive');
  assert.equal(text.includes('sf-table-head'), true, 'DataTable head should use semantic head class');
  assert.equal(text.includes('sf-table-head-cell'), true, 'DataTable head cell should use semantic typography class');
  assert.equal(text.includes('sf-table-row'), true, 'DataTable rows should use semantic row class');
  assert.equal(text.includes('sf-table-expanded-row'), true, 'DataTable expanded row should use semantic expanded class');
  assert.equal(text.includes('sf-table-empty-state'), true, 'DataTable empty state should use semantic empty-state class');

  assert.equal(text.includes('text-[10px]'), false, 'DataTable should not keep text-[10px] literal classes after pilot migration');
});

test('theme.css defines pilot semantic classes for app shell, drawer shell, and data table', () => {
  const text = readText(THEME_CSS);

  assert.equal(text.includes('.sf-shell-title'), true, 'theme.css should define app-shell title semantic class');
  assert.equal(text.includes('.sf-shell-header-control'), true, 'theme.css should define app-shell control semantic class');
  assert.equal(text.includes('.sf-shell-header-drawer'), true, 'theme.css should define app-shell header drawer semantic class');
  assert.equal(text.includes('.sf-shell-header-drawer-toggle'), true, 'theme.css should define app-shell drawer toggle semantic class');
  assert.equal(text.includes('.sf-shell-settings-panel'), true, 'theme.css should define app-shell settings panel semantic class');
  assert.equal(text.includes('.sf-shell-settings-title'), true, 'theme.css should define app-shell settings panel title semantic class');
  assert.equal(text.includes('.sf-shell-settings-grid'), true, 'theme.css should define app-shell settings panel option grid semantic class');
  assert.equal(text.includes('.sf-shell-field-test-button-active'), true, 'theme.css should define app-shell active field-test class');
  assert.equal(text.includes('.sf-shell-field-test-button-idle'), true, 'theme.css should define app-shell idle field-test class');
  assert.equal(
    text.includes('.sf-shell-header-drawer {\n  border: 1px solid rgb(var(--sf-color-border-subtle-rgb) / 0.5);\n  background: rgb(var(--sf-color-surface-elevated-rgb));\n  box-shadow: none;'),
    true,
    'app-shell header drawer should be opaque with no depth shadow in light theme',
  );
  assert.equal(
    text.includes("html[data-sf-theme='dark'] .sf-shell-header-drawer {\n  border-color: rgb(var(--sf-color-border-subtle-rgb) / 0.82);\n  background: rgb(var(--sf-color-panel-rgb));\n  box-shadow: none;"),
    true,
    'app-shell header drawer should be opaque with no depth shadow in dark theme',
  );

  assert.equal(text.includes('.sf-drawer-shell'), true, 'theme.css should define drawer-shell semantic class');
  assert.equal(text.includes('.sf-drawer-header'), true, 'theme.css should define drawer-header semantic class');
  assert.equal(text.includes('.sf-drawer-subtitle'), true, 'theme.css should define drawer-subtitle semantic class');
  assert.equal(text.includes('.sf-drawer-close'), true, 'theme.css should define drawer-close semantic class');
  assert.equal(text.includes('.sf-drawer-section-label'), true, 'theme.css should define drawer section label semantic class');
  assert.equal(text.includes('.sf-drawer-card'), true, 'theme.css should define drawer-card semantic class');
  assert.equal(text.includes('.sf-drawer-action-stack'), true, 'theme.css should define drawer action stack semantic class');
  assert.equal(text.includes('.sf-drawer-input'), true, 'theme.css should define drawer input semantic class');
  assert.equal(text.includes('.sf-drawer-apply-button'), true, 'theme.css should define drawer apply button semantic class');

  assert.equal(text.includes('.sf-table-search-input'), true, 'theme.css should define table search-input semantic class');
  assert.equal(text.includes('.sf-table-head'), true, 'theme.css should define table head semantic class');
  assert.equal(text.includes('.sf-table-head-cell'), true, 'theme.css should define table head-cell semantic class');
  assert.equal(text.includes('.sf-table-row'), true, 'theme.css should define table row semantic class');
  assert.equal(text.includes('.sf-table-expanded-row'), true, 'theme.css should define table expanded-row semantic class');
  assert.equal(text.includes('.sf-table-empty-state'), true, 'theme.css should define table empty-state semantic class');
});
