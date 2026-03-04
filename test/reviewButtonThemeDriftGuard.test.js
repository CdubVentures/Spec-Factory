import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CELL_DRAWER_PATH = path.resolve('tools/gui-react/src/components/common/CellDrawer.tsx');
const REVIEW_COMPONENT_SUBTAB_PATH = path.resolve('tools/gui-react/src/pages/component-review/ComponentSubTab.tsx');
const REVIEW_ENUM_SUBTAB_PATH = path.resolve('tools/gui-react/src/pages/component-review/EnumSubTab.tsx');
const REVIEW_COMPONENT_PANEL_PATH = path.resolve('tools/gui-react/src/pages/component-review/ComponentReviewPanel.tsx');
const REVIEW_COMPONENT_DRAWER_PATH = path.resolve('tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx');
const REVIEW_PAGE_PATH = path.resolve('tools/gui-react/src/pages/review/ReviewPage.tsx');
const REVIEW_BRAND_FILTER_BAR_PATH = path.resolve('tools/gui-react/src/pages/review/BrandFilterBar.tsx');
const REVIEW_CELL_TOOLTIP_PATH = path.resolve('tools/gui-react/src/pages/review/CellTooltip.tsx');
const DRAWER_SHELL_PATH = path.resolve('tools/gui-react/src/components/common/DrawerShell.tsx');
const THEME_PATH = path.resolve('tools/gui-react/src/theme.css');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssBlock(cssText, selector) {
  const pattern = new RegExp(`${escapeRegex(selector)}\\s*\\{([\\s\\S]*?)\\}`);
  const match = cssText.match(pattern);
  return match ? match[1] : '';
}

const RAW_COLOR_UTILITY_PATTERN = /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;

test('review drawers map item/shared accept+confirm lanes to dedicated primitives', () => {
  const text = fs.readFileSync(CELL_DRAWER_PATH, 'utf8');

  assert.equal(
    text.includes("const acceptButtonClass = candidateUiContext === 'grid'\n    ? 'sf-item-accept-button'\n    : 'sf-shared-accept-button';"),
    true,
    'accept actions should split item/shared lanes via dedicated primitives',
  );
  assert.equal(
    text.includes("const confirmSharedButtonClass = 'sf-shared-confirm-button';"),
    true,
    'shared confirm actions should use dedicated shared confirm primitive',
  );
  assert.equal(
    text.includes("const confirmSharedButtonClass = 'bg-purple-600 hover:bg-purple-700';"),
    false,
    'shared confirm actions should not use hardcoded purple button bundles',
  );
  assert.equal(
    text.includes("? 'bg-accent hover:bg-blue-600'\n    : 'bg-violet-600 hover:bg-violet-700'"),
    false,
    'accept actions should not split between accent and violet hardcoded bundles',
  );
  assert.equal(
    text.includes("{isActiveAccepted ? 'Accepted' : 'Accept'}"),
    true,
    'item accept action should read \"Accepted\" once that candidate is accepted',
  );
  assert.equal(
    text.includes("{isSharedAccepted ? 'Accepted' : 'Accept Shared'}"),
    true,
    'shared accept action should read \"Accepted\" once that candidate is accepted',
  );
  assert.equal(
    text.includes('Accepted Shared'),
    false,
    'shared accepted badge copy should be standardized to \"Accepted\"',
  );
});

