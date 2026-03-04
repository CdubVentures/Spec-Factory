import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const THEME_CSS = path.resolve('tools/gui-react/src/theme.css');
const APP_SHELL = path.resolve('tools/gui-react/src/components/layout/AppShell.tsx');
const DRAWER_SHELL = path.resolve('tools/gui-react/src/components/common/DrawerShell.tsx');
const DATA_TABLE = path.resolve('tools/gui-react/src/components/common/DataTable.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('theme primitive layer exposes shared surface/form/table/status classes', () => {
  const text = readText(THEME_CSS);

  assert.equal(text.includes('.sf-surface-shell'), true, 'theme should define shell surface primitive');
  assert.equal(text.includes('.sf-surface-panel'), true, 'theme should define panel surface primitive');
  assert.equal(text.includes('.sf-surface-elevated'), true, 'theme should define elevated surface primitive');
  assert.equal(text.includes('.sf-surface-card'), true, 'theme should define card surface primitive');

  assert.equal(text.includes('.sf-input'), true, 'theme should define shared input primitive');
  assert.equal(text.includes('.sf-select'), true, 'theme should define shared select primitive');
  assert.equal(text.includes('.sf-icon-button'), true, 'theme should define shared icon-button primitive');
  assert.equal(text.includes('.sf-action-button'), true, 'theme should define shared action-button primitive');
  assert.equal(text.includes('.sf-primary-button'), true, 'theme should define shared primary-button primitive');
  assert.equal(text.includes('.sf-danger-button'), true, 'theme should define shared danger-button primitive');
  assert.equal(text.includes('.sf-nav-item'), true, 'theme should define shared nav-item primitive');
  assert.equal(text.includes('.sf-nav-item-active'), true, 'theme should define shared nav-item-active primitive');
  assert.equal(text.includes('.sf-nav-item-muted'), true, 'theme should define shared nav-item-muted primitive');
  assert.equal(text.includes('.sf-nav-item:active'), true, 'theme should define shared nav-item press-state primitive');
  assert.equal(text.includes('.sf-nav-item.sf-nav-item-active:hover'), true, 'theme should keep active nav-item styling stable on hover');
  assert.equal(/\.sf-nav-item\s*\{[\s\S]*?box-shadow:/.test(text), true, 'theme should define nav-item tactile shadow styling');
  assert.equal(text.includes('.sf-tab-strip'), true, 'theme should define shared horizontal tab-strip primitive');
  assert.equal(text.includes('.sf-tab-item'), true, 'theme should define shared horizontal tab-item primitive');
  assert.equal(text.includes('.sf-tab-item-active'), true, 'theme should define shared horizontal tab-item-active primitive');
  assert.equal(text.includes('.sf-tab-item.sf-tab-item-active:hover'), true, 'theme should keep active horizontal tab styling stable on hover');
  assert.equal(text.includes('.sf-switch'), true, 'theme should define shared switch primitive');
  assert.equal(text.includes('.sf-switch-on'), true, 'theme should define shared switch-on primitive');
  assert.equal(text.includes('.sf-switch-off'), true, 'theme should define shared switch-off primitive');
  assert.equal(text.includes('.sf-switch-track'), true, 'theme should define shared switch-track primitive');
  assert.equal(text.includes('.sf-switch-track-on'), true, 'theme should define shared switch-track-on primitive');
  assert.equal(text.includes('.sf-switch-thumb'), true, 'theme should define shared switch-thumb primitive');
  assert.equal(text.includes('.sf-status-text-info'), true, 'theme should define shared status text info primitive');
  assert.equal(text.includes('.sf-status-text-warning'), true, 'theme should define shared status text warning primitive');
  assert.equal(text.includes('.sf-status-text-danger'), true, 'theme should define shared status text danger primitive');
  assert.equal(text.includes('.sf-status-text-muted'), true, 'theme should define shared status text muted primitive');

  assert.equal(text.includes('.sf-table-shell'), true, 'theme should define shared table shell primitive');
  assert.equal(text.includes('.sf-table-head-cell'), true, 'theme should define shared table head-cell primitive');
  assert.equal(text.includes('.sf-table-row'), true, 'theme should define shared table row primitive');
  assert.equal(text.includes('.sf-table-empty-state'), true, 'theme should define shared table empty-state primitive');

  assert.equal(text.includes('.sf-status'), true, 'theme should define shared status primitive base');
  assert.equal(text.includes('.sf-status-success'), true, 'theme should define shared success status primitive');
  assert.equal(text.includes('.sf-status-warning'), true, 'theme should define shared warning status primitive');
  assert.equal(text.includes('.sf-status-danger'), true, 'theme should define shared danger status primitive');
  assert.equal(text.includes('.sf-status-info'), true, 'theme should define shared info status primitive');
  assert.equal(text.includes('.sf-chip-success'), true, 'theme should define shared success chip primitive');
  assert.equal(text.includes('.sf-chip-warning'), true, 'theme should define shared warning chip primitive');
  assert.equal(text.includes('.sf-chip-danger'), true, 'theme should define shared danger chip primitive');
  assert.equal(text.includes('.sf-chip-info'), true, 'theme should define shared info chip primitive');
  assert.equal(text.includes('.sf-chip-neutral'), true, 'theme should define shared neutral chip primitive');
  assert.equal(text.includes('.sf-chip-accent'), true, 'theme should define shared accent chip primitive');
  assert.equal(text.includes('.sf-chip-success.rounded'), true, 'theme should pin chip radius through semantic radius token');
  assert.equal(text.includes('.sf-callout'), true, 'theme should define shared callout primitive base');
  assert.equal(text.includes('.sf-callout-success'), true, 'theme should define shared success callout primitive');
  assert.equal(text.includes('.sf-callout-warning'), true, 'theme should define shared warning callout primitive');
  assert.equal(text.includes('.sf-callout-danger'), true, 'theme should define shared danger callout primitive');
  assert.equal(text.includes('.sf-callout-info'), true, 'theme should define shared info callout primitive');
  assert.equal(text.includes('.sf-callout-neutral'), true, 'theme should define shared neutral callout primitive');
  assert.equal(text.includes('.sf-callout-accent'), true, 'theme should define shared accent callout primitive');
  assert.equal(text.includes('.sf-callout.rounded'), true, 'theme should pin callout radius through semantic radius token');
  assert.equal(text.includes('.sf-text-caption'), true, 'theme should define shared caption text primitive');
  assert.equal(text.includes('.sf-text-label'), true, 'theme should define shared label text primitive');
  assert.equal(text.includes('.sf-text-nano'), true, 'theme should define shared nano text primitive');
  assert.equal(text.includes('.sf-text-micro'), true, 'theme should define shared micro text primitive');
});

