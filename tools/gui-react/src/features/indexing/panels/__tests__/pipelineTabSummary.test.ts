import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { derivePipelineTabSummary } from '../pipelineTabSummary.ts';
import type { ProductHistoryAggregate, ProductHistoryResponse } from '../../types.ts';

function response(aggOverrides: Partial<ProductHistoryAggregate> = {}): ProductHistoryResponse {
  return {
    product_id: 'p',
    category: 'mouse',
    aggregate: {
      total_runs: 0,
      completed_runs: 0,
      failed_runs: 0,
      total_cost_usd: 0,
      avg_cost_per_run: 0,
      avg_duration_ms: 0,
      total_queries: 0,
      total_urls: 0,
      urls_success: 0,
      urls_failed: 0,
      unique_hosts: 0,
      ...aggOverrides,
    },
    runs: [],
    queries: [],
    urls: [],
  };
}

describe('derivePipelineTabSummary', () => {
  it('returns idle with "0 runs" when data is null', () => {
    const r = derivePipelineTabSummary(null);
    strictEqual(r.status, 'idle');
    strictEqual(r.kpi, '0 runs');
    deepStrictEqual(Object.keys(r).sort(), ['kpi', 'status']);
  });

  it('returns idle with "0 runs" when total_runs is zero', () => {
    const r = derivePipelineTabSummary(response());
    strictEqual(r.status, 'idle');
    strictEqual(r.kpi, '0 runs');
  });

  it('omits ratio fields when total_urls is zero but runs exist', () => {
    const r = derivePipelineTabSummary(response({
      total_runs: 3,
      completed_runs: 3,
      failed_runs: 0,
      total_urls: 0,
    }));
    strictEqual(r.status, 'complete');
    strictEqual(r.kpi, '3 runs · 0%');
    deepStrictEqual(Object.keys(r).sort(), ['kpi', 'status']);
  });

  it('populates numerator/denominator/percent when urls exist', () => {
    const r = derivePipelineTabSummary(response({
      total_runs: 18,
      completed_runs: 16,
      failed_runs: 2,
      total_urls: 100,
      urls_success: 56,
      urls_failed: 44,
    }));
    strictEqual(r.status, 'partial');
    strictEqual(r.kpi, '18 runs · 56%');
    strictEqual(r.numerator, 56);
    strictEqual(r.denominator, 100);
    strictEqual(r.percent, 56);
  });

  it('status = complete when failed_runs is zero', () => {
    const r = derivePipelineTabSummary(response({
      total_runs: 4,
      completed_runs: 4,
      failed_runs: 0,
      total_urls: 10,
      urls_success: 10,
    }));
    strictEqual(r.status, 'complete');
    strictEqual(r.percent, 100);
  });

  it('status = empty when every run failed', () => {
    const r = derivePipelineTabSummary(response({
      total_runs: 2,
      completed_runs: 0,
      failed_runs: 2,
      total_urls: 5,
      urls_success: 0,
    }));
    strictEqual(r.status, 'empty');
    strictEqual(r.numerator, 0);
    strictEqual(r.denominator, 5);
    strictEqual(r.percent, 0);
  });
});