test('review grid pending-ai labels and pending lane visuals are unified to light purple', () => {
  const text = fs.readFileSync(CELL_DRAWER_PATH, 'utf8');

  assert.equal(
    text.includes('Item AI Review: Pending (candidate-scoped)'),
    false,
    'item lane pending banner should not keep item-specific copy',
  );
  assert.equal(
    text.includes('Shared AI Review: Pending (candidate-scoped)'),
    false,
    'shared lane pending banner should not keep shared-specific copy',
  );
  assert.equal(
    (text.match(/AI Pending/g) || []).length >= 3,
    true,
    'pending lane copy should be unified to \"AI Pending\" across banners and badges',
  );
  assert.equal(
    text.includes('border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/10'),
    false,
    'candidate pending tint should not use orange in grid lane',
  );
  assert.equal(
    text.includes("return 'sf-review-candidate-pending';"),
    true,
    'candidate pending tint should use light purple background lane',
  );
  assert.equal(
    text.includes("const confirmPrimaryBannerClass = candidateUiContext === 'grid'\n    ? 'text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20'"),
    false,
    'primary pending banner should not use orange styling',
  );
  assert.equal(
    text.includes("const confirmPrimaryBannerClass = 'sf-review-ai-pending-banner';"),
    true,
    'primary pending banner should use light purple styling to match consistency lane',
  );
  assert.equal(
    text.includes("const confirmPrimaryBadgeClass = 'sf-review-ai-pending-badge';"),
    true,
    'primary pending badge should use light purple styling to match consistency lane',
  );
  assert.equal(
    text.includes('AI Item'),
    false,
    'item-specific pending badge copy should be removed',
  );
  assert.equal(
    text.includes('AI Shared Pending'),
    false,
    'shared-specific pending badge copy should be removed',
  );
});

test('run ai actions are consistently purple across review grid and component review surfaces', () => {
  const cellDrawerText = fs.readFileSync(CELL_DRAWER_PATH, 'utf8');
  const componentSubTabText = fs.readFileSync(REVIEW_COMPONENT_SUBTAB_PATH, 'utf8');
  const enumSubTabText = fs.readFileSync(REVIEW_ENUM_SUBTAB_PATH, 'utf8');
  const panelText = fs.readFileSync(REVIEW_COMPONENT_PANEL_PATH, 'utf8');

  assert.equal(
    cellDrawerText.includes('sf-run-ai-button'),
    true,
    'review grid drawer Run AI Review should use shared purple AI button primitive',
  );
  assert.equal(
    componentSubTabText.includes('sf-run-ai-button'),
    true,
    'component review grid Run AI actions should use shared purple AI button primitive',
  );
  assert.equal(
    enumSubTabText.includes('sf-run-ai-button'),
    true,
    'enum review Run AI actions should use shared purple AI button primitive',
  );
  assert.equal(
    panelText.includes('sf-run-ai-button'),
    true,
    'component review panel Run AI Review All should use shared purple AI button primitive',
  );
  assert.equal(
    enumSubTabText.includes("{aiPending ? '...' : 'Run AI'}"),
    true,
    'enum row action label should be "Run AI"',
  );
  assert.equal(
    enumSubTabText.includes("{aiPending ? '...' : 'AI'}"),
    false,
    'enum row action label should not collapse to "AI"',
  );
  assert.equal(
    cellDrawerText.includes('bg-teal-600 text-white hover:bg-teal-700'),
    false,
    'review grid drawer should not use teal Run AI button bundles',
  );
});

test('theme defines run-ai and lane-specific accept/confirm primitives', () => {
  const themeText = fs.readFileSync(THEME_PATH, 'utf8');
  const requiredTokens = [
    '.sf-run-ai-button {',
    '.sf-run-ai-button:hover {',
    '.sf-item-accept-button {',
    '.sf-shared-accept-button {',
    '.sf-shared-confirm-button {',
    '.sf-confirm-button-solid {',
  ];
  const missing = requiredTokens.filter((token) => !themeText.includes(token));
  assert.deepEqual(
    missing,
    [],
    `theme should define stable purple AI button primitive: ${JSON.stringify(missing)}`,
  );
});

