import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const STUDIO_PAGE_PATH = path.resolve(
  "tools/gui-react/src/pages/studio/StudioPage.tsx",
);
const WORKBENCH_PRESETS_PATH = path.resolve(
  "tools/gui-react/src/pages/studio/workbench/WorkbenchColumnPresets.tsx",
);
const WORKBENCH_DRAWER_PATH = path.resolve(
  "tools/gui-react/src/pages/studio/workbench/WorkbenchDrawer.tsx",
);
const WORKBENCH_BULK_BAR_PATH = path.resolve(
  "tools/gui-react/src/pages/studio/workbench/WorkbenchBulkBar.tsx",
);
const WORKBENCH_TABLE_PATH = path.resolve(
  "tools/gui-react/src/pages/studio/workbench/WorkbenchTable.tsx",
);
const WORKBENCH_SYSTEM_BADGES_PATH = path.resolve(
  "tools/gui-react/src/pages/studio/workbench/SystemBadges.tsx",
);
const FIELD_RULES_WORKBENCH_PATH = path.resolve(
  "tools/gui-react/src/pages/studio/workbench/FieldRulesWorkbench.tsx",
);
const DRAGGABLE_KEY_LIST_PATH = path.resolve(
  "tools/gui-react/src/pages/studio/DraggableKeyList.tsx",
);
const CELL_DRAWER_PATH = path.resolve(
  "tools/gui-react/src/components/common/CellDrawer.tsx",
);
const THEME_PATH = path.resolve("tools/gui-react/src/theme.css");
const RAW_COLOR_UTILITY_PATTERN =
  /\b(?:bg|text|border|ring|from|to|via|accent|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const SF_TOKEN_PATTERN = /\bsf-[a-z0-9-]+\b/g;
const RADIUS_TOKEN_PATTERN = /\brounded(?:-[a-z0-9]+|\[[^\]]+\])?/g;

function hasButtonPrimitive(text, constName, primitiveClass) {
  const pattern = new RegExp(
    `const\\s+${constName}\\s*=\\s*['"\`][^'"\`]*\\b${primitiveClass}\\b[^'"\`]*['"\`]`,
    "m",
  );
  return pattern.test(text);
}

test("studio page action button constants use shared primary/icon primitives", () => {
  const text = fs.readFileSync(STUDIO_PAGE_PATH, "utf8");
  const requiredTokens = [
    { constName: "btnPrimary", primitiveClass: "sf-primary-button" },
    { constName: "btnAction", primitiveClass: "sf-icon-button" },
    { constName: "btnSecondary", primitiveClass: "sf-icon-button" },
  ];
  const missing = requiredTokens.filter(
    ({ constName, primitiveClass }) =>
      !hasButtonPrimitive(text, constName, primitiveClass),
  );
  assert.deepEqual(
    missing,
    [],
    `studio page should define action constants through shared button primitives: ${JSON.stringify(missing)}`,
  );
  assert.equal(
    text.includes(
      "const btnPrimary = 'px-4 py-2 text-sm bg-accent text-white rounded hover:bg-blue-600 disabled:opacity-50';",
    ),
    false,
    "studio page should not keep legacy hardcoded accent button bundles",
  );
  assert.equal(
    text.includes("bg-orange-600 text-white rounded hover:bg-orange-700"),
    false,
    "compile/validation actions should not rely on hardcoded orange button bundles",
  );
});

