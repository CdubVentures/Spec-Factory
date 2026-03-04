import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ACTION_TOOLTIP_PATH = path.resolve('tools/gui-react/src/components/common/ActionTooltip.tsx');
const CELL_DRAWER_PATH = path.resolve('tools/gui-react/src/components/common/CellDrawer.tsx');
const DRAWER_SHELL_PATH = path.resolve('tools/gui-react/src/components/common/DrawerShell.tsx');
const REVIEW_PAGE_PATH = path.resolve('tools/gui-react/src/pages/review/ReviewPage.tsx');
const COMPONENT_SUBTAB_PATH = path.resolve('tools/gui-react/src/pages/component-review/ComponentSubTab.tsx');
const COMPONENT_PANEL_PATH = path.resolve('tools/gui-react/src/pages/component-review/ComponentReviewPanel.tsx');
const COMPONENT_DRAWER_PATH = path.resolve('tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx');
const ENUM_SUBTAB_PATH = path.resolve('tools/gui-react/src/pages/component-review/EnumSubTab.tsx');
const THEME_PATH = path.resolve('tools/gui-react/src/theme.css');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssBlock(cssText, selector) {
  const pattern = new RegExp(`${escapeRegex(selector)}\\s*\\{([\\s\\S]*?)\\}`);
  const match = cssText.match(pattern);
  return match ? match[1] : '';
}

test('action tooltip primitive exists with shared themed styling', () => {
  assert.equal(
    fs.existsSync(ACTION_TOOLTIP_PATH),
    true,
    'ActionTooltip primitive should exist for action-button hover help',
  );

  const actionTooltipText = fs.existsSync(ACTION_TOOLTIP_PATH)
    ? fs.readFileSync(ACTION_TOOLTIP_PATH, 'utf8')
    : '';
  const themeText = fs.readFileSync(THEME_PATH, 'utf8');

  assert.equal(
    actionTooltipText.includes("import * as Tooltip from '@radix-ui/react-tooltip';"),
    true,
    'ActionTooltip should use Radix tooltip primitives (not browser title tooltips)',
  );
  assert.equal(
    actionTooltipText.includes('sf-action-tooltip'),
    true,
    'ActionTooltip should use shared tooltip class contract',
  );
  assert.equal(
    themeText.includes('.sf-action-tooltip {'),
    true,
    'theme.css should define shared styled tooltip surface',
  );
  assert.equal(
    themeText.includes('.sf-action-tooltip-arrow {'),
    true,
    'theme.css should define shared styled tooltip arrow',
  );
});

test('action tooltip skin uses semantic tokens (theme-proof)', () => {
  const themeText = fs.readFileSync(THEME_PATH, 'utf8');
  const tooltipBlock = cssBlock(themeText, '.sf-action-tooltip');
  const darkTooltipBlock = cssBlock(themeText, "html[data-sf-theme='dark'] .sf-action-tooltip");

  assert.equal(
    tooltipBlock.length > 0,
    true,
    'theme should define .sf-action-tooltip block',
  );
  assert.match(
    tooltipBlock,
    /padding:\s*var\(--sf-space-2\)\s*var\(--sf-space-2-5\);/,
    'tooltip spacing should come from semantic spacing tokens',
  );
  assert.match(
    tooltipBlock,
    /border:\s*1px solid rgb\(var\(--sf-color-border-subtle-rgb\)\s*\/\s*0\.55\);/,
    'tooltip border should be driven by semantic border token',
  );
  assert.equal(
    /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})/i.test(tooltipBlock),
    false,
    'tooltip block should avoid hardcoded hex colors to remain theme-proof',
  );
  assert.equal(
    darkTooltipBlock.length > 0,
    true,
    'dark theme should define tooltip override block',
  );
});

test('target action buttons avoid native title tooltips', () => {
  const cellDrawerText = fs.readFileSync(CELL_DRAWER_PATH, 'utf8');
  const reviewPageText = fs.readFileSync(REVIEW_PAGE_PATH, 'utf8');
  const componentSubTabText = fs.readFileSync(COMPONENT_SUBTAB_PATH, 'utf8');
  const enumSubTabText = fs.readFileSync(ENUM_SUBTAB_PATH, 'utf8');

  assert.equal(
    cellDrawerText.includes('title={confirmPrimaryTitle}'),
    false,
    'CellDrawer confirm item actions should not use native title tooltips',
  );
  assert.equal(
    cellDrawerText.includes('title={confirmSharedTitle}'),
    false,
    'CellDrawer confirm shared actions should not use native title tooltips',
  );
  assert.equal(
    cellDrawerText.includes('title={acceptCurrentTitle}'),
    false,
    'CellDrawer accept current action should not use native title tooltips',
  );
  assert.equal(
    cellDrawerText.includes('title={acceptThisCandidateTitle}'),
    false,
    'CellDrawer accept candidate action should not use native title tooltips',
  );
  assert.equal(
    reviewPageText.includes('title="Ctrl+A: Approve all green cells"'),
    false,
    'Review top-level approve should not use native title tooltip',
  );
  assert.equal(
    componentSubTabText.includes('title={hasPending'),
    false,
    'ComponentSubTab Run AI actions should not use native title tooltips',
  );
  assert.equal(
    enumSubTabText.includes('title="Apply enum consistency normalization'),
    false,
    'Enum consistency action should not use native title tooltip',
  );
  assert.equal(
    enumSubTabText.includes('title="Run AI Review across enum values'),
    false,
    'Enum Run AI Review action should not use native title tooltip',
  );
  assert.equal(
    enumSubTabText.includes('title="Run AI review for list/component pending matches'),
    false,
    'Enum row AI action should not use native title tooltip',
  );
});

test('review and component action surfaces use shared ActionTooltip wrapper', () => {
  const cellDrawerText = fs.readFileSync(CELL_DRAWER_PATH, 'utf8');
  const drawerShellText = fs.readFileSync(DRAWER_SHELL_PATH, 'utf8');
  const reviewPageText = fs.readFileSync(REVIEW_PAGE_PATH, 'utf8');
  const componentSubTabText = fs.readFileSync(COMPONENT_SUBTAB_PATH, 'utf8');
  const componentPanelText = fs.readFileSync(COMPONENT_PANEL_PATH, 'utf8');
  const componentDrawerText = fs.readFileSync(COMPONENT_DRAWER_PATH, 'utf8');
  const enumSubTabText = fs.readFileSync(ENUM_SUBTAB_PATH, 'utf8');

  assert.equal(
    cellDrawerText.includes('ActionTooltip'),
    true,
    'CellDrawer should wrap run-ai/accept/confirm actions with ActionTooltip',
  );
  assert.equal(
    drawerShellText.includes('ActionTooltip'),
    true,
    'DrawerShell apply action should use ActionTooltip',
  );
  assert.equal(
    reviewPageText.includes('ActionTooltip'),
    true,
    'ReviewPage approve/finalize actions should use ActionTooltip',
  );
  assert.equal(
    componentSubTabText.includes('ActionTooltip'),
    true,
    'ComponentSubTab run-ai actions should use ActionTooltip',
  );
  assert.equal(
    componentPanelText.includes('ActionTooltip'),
    true,
    'ComponentReviewPanel run-ai batch action should use ActionTooltip',
  );
  assert.equal(
    componentDrawerText.includes('ActionTooltip'),
    true,
    'ComponentReviewDrawer apply/accept actions should use ActionTooltip',
  );
  assert.equal(
    enumSubTabText.includes('ActionTooltip'),
    true,
    'EnumSubTab consistency/run-ai actions should use ActionTooltip',
  );
});