test('theme lane colors enforce blue accepts, orange confirms, purple run-ai', () => {
  const themeText = fs.readFileSync(THEME_PATH, 'utf8');
  const rootBlock = cssBlock(themeText, ':root');
  const darkBlock = cssBlock(themeText, "html[data-sf-theme='dark']");

  assert.match(
    rootBlock,
    /--sf-token-state-run-ai-fg:\s*#9333ea;/i,
    'default run-ai token must remain purple #9333EA in :root',
  );
  assert.match(
    rootBlock,
    /--sf-token-state-item-accept-fg:\s*#3b82f6;/i,
    'default item-accept token must remain blue #3B82F6 in :root',
  );
  assert.match(
    rootBlock,
    /--sf-token-state-shared-accept-fg:\s*#3b82f6;/i,
    'default shared-accept token must remain blue #3B82F6 in :root',
  );
  assert.match(
    rootBlock,
    /--sf-token-state-confirm-fg:\s*#ea580c;/i,
    'default confirm token must remain orange #EA580C in :root',
  );
  assert.match(
    rootBlock,
    /--sf-token-state-shared-confirm-fg:\s*#ea580c;/i,
    'default shared-confirm token must remain orange #EA580C in :root',
  );

  const darkTokens = [
    '--sf-token-state-run-ai-fg',
    '--sf-token-state-item-accept-fg',
    '--sf-token-state-shared-accept-fg',
    '--sf-token-state-confirm-fg',
    '--sf-token-state-shared-confirm-fg',
  ];
  const missingDarkTokens = darkTokens.filter((token) => !new RegExp(`${escapeRegex(token)}\\s*:\\s*[^;]+;`, 'i').test(darkBlock));
  assert.deepEqual(
    missingDarkTokens,
    [],
    `dark theme should define lane token overrides (value can vary per theme): ${JSON.stringify(missingDarkTokens)}`,
  );
});

test('drawer candidate lane states preserve tinted pending/accepted backgrounds', () => {
  const themeText = fs.readFileSync(THEME_PATH, 'utf8');
  const requiredTokens = [
    '.sf-drawer-card.sf-review-candidate-pending {',
    "html[data-sf-theme='dark'] .sf-drawer-card.sf-review-candidate-pending {",
    '.sf-drawer-card.sf-review-candidate-accepted {',
  ];
  const missing = requiredTokens.filter((token) => !themeText.includes(token));
  assert.deepEqual(
    missing,
    [],
    `drawer candidate lane backgrounds must stay visible for pending/accepted states: ${JSON.stringify(missing)}`,
  );
});

test('review lane button primitives are wired to semantic theme vars (theme-proof)', () => {
  const themeText = fs.readFileSync(THEME_PATH, 'utf8');
  const blockExpectations = [
    { selector: '.sf-run-ai-button', declaration: 'background: var(--sf-state-run-ai-fg);' },
    { selector: '.sf-item-accept-button', declaration: 'background: var(--sf-state-item-accept-fg);' },
    { selector: '.sf-shared-accept-button', declaration: 'background: var(--sf-state-shared-accept-fg);' },
    { selector: '.sf-confirm-button-solid', declaration: 'background: var(--sf-state-confirm-fg);' },
    { selector: '.sf-shared-confirm-button', declaration: 'background: var(--sf-state-shared-confirm-fg);' },
  ];

  const missing = blockExpectations.filter(({ selector, declaration }) => {
    const block = cssBlock(themeText, selector);
    return !block || !block.includes(declaration);
  });

  assert.deepEqual(
    missing,
    [],
    `button primitives should reference semantic vars so only theme token values change: ${JSON.stringify(missing)}`,
  );

  const hardcodedHexInPrimitiveBlocks = blockExpectations.reduce((acc, { selector }) => {
    const block = cssBlock(themeText, selector);
    if (!/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})/i.test(block)) return acc;
    acc.push(selector);
    return acc;
  }, []);
  assert.deepEqual(
    hardcodedHexInPrimitiveBlocks,
    [],
    `review lane button primitive blocks should avoid hardcoded hex colors: ${JSON.stringify(hardcodedHexInPrimitiveBlocks)}`,
  );
});

