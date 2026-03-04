import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const STUDIO_NUMERIC_HELPERS = path.resolve('tools/gui-react/src/pages/studio/numericInputHelpers.ts');
const STUDIO_NUMERIC_BOUNDS = path.resolve('tools/gui-react/src/pages/studio/studioNumericKnobBounds.ts');
const STUDIO_PAGE = path.resolve('tools/gui-react/src/pages/studio/StudioPage.tsx');
const WORKBENCH_DRAWER = path.resolve('tools/gui-react/src/pages/studio/workbench/WorkbenchDrawer.tsx');
const WORKBENCH_BULK_BAR = path.resolve('tools/gui-react/src/pages/studio/workbench/WorkbenchBulkBar.tsx');
const WORKBENCH_HELPERS = path.resolve('tools/gui-react/src/pages/studio/workbench/workbenchHelpers.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('studio numeric knob parsing uses shared bounded helpers and preserves low/zero values', () => {
  const helpersText = readText(STUDIO_NUMERIC_HELPERS);
  const boundsText = readText(STUDIO_NUMERIC_BOUNDS);
  const studioPageText = readText(STUDIO_PAGE);
  const workbenchDrawerText = readText(WORKBENCH_DRAWER);
  const workbenchBulkBarText = readText(WORKBENCH_BULK_BAR);
  const workbenchHelpersText = readText(WORKBENCH_HELPERS);

  assert.equal(
    helpersText.includes('export function parseBoundedIntInput('),
    true,
    'Studio numeric helpers should expose bounded integer parsing',
  );
  assert.equal(
    helpersText.includes('export function parseBoundedFloatInput('),
    true,
    'Studio numeric helpers should expose bounded float parsing',
  );
  assert.equal(
    helpersText.includes('export function parseOptionalPositiveIntInput('),
    true,
    'Studio numeric helpers should expose optional positive integer parsing for nullable knobs',
  );
  assert.equal(
    boundsText.includes('export const STUDIO_NUMERIC_KNOB_BOUNDS = {'),
    true,
    'Studio numeric bounds should be centralized in a shared bounds module',
  );
  assert.equal(
    boundsText.includes('export const STUDIO_COMPONENT_MATCH_DEFAULTS = {'),
    true,
    'Studio component-match defaults should be centralized in a shared bounds module',
  );

  assert.match(
    studioPageText,
    /from\s+["']\.\/numericInputHelpers["'];/,
    'StudioPage should consume shared numeric helper contract',
  );
  assert.match(
    studioPageText,
    /from\s+["']\.\/studioNumericKnobBounds["'];/,
    'StudioPage should consume shared numeric bounds contract',
  );
  assert.match(
    workbenchDrawerText,
    /from\s+["']\.\.\/numericInputHelpers["'];/,
    'WorkbenchDrawer should consume shared numeric helper contract',
  );
  assert.match(
    workbenchDrawerText,
    /from\s+["']\.\.\/studioNumericKnobBounds["'];/,
    'WorkbenchDrawer should consume shared numeric bounds contract',
  );
  assert.match(
    workbenchBulkBarText,
    /from\s+["']\.\.\/numericInputHelpers["'];/,
    'WorkbenchBulkBar should consume shared numeric helper contract',
  );
  assert.match(
    workbenchBulkBarText,
    /from\s+["']\.\.\/studioNumericKnobBounds["'];/,
    'WorkbenchBulkBar should consume shared numeric bounds contract',
  );

  assert.equal(
    studioPageText.includes('parseInt(e.target.value, 10) ||'),
    false,
    'StudioPage numeric handlers should not use local parseInt OR-fallback branches',
  );
  assert.equal(
    studioPageText.includes('parseFloat(e.target.value) ||'),
    false,
    'StudioPage numeric handlers should not use local parseFloat OR-fallback branches',
  );
  assert.equal(
    workbenchDrawerText.includes('parseInt(e.target.value, 10) ||'),
    false,
    'WorkbenchDrawer numeric handlers should not use local parseInt OR-fallback branches',
  );
  assert.equal(
    workbenchDrawerText.includes('parseFloat(e.target.value) ||'),
    false,
    'WorkbenchDrawer numeric handlers should not use local parseFloat OR-fallback branches',
  );
  assert.equal(
    workbenchBulkBarText.includes('parseInt(bulkMinRefs, 10) ||'),
    false,
    'WorkbenchBulkBar should not use local parseInt OR-fallback branches for evidence refs',
  );

  assert.equal(
    /['"]component\.match\.fuzzy_threshold['"],\s*parseBoundedFloatInput\(/s.test(studioPageText)
      && /STUDIO_NUMERIC_KNOB_BOUNDS\s*\.componentMatch\s*\.min/.test(studioPageText)
      && /STUDIO_COMPONENT_MATCH_DEFAULTS\s*\.fuzzyThreshold/.test(studioPageText),
    true,
    'StudioPage component-match knobs should use bounded float parsing so 0 is preserved',
  );
  assert.equal(
    /['"]component\.match\.fuzzy_threshold['"],\s*parseBoundedFloatInput\(/s.test(workbenchDrawerText)
      && /STUDIO_NUMERIC_KNOB_BOUNDS\s*\.componentMatch\s*\.min/.test(workbenchDrawerText)
      && /STUDIO_COMPONENT_MATCH_DEFAULTS\s*\.fuzzyThreshold/.test(workbenchDrawerText),
    true,
    'WorkbenchDrawer component-match knobs should use bounded float parsing so 0 is preserved',
  );

  assert.equal(
    workbenchBulkBarText.includes('parseBoundedIntInput(')
      && workbenchBulkBarText.includes('STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.min')
      && workbenchBulkBarText.includes('STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.max')
      && workbenchBulkBarText.includes('STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback'),
    true,
    'WorkbenchBulkBar evidence refs writer should use shared bounded integer parsing and shared bounds constants',
  );

  assert.equal(
    studioPageText.includes('const effort = parseBoundedIntInput(')
      && studioPageText.includes('DEFAULT_PRIORITY_PROFILE.effort'),
    true,
    'StudioPage priority normalization should use shared bounded integer parser with default-profile fallback',
  );
  assert.equal(
    studioPageText.includes('const maxCallsRaw = parseOptionalPositiveIntInput(')
      && studioPageText.includes('clampNumber(')
      && /STUDIO_NUMERIC_KNOB_BOUNDS\s*\.aiMaxCalls\s*\.min/.test(studioPageText)
      && /STUDIO_NUMERIC_KNOB_BOUNDS\s*\.aiMaxCalls\s*\.max/.test(studioPageText),
    true,
    'StudioPage ai_assist.max_calls normalization should use shared optional-positive integer parser and bounds constants',
  );
  assert.equal(
    studioPageText.includes('const maxTokensRaw = parseOptionalPositiveIntInput(')
      && studioPageText.includes('clampNumber(')
      && /STUDIO_NUMERIC_KNOB_BOUNDS\s*\.aiMaxTokens\s*\.min/.test(studioPageText)
      && /STUDIO_NUMERIC_KNOB_BOUNDS\s*\.aiMaxTokens\s*\.max/.test(studioPageText),
    true,
    'StudioPage ai_assist.max_tokens normalization should use shared optional-positive integer parser and bounds constants',
  );

  assert.match(
    studioPageText,
    /numN\(\s*currentRule,\s*["']min_evidence_refs["'],\s*STUDIO_NUMERIC_KNOB_BOUNDS\s*\.evidenceMinRefs\s*\.fallback\s*,?\s*\)/,
    'StudioPage min-evidence readers should use shared fallback bounds contract instead of local literals',
  );
  assert.match(
    workbenchDrawerText,
    /numN\(\s*rule,\s*["']min_evidence_refs["'],\s*STUDIO_NUMERIC_KNOB_BOUNDS\s*\.evidenceMinRefs\s*\.fallback\s*,?\s*\)/,
    'WorkbenchDrawer min-evidence readers should use shared fallback bounds contract instead of local literals',
  );
  assert.match(
    workbenchHelpersText,
    /numN\(\s*r,\s*["']min_evidence_refs["'],\s*STUDIO_NUMERIC_KNOB_BOUNDS\s*\.evidenceMinRefs\s*\.fallback\s*,?\s*\)/,
    'Workbench row projection should use shared fallback bounds contract for min-evidence refs',
  );

  assert.equal(
    workbenchHelpersText.includes('return parsed === null ? fallback : parsed;'),
    true,
    'Workbench helper numN should preserve parsed low/zero values instead of OR-fallback coercion',
  );
  assert.equal(
    studioPageText.includes('return parsed === null ? fallback : parsed;'),
    true,
    'StudioPage numN should preserve parsed low/zero values instead of OR-fallback coercion',
  );
});
