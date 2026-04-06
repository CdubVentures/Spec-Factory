import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRuntimeIdxBadgesBySurface,
  buildRuntimeIdxBadgesForWorker,
  buildRuntimeIdxTooltip,
} from '../idxRuntimeMetadata.js';

test('buildRuntimeIdxTooltip points runtime users back to Field Studio key navigation and explains on/off behavior', () => {
  const tooltip = buildRuntimeIdxTooltip({
    fieldPath: 'search_hints.query_terms',
    surfaceLabel: 'Search Profile',
    active: true,
  });

  assert.match(tooltip, /^idx\.search_hints\.query_terms/m);
  assert.match(tooltip, /This feature is enabled in Key Navigation > Search Hints > Query Terms\./);
  assert.match(tooltip, /When ON:/);
  assert.match(tooltip, /When OFF:/);
  assert.match(tooltip, /Search Profile/);
});

test('buildRuntimeIdxBadgesBySurface returns active and gray IDX badges for all surface-specified fields', () => {
  const fieldRulesPayload = {
    fields: {
      weight: {
        priority: {
          required_level: 'required',
        },
        evidence: {
          min_evidence_refs: 2,
        },
        search_hints: {
          query_terms: ['weight'],
        },
        ui: {
          tooltip_md: 'Weight in grams',
        },
        consumers: {
          'ui.tooltip_md': {
            indexlab: false,
          },
        },
      },
      dpi: {
        search_hints: {
          domain_hints: ['rtings.com'],
        },
        aliases: ['max dpi'],
      },
    },
  };

  const surfaces = buildRuntimeIdxBadgesBySurface(fieldRulesPayload);

  const needsetBadges = surfaces.needset.map((badge) => [badge.field_path, badge.state]);
  // Verify the real fields are present with correct active/off state
  assert.ok(needsetBadges.some(([p, s]) => p === 'priority.required_level' && s === 'active'));
  assert.ok(needsetBadges.some(([p, s]) => p === 'aliases' && s === 'active'));
  assert.ok(needsetBadges.some(([p, s]) => p === 'search_hints.query_terms' && s === 'active'));
  assert.ok(needsetBadges.some(([p, s]) => p === 'search_hints.domain_hints' && s === 'active'));
  assert.ok(needsetBadges.some(([p, s]) => p === 'search_hints.content_types' && s === 'off'));
  assert.ok(needsetBadges.some(([p, s]) => p === 'ui.tooltip_md' && s === 'off'));
  assert.ok(needsetBadges.some(([p, s]) => p === 'group' && s === 'off'));
  assert.equal(needsetBadges.length, 10, 'NeedSet should expose all 10 IDX keys from the badge registry');

  const searchBadges = surfaces.search_profile.map((badge) => [badge.field_path, badge.state]);
  assert.ok(searchBadges.some(([p, s]) => p === 'aliases' && s === 'active'));
  assert.ok(searchBadges.some(([p, s]) => p === 'search_hints.query_terms' && s === 'active'));
  assert.ok(searchBadges.some(([p, s]) => p === 'search_hints.domain_hints' && s === 'active'));

  assert.equal(
    surfaces.brand_resolver.length,
    0,
    'Brand Resolver should stay empty when no verified IDX field-rule keys participate there'
  );
});

test('buildRuntimeIdxBadgesForWorker shows search fields on fetch workers', () => {
  const badges = buildRuntimeIdxBadgesForWorker({
    fieldRulesPayload: {
      fields: {
        weight: {
          priority: { required_level: 'required' },
          search_hints: { query_terms: ['weight', 'mass'] },
          aliases: ['mass'],
        },
      },
    },
    worker: { pool: 'fetch' },
  });

  // Fetch workers now use SEARCH_RUNTIME_FIELDS (aspirational extraction fields removed)
  assert.ok(
    badges.some((b) => b.field_path === 'priority.required_level' && b.state === 'active'),
    'Fetch Worker should show priority.required_level from SEARCH_RUNTIME_FIELDS',
  );
  assert.ok(
    badges.some((b) => b.field_path === 'aliases' && b.state === 'active'),
    'Fetch Worker should show aliases from SEARCH_RUNTIME_FIELDS',
  );
  // Aspirational fields no longer appear
  assert.ok(
    !badges.some((b) => b.field_path === 'contract.range'),
    'Fetch Worker should not show removed aspirational field paths',
  );
});
