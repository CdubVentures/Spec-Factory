import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function readText(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8');
}

test('prefetch NeedSet uses content-sized detail drawer and tall capped list when detail is open', () => {
  const needsetPanel = readText('tools/gui-react/src/pages/runtime-ops/panels/PrefetchNeedSetPanel.tsx');
  assert.match(
    needsetPanel,
    /<DrawerShell[\s\S]*className="max-h-none"[\s\S]*scrollContent=\{false\}/,
    'NeedSet detail drawer should size to content with no internal drawer scroller',
  );
  assert.match(
    needsetPanel,
    /overflow-x-auto overflow-y-auto \$\{selectedNeed \? 'max-h-\[50vh\]' : 'max-h-none'\}/,
    'NeedSet list should use a tall open-state cap and regrow when detail closes',
  );
});

test('DrawerShell supports optional className overrides while keeping scroll behavior', () => {
  const drawerShell = readText('tools/gui-react/src/components/common/DrawerShell.tsx');
  assert.match(
    drawerShell,
    /interface DrawerShellProps[\s\S]*className\?: string;/,
    'DrawerShell props should include className override',
  );
  assert.match(
    drawerShell,
    /export function DrawerShell\(\{[\s\S]*className[\s\S]*\}: DrawerShellProps\)/,
    'DrawerShell component should accept className override',
  );
  assert.match(drawerShell, /overflow-y-auto/, 'DrawerShell should remain vertically scrollable when capped');
  assert.match(
    drawerShell,
    /className=\{`[^`]*min-w-0[^`]*shrink-0[^`]*flex flex-col[^`]*`\}/,
    'DrawerShell root should include shrink-0 to prevent clipped detail content in flex layouts',
  );
  assert.match(
    drawerShell,
    /`[^`]*\$\{className \|\| ''\}[^`]*`/,
    'DrawerShell root class list should append caller-provided className',
  );
  assert.match(
    drawerShell,
    /maxHeight\?: number \| string;/,
    'DrawerShell props should include maxHeight override',
  );
  assert.match(
    drawerShell,
    /maxHeight !== undefined/,
    'DrawerShell should conditionally apply maxHeight style override',
  );
});
