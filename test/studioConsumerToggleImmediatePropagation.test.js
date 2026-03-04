import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const STUDIO_PAGE = path.resolve('tools/gui-react/src/pages/studio/StudioPage.tsx');
const FIELD_RULES_WORKBENCH = path.resolve('tools/gui-react/src/pages/studio/workbench/FieldRulesWorkbench.tsx');
const WORKBENCH_DRAWER = path.resolve('tools/gui-react/src/pages/studio/workbench/WorkbenchDrawer.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('key navigator consumer toggles route through the autosave-gated save path', () => {
  const studioPageText = readText(STUDIO_PAGE);

  assert.match(
    studioPageText,
    /const saveIfAutoSaveEnabled\s*=\s*useCallback\(\(\)\s*=>\s*\{/,
    'key navigator should define an autosave-gated save callback',
  );
  assert.match(
    studioPageText,
    /if\s*\(!autoSaveEnabled\)\s*return;?/,
    'key navigator autosave-gated callback should no-op when autosave is off',
  );
  assert.match(
    studioPageText,
    /const handleConsumerToggle[\s\S]*updateField\(\s*selectedKey,\s*["']consumers["'][\s\S]*saveIfAutoSaveEnabled\(\)/,
    'key navigator consumer toggle handler should call autosave-gated save callback after updating consumers',
  );
});

test('workbench drawer consumer toggles route through the autosave-gated save path', () => {
  const workbenchDrawerText = readText(WORKBENCH_DRAWER);
  const fieldRulesWorkbenchText = readText(FIELD_RULES_WORKBENCH);

  assert.match(
    fieldRulesWorkbenchText,
    /const saveIfAutoSaveEnabled\s*=\s*useCallback\(\(\)\s*=>\s*\{/,
    'field rules workbench should define an autosave-gated immediate commit callback',
  );
  assert.match(
    fieldRulesWorkbenchText,
    /onCommitImmediate=\{saveIfAutoSaveEnabled\}/,
    'field rules workbench should pass autosave-gated callback to workbench drawer immediate commit',
  );
  assert.match(
    workbenchDrawerText,
    /const handleConsumerToggle[\s\S]*update\(\s*["']consumers["'][\s\S]*onCommitImmediate\(\)/,
    'workbench drawer consumer toggle handler should call onCommitImmediate() after updating consumers',
  );
});
