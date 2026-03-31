import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  processDiscoveryResults,
  makeProcessDiscoveryResultsArgs,
  makeRawResults,
} from './helpers/triageCharacterizationHarness.js';
describe('processDiscoveryResults SERP/profile contracts', () => {
it('serp_explorer reports funnel counts and query candidate aggregates', async () => {
  const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
    searchAttempts: [
      { query: 'razer viper v3 pro specs', provider: 'google', result_count: 2 },
      { query: 'razer viper v3 pro review', provider: 'bing', result_count: 1 },
    ],
    queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
  }));

  const serpExplorer = result.serp_explorer;
  assert.equal(serpExplorer.query_count, 2);
  assert.equal(serpExplorer.raw_input, makeRawResults().length);
  assert.equal(serpExplorer.candidates_checked, result.candidates.length);
  assert.equal(serpExplorer.urls_triaged, result.candidates.length);
  assert.equal(serpExplorer.urls_selected, result.selectedUrls.length);
  assert.equal(serpExplorer.soft_exclude_count, 0);

  const queryRow = serpExplorer.queries.find((row) => row.query === 'razer viper v3 pro specs');
  assert.ok(queryRow, 'expected the specs query row in serp_explorer');
  assert.equal(queryRow.result_count, 2);
  assert.equal(queryRow.attempts, 1);
  assert.deepEqual(queryRow.providers, ['google']);
  assert.equal(queryRow.candidate_count, queryRow.candidates.length);
  assert.equal(
    queryRow.selected_count,
    queryRow.candidates.filter((candidate) => candidate.decision === 'selected').length,
  );

  const candidate = queryRow.candidates[0];
  assert.equal(typeof candidate.url, 'string');
  assert.equal(typeof candidate.host, 'string');
  assert.equal(typeof candidate.doc_kind, 'string');
  assert.ok(candidate.triage_disposition === null || typeof candidate.triage_disposition === 'string');
  assert.ok(candidate.identity_prelim === null || typeof candidate.identity_prelim === 'string');
  assert.ok(candidate.host_trust_class === null || typeof candidate.host_trust_class === 'string');
  assert.ok(Array.isArray(candidate.reason_codes), 'reason_codes is array');
  assert.ok(Array.isArray(candidate.providers), 'providers is array');
  assert.ok(candidate.score_breakdown === null || typeof candidate.score_breakdown === 'object');
});

it('search_profile exposes executed query stats and embedded serp explorer counts', async () => {
  const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
    searchAttempts: [
      { query: 'razer viper v3 pro specs', provider: 'google', result_count: 2 },
      { query: 'razer viper v3 pro specs', provider: 'bing', result_count: 1 },
    ],
  }));

  const searchProfile = result.search_profile;
  assert.equal(searchProfile.status, 'executed');
  assert.equal(searchProfile.discovered_count, result.candidates.length);
  assert.equal(searchProfile.selected_count, result.selectedUrls.length);
  assert.equal(searchProfile.llm_query_planning, true);
  assert.equal(searchProfile.llm_serp_selector, true);
  assert.equal(typeof searchProfile.llm_query_model, 'string');
  assert.equal(typeof searchProfile.llm_serp_selector_model, 'string');
  assert.ok(Array.isArray(searchProfile.query_rows), 'query_rows is array');
  assert.ok(Array.isArray(searchProfile.query_stats), 'query_stats is array');
  assert.equal(searchProfile.query_rows[0].attempts, 2);
  assert.equal(searchProfile.query_rows[0].result_count, 3);
  assert.deepEqual(searchProfile.query_rows[0].providers, ['google', 'bing']);
  assert.deepEqual(searchProfile.query_stats[0], {
    query: 'razer viper v3 pro specs',
    attempts: 2,
    result_count: 3,
    providers: ['google', 'bing'],
    cooldown_skipped: false,
  });
  assert.equal(searchProfile.serp_explorer.query_count, searchProfile.query_rows.length);
  assert.equal(searchProfile.serp_explorer.urls_selected, searchProfile.selected_count);
});
});
