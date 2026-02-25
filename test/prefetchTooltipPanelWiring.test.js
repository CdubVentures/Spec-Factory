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

  it('explains why a gate can show 0\\/Y in top-level gate tooltips', () => {
    const source = read('tools/gui-react/src/pages/runtime-ops/panels/PrefetchSearchProfilePanel.tsx');
    assert.match(source, /0\/Y means no query terms are configured on enabled fields/);
    assert.match(source, /0\/Y means domain hints exist but are not usable host patterns/);
    assert.match(source, /Examples of usable host patterns: `example\.com`, `support\.example\.com`\./);
    assert.match(source, /0\/Y means no preferred content types are configured on enabled fields/);
  });

  it('explains query-journey scoring in plain english', () => {
    const source = read('tools/gui-react/src/pages/runtime-ops/panels/PrefetchQueryJourneyPanel.tsx');
    assert.match(source, /Pass \(0-70\): Validate \+28, Reason \+20, Primary \+14, Fast \+8\./);
    assert.match(source, /Attempts \(0-10\): \+2 per logged attempt from search profile[\s\S]*query_rows\.attempts[\s\S]*capped at \+10\./);
    assert.match(source, /Constraints \(0-14\): \+8 for field-rule hints \+ \+6 for site\/domain-constrained queries\./);
    assert.match(source, /Attempts is a retry boost: previously searched queries can rank higher when coverage is still incomplete\./);
  });
});