test('pilot components consume shared primitive classes', () => {
  const appShellText = readText(APP_SHELL);
  const drawerShellText = readText(DRAWER_SHELL);
  const dataTableText = readText(DATA_TABLE);

  assert.equal(appShellText.includes('sf-surface-shell'), true, 'AppShell should use shared shell surface primitive');
  assert.equal(appShellText.includes('sf-icon-button'), true, 'AppShell should use shared icon-button primitive');
  assert.equal(appShellText.includes('sf-status sf-status-warning'), true, 'AppShell warning banner should use shared status primitive');
  assert.equal(appShellText.includes('sf-status sf-status-info'), true, 'AppShell saving banner should use shared status primitive');
  assert.equal(appShellText.includes('sf-status sf-status-danger'), true, 'AppShell error banner should use shared status primitive');

  assert.equal(drawerShellText.includes('sf-surface-panel'), true, 'DrawerShell should use shared panel surface primitive');
  assert.equal(drawerShellText.includes('sf-input'), true, 'DrawerShell should use shared input primitive');

  assert.equal(dataTableText.includes('sf-table-shell'), true, 'DataTable should use shared table shell primitive');
  assert.equal(dataTableText.includes('sf-input'), true, 'DataTable should use shared input primitive');
});

test('theme typography tokens keep readable caption and label baseline', () => {
  const text = readText(THEME_CSS);

  assert.equal(
    text.includes('--sf-token-font-size-caption: 11px;'),
    true,
    'theme caption token should be 11px for readable secondary text',
  );
  assert.equal(
    text.includes('--sf-token-font-size-label: 12px;'),
    true,
    'theme label token should be 12px for readable control/body labels',
  );
});
