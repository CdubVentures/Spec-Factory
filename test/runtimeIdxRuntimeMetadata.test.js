import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRuntimeIdxBadgesBySurface,
  buildRuntimeIdxBadgesForWorker,
  buildRuntimeIdxTooltip,
} from '../src/features/indexing/runtime/idxRuntimeMetadata.js';

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

  assert.deepEqual(
    surfaces.needset.map((badge) => [badge.field_path, badge.state]),
    [
      ['priority.required_level', 'active'],
      ['evidence.min_evidence_refs', 'active'],
      ['aliases', 'active'],
      ['search_hints.query_terms', 'active'],
      ['search_hints.domain_hints', 'active'],
      ['search_hints.preferred_content_types', 'off'],
      ['ui.tooltip_md', 'off'],
    ],
    'NeedSet should expose all 7 IDX keys that the NeedSet engine passes per field, showing unconfigured ones as off'
  );

  assert.deepEqual(
    surfaces.search_profile.map((badge) => [badge.field_path, badge.state]),
    [
      ['aliases', 'active'],
      ['search_hints.query_terms', 'active'],
      ['search_hints.domain_hints', 'active'],
      ['search_hints.preferred_content_types', 'off'],
      ['ui.tooltip_md', 'off'],
    ],
    'Search Profile should show all surface fields, graying out unconfigured or idx-disabled ones'
  );

  assert.equal(
    surfaces.brand_resolver.length,
    0,
    'Brand Resolver should stay empty when no verified IDX field-rule keys participate there'
  );
});

test('buildRuntimeIdxBadgesForWorker exposes contract range and list rules on fetch workers', () => {
  const badges = buildRuntimeIdxBadgesForWorker({
    fieldRulesPayload: {
      fields: {
        weight: {
          contract: {
            range: {
              min: 40,
              max: 120,
            },
          },
        },
        features: {
          contract: {
            list_rules: {
              dedupe: true,
              sort: 'asc',
              min_items: 1,
              max_items: 5,
              item_union: 'set_union',
            },
          },
        },
      },
    },
    worker: {
      pool: 'fetch',
    },
  });

  assert.deepEqual(
    badges
      .filter((badge) => ['contract.range', 'contract.list_rules'].includes(badge.field_path))
      .map((badge) => [badge.field_path, badge.label, badge.state]),
    [
      ['contract.range', 'idx.contract.range', 'active'],
      ['contract.list_rules', 'idx.contract.list_rules', 'active'],
    ],
    'Fetch Worker should expose active idx.contract.range and idx.contract.list_rules badges when those rules are configured',
  );
});

test('buildRuntimeIdxTooltip scopes unknown-token behavior to extraction guidance', () => {
  const tooltip = buildRuntimeIdxTooltip({
    fieldPath: 'contract.unknown_token',
    surfaceLabel: 'Fetch Worker',
    active: true,
  });

  assert.match(tooltip, /^idx\.contract\.unknown_token/m);
  assert.match(tooltip, /Fetch Worker/);
  assert.match(tooltip, /When ON: This runtime stage includes the configured unknown token in extraction guidance when the field cannot be resolved\./);
  assert.doesNotMatch(
    tooltip,
    /uses the configured unknown token when the field cannot be resolved/,
    'unknown-token runtime tooltip should not promise end-to-end runtime placeholder handling',
  );
});