test('enum consistency controls use soft purple buttons with styled action tooltips', () => {
  const enumSubTabText = fs.readFileSync(REVIEW_ENUM_SUBTAB_PATH, 'utf8');
  const themeText = fs.readFileSync(THEME_PATH, 'utf8');

  assert.equal(
    enumSubTabText.includes('sf-llm-soft-button'),
    true,
    'Consistency action should use soft purple button primitive',
  );
  assert.equal(
    enumSubTabText.includes('sf-run-ai-button'),
    true,
    'Run AI Review action should use shared purple AI button primitive',
  );
  assert.equal(
    enumSubTabText.includes('sf-llm-soft-badge'),
    false,
    'LLM badge chip should be removed from enum toolbar',
  );
  assert.equal(
    enumSubTabText.includes('<Tip text='),
    false,
    'Question-mark helper tooltip should be removed from enum toolbar',
  );
  assert.equal(
    enumSubTabText.includes('ActionTooltip text="Apply enum consistency normalization using configured format rules. Uses Key Navigator placeholders like XXXX and YYYY when available."'),
    true,
    'Consistency button should expose styled shared ActionTooltip help',
  );
  assert.equal(
    enumSubTabText.includes('ActionTooltip text="Run AI Review across enum values with pending shared/component matches. This does not change accepted values until you accept or confirm."'),
    true,
    'Run AI Review button should expose styled shared ActionTooltip help',
  );
  assert.equal(
    enumSubTabText.includes('title="Apply enum consistency normalization'),
    false,
    'Consistency button should not rely on native browser title tooltips',
  );
  assert.equal(
    enumSubTabText.includes('title="Run AI Review across enum values'),
    false,
    'Run AI Review button should not rely on native browser title tooltips',
  );
  assert.equal(
    themeText.includes('.sf-llm-soft-button {'),
    true,
    'theme should define soft purple consistency button primitive',
  );
});

