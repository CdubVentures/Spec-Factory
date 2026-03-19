import test from 'node:test';
import assert from 'node:assert/strict';

import { createSourcesReportCommand } from '../../../../src/app/cli/commands/sourcesReportCommand.js';

function createDeps(overrides = {}) {
  return {
    loadSourceIntel: async () => ({
      key: '_intel/mouse/domain-stats.json',
      data: {
        domains: {
          'example.com': {
            rootDomain: 'example.com',
            planner_score: 0.41,
            attempts: 7,
            identity_match_rate: 0.65,
            major_anchor_conflict_rate: 0.12,
            fields_accepted_count: 15,
            products_seen: 3,
            approved_attempts: 2,
            candidate_attempts: 9,
            per_path: {
              '/slow': {
                path: '/slow',
                planner_score: 0.1,
                attempts: 2,
                identity_match_rate: 0.5,
                major_anchor_conflict_rate: 0.2,
                fields_accepted_count: 3,
              },
              '/best': {
                path: '/best',
                planner_score: 0.8,
                attempts: 4,
                identity_match_rate: 0.9,
                major_anchor_conflict_rate: 0.05,
                fields_accepted_count: 11,
              },
            },
          },
          'alpha.com': {
            rootDomain: 'alpha.com',
            planner_score: 0.91,
            attempts: 11,
            identity_match_rate: 0.77,
            major_anchor_conflict_rate: 0.08,
            fields_accepted_count: 21,
            products_seen: 5,
            approved_attempts: 4,
            candidate_attempts: 12,
            per_path: {
              '/z': {
                path: '/z',
                planner_score: 0.2,
                attempts: 1,
                identity_match_rate: 0.2,
                major_anchor_conflict_rate: 0.1,
                fields_accepted_count: 1,
              },
              '/a': {
                path: '/a',
                planner_score: 0.7,
                attempts: 6,
                identity_match_rate: 0.95,
                major_anchor_conflict_rate: 0.02,
                fields_accepted_count: 10,
              },
            },
          },
        },
      },
    }),
    promotionSuggestionsKey: (_config, category) => `_intel/${category}/promotion-suggestions.json`,
    ...overrides,
  };
}

test('sources-report sorts domains and per-path rows by planner score with top limits', async () => {
  const keyReads = [];
  const storage = {
    readJsonOrNull: async (key) => {
      keyReads.push(key);
      return { suggestion_count: 6 };
    },
  };

  const commandSourcesReport = createSourcesReportCommand(createDeps());
  const result = await commandSourcesReport({}, storage, {
    category: 'monitor',
    top: '2',
    'top-paths': '1',
  });

  assert.equal(keyReads.length, 1);
  assert.equal(keyReads[0], '_intel/monitor/promotion-suggestions.json');
  assert.equal(result.command, 'sources-report');
  assert.equal(result.category, 'monitor');
  assert.equal(result.domain_count, 2);
  assert.equal(result.top_domains.length, 2);
  assert.equal(result.top_domains[0].rootDomain, 'alpha.com');
  assert.equal(result.top_domains[1].rootDomain, 'example.com');
  assert.equal(result.top_domains[0].top_paths.length, 1);
  assert.equal(result.top_domains[0].top_paths[0].path, '/a');
  assert.equal(result.top_domains[1].top_paths.length, 1);
  assert.equal(result.top_domains[1].top_paths[0].path, '/best');
  assert.equal(result.promotion_suggestions_key, '_intel/monitor/promotion-suggestions.json');
  assert.equal(result.promotion_suggestion_count, 6);
});

test('sources-report defaults category and suggestion count fallback', async () => {
  const loadCalls = [];
  const commandSourcesReport = createSourcesReportCommand(createDeps({
    loadSourceIntel: async (payload) => {
      loadCalls.push(payload);
      return {
        key: '_intel/mouse/domain-stats.json',
        data: { domains: {} },
      };
    },
  }));

  const result = await commandSourcesReport({}, {
    readJsonOrNull: async () => null,
  }, {
    top: '-4',
    'top-paths': '-3',
  });

  assert.equal(loadCalls.length, 1);
  assert.equal(loadCalls[0].category, 'mouse');
  assert.equal(result.category, 'mouse');
  assert.equal(result.domain_count, 0);
  assert.deepEqual(result.top_domains, []);
  assert.equal(result.promotion_suggestion_count, 0);
});
