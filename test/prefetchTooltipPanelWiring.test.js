import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

describe('prefetch tooltip panel wiring', () => {
  it('uses shared tooltip primitives in search planner panel', () => {
    const source = read('tools/gui-react/src/pages/runtime-ops/panels/PrefetchSearchPlannerPanel.tsx');
    assert.match(source, /from '\.\.\/components\/PrefetchTooltip'/);
    assert.doesNotMatch(source, /function UiTooltip\(/);
    assert.doesNotMatch(source, /function TooltipBadge\(/);
    assert.doesNotMatch(source, /function formatTooltip\(/);
  });

  it('renders top-level search-profile gate badges with shared tooltip badge', () => {
    const source = read('tools/gui-react/src/pages/runtime-ops/panels/PrefetchSearchProfilePanel.tsx');
    assert.match(source, /from '\.\.\/components\/PrefetchTooltip'/);
    assert.match(source, /<TooltipBadge[\s\S]*>[\s\S]*Field Rules/);
    assert.doesNotMatch(source, /label=\{`Field Rules:/);
    assert.doesNotMatch(source, /Query Terms:\s*\{gateSummary\.queryTermsOn/);
    assert.doesNotMatch(source, /Domain Hints:\s*\{gateSummary\.domainHintsOn/);
    assert.doesNotMatch(source, /Content Types:\s*\{gateSummary\.contentTypesOn/);
    assert.doesNotMatch(source, /Source Host:\s*\{gateSummary\.sourceHostOn/);
    assert.doesNotMatch(source, /\?\s*'ON'\s*:\s*'OFF'/);
  });
});