test('drawer apply button uses light blue style and becomes solid blue on hover', () => {
  const drawerShellText = fs.readFileSync(DRAWER_SHELL_PATH, 'utf8');
  const componentDrawerText = fs.readFileSync(REVIEW_COMPONENT_DRAWER_PATH, 'utf8');
  const themeText = fs.readFileSync(THEME_PATH, 'utf8');

  assert.equal(
    drawerShellText.includes('className="sf-drawer-apply-button px-3 py-1 text-sm disabled:opacity-50"'),
    true,
    'drawer apply action should continue using sf-drawer-apply-button primitive',
  );
  assert.equal(
    themeText.includes('.sf-drawer-apply-button {'),
    true,
    'theme should define drawer apply button primitive',
  );
  assert.equal(
    themeText.includes('background: rgb(var(--sf-color-accent-rgb) / 0.12);'),
    true,
    'drawer apply base style should be light blue (not solid)',
  );
  assert.equal(
    themeText.includes('.sf-drawer-apply-button:hover {'),
    true,
    'theme should define drawer apply hover state',
  );
  assert.equal(
    themeText.includes('background: rgb(var(--sf-color-accent-rgb));'),
    true,
    'drawer apply hover should become solid blue',
  );
  assert.equal(
    /\.sf-drawer-apply-button\s*\{[\s\S]*cursor:\s*pointer;/.test(themeText),
    true,
    'drawer apply button should show hand cursor when enabled',
  );
  assert.equal(
    componentDrawerText.includes('className="px-3 py-1 text-sm sf-drawer-apply-button rounded disabled:opacity-50"'),
    true,
    'component review Apply action should use soft blue drawer apply primitive',
  );
});

test('flagged only toggle uses the same toggle style contract as debug/show-details controls', () => {
  const reviewPageText = fs.readFileSync(REVIEW_PAGE_PATH, 'utf8');

  assert.equal(
    /showOnlyFlagged[\s\S]*\?\s*'sf-chip-info sf-border-default'[\s\S]*:\s*'sf-icon-button'/.test(reviewPageText),
    true,
    'Flagged Only should use info-chip active state and icon-button inactive state like shared toggle controls',
  );
  assert.equal(
    reviewPageText.includes("Flagged Only {showOnlyFlagged ? 'ON' : 'OFF'}"),
    true,
    'Flagged Only should display explicit ON/OFF toggle state like debug controls',
  );
});

test('top-level action drawer groups approve/finalize controls with solid semantic primitives', () => {
  const reviewPageText = fs.readFileSync(REVIEW_PAGE_PATH, 'utf8');
  const componentDrawerText = fs.readFileSync(REVIEW_COMPONENT_DRAWER_PATH, 'utf8');
  const themeText = fs.readFileSync(THEME_PATH, 'utf8');

  assert.equal(
    reviewPageText.includes('sf-review-actions-drawer'),
    true,
    'Review top-level action group should render as a drawer shell',
  );
  assert.equal(
    reviewPageText.includes("reviewActionsDrawerOpen ? 'w-[20rem]' : 'w-7'"),
    true,
    'Review top-level action drawer should use compact open/closed sizing',
  );
  assert.equal(
    /allGreensAccepted \? 'sf-success-button-solid' : 'sf-primary-button'/.test(reviewPageText),
    true,
    'Approve should be blue by default and switch to solid green in Approved state',
  );
  assert.equal(
    reviewPageText.includes('className="sf-review-actions-drawer-button h-6 flex-1 min-w-0 px-2.5 rounded sf-confirm-button-solid disabled:opacity-50"'),
    true,
    'Finalize should use solid confirm primitive (orange)',
  );
  assert.equal(
    (reviewPageText.match(/h-6 flex-1 min-w-0 px-2\.5 rounded/g) || []).length >= 2,
    true,
    'Approve and Finalize should each be 50% width and fill drawer content',
  );
  assert.equal(
    reviewPageText.includes('Finalize All'),
    false,
    'Review action drawer should not expose Finalize All action',
  );
  assert.equal(
    /disabled=\{allGreensAccepted\}/.test(reviewPageText),
    true,
    'Approve should be non-clickable in Approved state',
  );
  assert.equal(
    reviewPageText.includes('className="px-2 py-1 text-[10px] sf-primary-button rounded disabled:opacity-50"'),
    false,
    'Review top-level finalize actions should no longer use primary-blue standalone buttons',
  );
  assert.equal(
    themeText.includes('.sf-review-actions-approve-button {') || themeText.includes('.sf-review-actions-finalize-button {'),
    false,
    'theme should not keep stale review-only lane button classes once semantic primitives are used',
  );
  assert.equal(
    themeText.includes('.sf-review-actions-drawer {\n  border: 1px solid rgb(var(--sf-color-border-subtle-rgb) / 0.62);\n  background: rgb(var(--sf-color-surface-elevated-rgb));\n  box-shadow: none;'),
    true,
    'review action drawer should be opaque and have no depth shadow in light theme',
  );
  assert.equal(
    themeText.includes("html[data-sf-theme='dark'] .sf-review-actions-drawer {\n  border-color: rgb(var(--sf-color-border-subtle-rgb) / 0.82);\n  background: rgb(var(--sf-color-panel-rgb));\n  box-shadow: none;"),
    true,
    'review action drawer should be opaque and have no depth shadow in dark theme',
  );
  assert.equal(
    componentDrawerText.includes('className="w-full px-3 py-1.5 sf-text-label font-medium rounded sf-drawer-apply-button disabled:opacity-50"'),
    true,
    'Component review top-level Accept All Values + Approve should keep soft-blue apply style',
  );
  assert.equal(
    reviewPageText.includes("ActionTooltip text={allGreensAccepted ? 'All green cells in view are already accepted.' : 'Approve all pending green cells in view. Shortcut: Ctrl+A.'}"),
    true,
    'Approve should provide contextual tooltip copy for pending vs already-approved state',
  );
  assert.equal(
    reviewPageText.includes("selectedProductId\n                        ? 'Finalize the selected product and lock the current review decisions.'\n                        : 'Select a product to enable Finalize.'"),
    true,
    'Finalize should provide clear tooltip guidance and selected-product context',
  );
});

test('review top-bar action labels and compact heights are standardized', () => {
  const reviewPageText = fs.readFileSync(REVIEW_PAGE_PATH, 'utf8');

  assert.equal(
    reviewPageText.includes('Approve'),
    true,
    'Approve action label should be "Approve"',
  );
  assert.equal(
    reviewPageText.includes('Aprove'),
    false,
    'Misspelled approve label should not remain',
  );
  assert.equal(
    reviewPageText.includes('Finalize {activeProduct?.identity.brand} {activeProduct?.identity.model}'),
    false,
    'Finalize selected label should be compact and not include brand/model',
  );
  assert.equal(
    reviewPageText.includes('Finalize'),
    true,
    'Finalize selected label should be "Finalize"',
  );
  assert.equal(
    reviewPageText.includes('Finalize All'),
    false,
    'Finalize all label should not remain in review top actions',
  );
  assert.equal(
    reviewPageText.includes("className={`sf-review-actions-drawer-button h-6 flex-1 min-w-0 px-2.5 rounded disabled:opacity-50 ${"),
    true,
    'Approve/Finalize controls should use full-width split sizing in drawer',
  );
  assert.equal(
    reviewPageText.includes("{allGreensAccepted ? 'Approved' : 'Approve'}"),
    true,
    'Approve label should become Approved once all greens are accepted',
  );
});

test('review grid and component surfaces reduce raw utility color drift in prioritized files', () => {
  const scanTargets = [
    { path: 'tools/gui-react/src/pages/review/ReviewPage.tsx', max: 0 },
    { path: 'tools/gui-react/src/pages/review/ReviewMatrix.tsx', max: 0 },
    { path: 'tools/gui-react/src/pages/review/BrandFilterBar.tsx', max: 0 },
    { path: 'tools/gui-react/src/pages/review/CellTooltip.tsx', max: 0 },
    { path: 'tools/gui-react/src/components/common/CellDrawer.tsx', max: 0 },
    { path: 'tools/gui-react/src/pages/component-review/ComponentSubTab.tsx', max: 0 },
  ];

  const offenders = scanTargets.reduce((acc, target) => {
    const text = fs.readFileSync(path.resolve(target.path), 'utf8');
    const tokens = [...new Set(text.match(RAW_COLOR_UTILITY_PATTERN) || [])].sort();
    if (tokens.length <= target.max) return acc;
    acc.push({
      file: target.path,
      count: tokens.length,
      max: target.max,
      sample: tokens.slice(0, 20),
    });
    return acc;
  }, []);

  assert.deepEqual(
    offenders,
    [],
    `reduce raw utility color drift in review/component priority files: ${JSON.stringify(offenders)}`,
  );
});

test('review brand filter and cell tooltip use semantic primitive class hooks', () => {
  const brandFilterBarText = fs.readFileSync(REVIEW_BRAND_FILTER_BAR_PATH, 'utf8');
  const cellTooltipText = fs.readFileSync(REVIEW_CELL_TOOLTIP_PATH, 'utf8');
  const themeText = fs.readFileSync(THEME_PATH, 'utf8');

  const requiredBrandFilterTokens = [
    'sf-review-brand-filter-bar',
    'sf-review-brand-filter-toggle',
    'sf-review-brand-filter-brand',
    'sf-review-brand-filter-separator',
  ];
  const missingBrandFilterTokens = requiredBrandFilterTokens.filter((token) => !brandFilterBarText.includes(token));
  assert.deepEqual(
    missingBrandFilterTokens,
    [],
    `review brand filter should use semantic class hooks: ${JSON.stringify(missingBrandFilterTokens)}`,
  );

  const requiredCellTooltipTokens = [
    'sf-cell-tooltip-content',
    'sf-cell-tooltip-tier-badge',
    'sf-cell-tooltip-overridden-badge',
    'sf-cell-tooltip-review-badge',
    'sf-cell-tooltip-link',
    'sf-cell-tooltip-reason-chip',
    'sf-cell-tooltip-arrow',
  ];
  const missingCellTooltipTokens = requiredCellTooltipTokens.filter((token) => !cellTooltipText.includes(token));
  assert.deepEqual(
    missingCellTooltipTokens,
    [],
    `review cell tooltip should use semantic class hooks: ${JSON.stringify(missingCellTooltipTokens)}`,
  );

  const requiredThemeTokens = [
    '.sf-review-brand-filter-bar {',
    '.sf-review-brand-filter-toggle {',
    '.sf-review-brand-filter-brand {',
    '.sf-cell-tooltip-content {',
    '.sf-cell-tooltip-tier-badge {',
    '.sf-cell-tooltip-overridden-badge {',
    '.sf-cell-tooltip-review-badge {',
    '.sf-cell-tooltip-reason-chip {',
  ];
  const missingThemeTokens = requiredThemeTokens.filter((token) => !themeText.includes(token));
  assert.deepEqual(
    missingThemeTokens,
    [],
    `theme should define semantic primitives for review brand filter + cell tooltip: ${JSON.stringify(missingThemeTokens)}`,
  );
});