test("studio page autosave toggles use readable active/inactive primitive mapping", () => {
  const text = fs.readFileSync(STUDIO_PAGE_PATH, "utf8");
  const requiredPatterns = [
    /autoSaveAllEnabled\s*\?\s*["']sf-primary-button["']\s*:\s*["']sf-action-button["']/,
    /autoSaveMapEnabled\s*\?\s*["']sf-primary-button["']\s*:\s*["']sf-action-button["']/,
    /autoSaveEnabled\s*\?\s*["']sf-primary-button["']\s*:\s*["']sf-action-button["']/,
  ];
  const missing = requiredPatterns.filter((pattern) => !pattern.test(text));
  assert.deepEqual(
    missing,
    [],
    `studio autosave toggles should map ON => sf-primary-button and OFF => sf-action-button: ${JSON.stringify(missing)}`,
  );
  assert.equal(
    text.includes("setAutoSaveEnabled(!effectiveAutoSaveEnabled)"),
    false,
    "main header should not render a second global autosave toggle",
  );
  assert.equal(
    text.includes("autoSaveLocked={autoSaveAllEnabled}"),
    true,
    "key navigator and field contract autosave controls should lock only from Auto-Save All",
  );
  assert.equal(
    text.includes("autoSaveLocked={autoSaveWorkbookLocked}"),
    false,
    "key navigator and field contract autosave controls should not be locked by mapping autosave",
  );
  assert.equal(
    text.includes("autoSaveLockReason={autoSaveWorkbookLockReason}"),
    false,
    "key navigator and field contract autosave controls should not use combined workbook lock reason",
  );
});

test("studio compile and save actions use consistent primary button treatment", () => {
  const text = fs.readFileSync(STUDIO_PAGE_PATH, "utf8");
  const themeText = fs.readFileSync(THEME_PATH, "utf8");
  assert.equal(
    /onClick=\{runCompileFromStudio\}[\s\S]*disabled=\{compileMut\.isPending \|\| processStatus\.running\}[\s\S]*className=\{`\$\{btnPrimary\} relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap \$\{actionBtnWidth\}`\}/.test(
      text,
    ),
    true,
    "top-level compile action should use the primary save/add button treatment",
  );
  assert.match(
    text,
    /onClick=\{onRunCompile\}[\s\S]*className=\{`[^`]*btnPrimary/,
    "compile action should use the primary save/add button treatment",
  );
  assert.match(
    text,
    /invalidate-cache[\s\S]*className=\{`[^`]*btnSecondary/,
    "refresh action should use the neutral icon-button treatment",
  );
  assert.match(
    text,
    /onClick=\{\(\) => validateRulesMut\.mutate\(\)\}[\s\S]*className=\"[^\"]*sf-confirm-button-solid/,
    "validate action should use the shared confirm-item button primitive",
  );
  assert.equal(
    text.includes(
      'className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded hover:bg-blue-600 disabled:opacity-50"',
    ),
    false,
    "inline key edit save buttons should not use legacy hardcoded accent bundles",
  );
  const requiredSaveStatePatterns = [
    /className=\{`\$\{autoSaveAllEnabled \? btnSecondary : btnPrimary\} relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap \$\{actionBtnWidth\}`\}/,
    /className=\{`\$\{autoSaveMapEnabled \? btnSecondary : btnPrimary\} relative h-11 min-h-11 text-sm rounded inline-flex items-center justify-center overflow-visible whitespace-nowrap \$\{actionBtnWidth\}`\}/,
    /autoSaveEnabled\s*\?\s*["']sf-icon-button["']\s*:\s*["']sf-primary-button["']/,
    /className=\{`relative px-3 py-1\.5 text-xs font-medium rounded transition-colors disabled:opacity-50 \$\{/,
  ];
  const missingSaveStateTokens = requiredSaveStatePatterns.filter(
    (pattern) => !pattern.test(text),
  );
  assert.deepEqual(
    missingSaveStateTokens,
    [],
    `save buttons should be full-color primary when autosave is off: ${JSON.stringify(missingSaveStateTokens)}`,
  );
  assert.equal(
    text.includes(
      "className={`relative px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-100 ${",
    ),
    false,
    "key navigator save button should fade when disabled",
  );
  assert.equal(
    text.includes(
      "disabled={saveStudioDocsMut.isPending || autoSaveAllEnabled}",
    ),
    true,
    "top-level Save Edits should lock only on main Auto-Save All",
  );
  assert.equal(
    text.includes(
      "disabled={saveStudioDocsMut.isPending || effectiveAutoSaveEnabled}",
    ),
    false,
    "top-level Save Edits should not be locked by mapping/workbook autosave state",
  );
  const requiredThemeTokens = [
    ".sf-confirm-button-solid {",
    ".sf-confirm-button-solid:hover {",
    ".sf-primary-button:hover {",
    "filter: brightness(0.94);",
  ];
  const missingThemeTokens = requiredThemeTokens.filter(
    (token) => !themeText.includes(token),
  );
  assert.deepEqual(
    missingThemeTokens,
    [],
    `theme should define confirm solid primitive used by validate action: ${JSON.stringify(missingThemeTokens)}`,
  );
});

test("studio compile reports idle badges keep label text centered", () => {
  const text = fs.readFileSync(STUDIO_PAGE_PATH, "utf8");
  const requiredCenteredBadgePatterns = [
    /className=\{`h-10 min-h-10 w-52 inline-flex items-center justify-center rounded border px-3 text-sm font-medium truncate shrink-0 \$\{compileBadgeClass\}`\}/,
    /className=\{`h-10 min-h-10 w-52 inline-flex items-center justify-center rounded border px-3 text-sm font-medium truncate shrink-0 \$\{validateBadgeClass\}`\}/,
  ];
  const missing = requiredCenteredBadgePatterns.filter(
    (pattern) => !pattern.test(text),
  );
  assert.deepEqual(
    missing,
    [],
    `compile and validation idle badges should keep centered text: ${JSON.stringify(missing)}`,
  );
});

test("review drawer item-lane Confirm and studio validate action share the same confirm primitive", () => {
  const studioText = fs.readFileSync(STUDIO_PAGE_PATH, "utf8");
  const drawerText = fs.readFileSync(CELL_DRAWER_PATH, "utf8");
  assert.match(
    studioText,
    /onClick=\{\(\) => validateRulesMut\.mutate\(\)\}[\s\S]*className=\"[^\"]*sf-confirm-button-solid/,
    "studio validate action should use shared confirm primitive",
  );
  assert.equal(
    drawerText.includes("bg-orange-600 text-white rounded hover:bg-orange-700"),
    false,
    "drawer confirm actions should not hardcode orange bundles",
  );
  assert.equal(
    drawerText.includes("sf-confirm-button-solid"),
    true,
    "drawer confirm actions should use shared confirm primitive class",
  );
});

test("field rules workbench save controls match studio primary/icon action pattern", () => {
  const text = fs.readFileSync(WORKBENCH_PRESETS_PATH, "utf8");
  assert.equal(
    text.includes(
      "className={`px-3 py-1.5 text-xs font-medium rounded disabled:opacity-50 transition-colors ${",
    ),
    true,
    "workbench save control should fade when disabled",
  );
  assert.equal(
    text.includes("autoSaveEnabled ? 'sf-icon-button' : 'sf-primary-button'"),
    true,
    "workbench save control should be primary when autosave is off and neutral when autosave is on",
  );
  assert.equal(
    text.includes(
      "autoSaveEnabled\n            ? 'sf-primary-button'\n            : 'sf-action-button'",
    ),
    true,
    "workbench autosave toggle should map ON => primary and OFF => action button primitive",
  );
  assert.equal(
    text.includes(
      "px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700",
    ),
    false,
    "workbench save controls should not use legacy border-gray button bundles",
  );
  assert.equal(
    text.includes("disabled:opacity-50"),
    true,
    "workbench save control should use faded disabled opacity",
  );
});

test("locked autosave labels are concise across studio and workbench controls", () => {
  const studioText = fs.readFileSync(STUDIO_PAGE_PATH, "utf8");
  const workbenchText = fs.readFileSync(WORKBENCH_PRESETS_PATH, "utf8");
  assert.equal(
    studioText.includes("Auto-Save On (Locked by"),
    false,
    "studio autosave lock labels should not include verbose lock reasons",
  );
  assert.equal(
    workbenchText.includes("Auto-Save On (Locked by"),
    false,
    "workbench autosave lock labels should not include verbose lock reasons",
  );
  assert.equal(
    /\?\s*["']Auto-Save On \(Locked\)["']/.test(studioText),
    true,
    "studio locked autosave labels should render as Auto-Save On (Locked)",
  );
  assert.equal(
    /\?\s*["']Auto-Save On \(Locked\)["']/.test(workbenchText),
    true,
    "workbench locked autosave labels should render as Auto-Save On (Locked)",
  );
  assert.equal(
    studioText.includes("opacity-80 cursor-not-allowed"),
    true,
    "studio autosave lock styling should keep locked tint/dimming",
  );
  assert.equal(
    workbenchText.includes("opacity-80 cursor-not-allowed"),
    true,
    "workbench autosave lock styling should keep locked tint/dimming",
  );
});

test("shared button primitives freeze hover styling when disabled", () => {
  const themeText = fs.readFileSync(THEME_PATH, "utf8");
  const requiredTokens = [
    ".sf-icon-button:disabled,",
    ".sf-icon-button:disabled:hover {",
    ".sf-action-button:disabled,",
    ".sf-action-button:disabled:hover {",
    ".sf-primary-button:disabled,",
    ".sf-primary-button:disabled:hover {",
    "cursor: not-allowed;",
    "filter: none;",
  ];
  const missing = requiredTokens.filter((token) => !themeText.includes(token));
  assert.deepEqual(
    missing,
    [],
    `disabled button primitives should not react to hover: ${JSON.stringify(missing)}`,
  );
});

test("studio page raw utility color drift is reduced for current migration wave", () => {
  const text = fs.readFileSync(STUDIO_PAGE_PATH, "utf8");
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount <= 0,
    true,
    `studio page raw utility color refs should be <= 0 for this migration wave, got ${rawColorCount}`,
  );
});

test("studio page keeps constrained rounded token palette", () => {
  const text = fs.readFileSync(STUDIO_PAGE_PATH, "utf8");
  const roundedTokens = [...new Set(text.match(RADIUS_TOKEN_PATTERN) || [])];
  assert.equal(
    roundedTokens.length <= 3,
    true,
    `studio page rounded token palette should stay <= 3, got ${JSON.stringify(roundedTokens)}`,
  );
});

test("workbench drawer raw utility color drift is reduced for current migration wave", () => {
  const text = fs.readFileSync(WORKBENCH_DRAWER_PATH, "utf8");
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount <= 40,
    true,
    `workbench drawer raw utility color refs should be <= 40 for this migration wave, got ${rawColorCount}`,
  );
});

test("draggable key list raw utility color drift is reduced for current migration wave", () => {
  const text = fs.readFileSync(DRAGGABLE_KEY_LIST_PATH, "utf8");
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount <= 0,
    true,
    `draggable key list raw utility color refs should be <= 0 for this migration wave, got ${rawColorCount}`,
  );
});

test("workbench bulk bar raw utility color drift is reduced for current migration wave", () => {
  const text = fs.readFileSync(WORKBENCH_BULK_BAR_PATH, "utf8");
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount <= 0,
    true,
    `workbench bulk bar raw utility color refs should be <= 0 for this migration wave, got ${rawColorCount}`,
  );
});

test("workbench presets raw utility color drift is reduced for current migration wave", () => {
  const text = fs.readFileSync(WORKBENCH_PRESETS_PATH, "utf8");
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount <= 0,
    true,
    `workbench presets raw utility color refs should be <= 0 for this migration wave, got ${rawColorCount}`,
  );
});

test("workbench system badges raw utility color drift is reduced for current migration wave", () => {
  const text = fs.readFileSync(WORKBENCH_SYSTEM_BADGES_PATH, "utf8");
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount <= 0,
    true,
    `workbench system badges raw utility color refs should be <= 0 for this migration wave, got ${rawColorCount}`,
  );
});

test("workbench table raw utility color drift is reduced for current migration wave", () => {
  const text = fs.readFileSync(WORKBENCH_TABLE_PATH, "utf8");
  const rawColorCount = (text.match(RAW_COLOR_UTILITY_PATTERN) || []).length;
  assert.equal(
    rawColorCount <= 0,
    true,
    `workbench table raw utility color refs should be <= 0 for this migration wave, got ${rawColorCount}`,
  );
});

test("field rules workbench semantic token density is retained", () => {
  const text = fs.readFileSync(FIELD_RULES_WORKBENCH_PATH, "utf8");
  const sfCount = (text.match(SF_TOKEN_PATTERN) || []).length;
  assert.equal(
    sfCount >= 5,
    true,
    `field rules workbench should include at least 5 semantic sf-* tokens, got ${sfCount}`,
  );
});
