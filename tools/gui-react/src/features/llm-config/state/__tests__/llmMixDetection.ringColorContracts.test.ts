import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';

import { resolveRingColor } from '../llmMixDetection.ts';
import type { MixIssue } from '../llmMixDetection.ts';

const errorIssue: MixIssue = {
  key: 'fallback-same-as-base',
  severity: 'error',
  title: 'Fallback matches base',
  message: 'test',
  ringFields: ['llmPlanFallbackModel'],
};

const warningIssue: MixIssue = {
  key: 'cross-provider-base-reasoning',
  severity: 'warning',
  title: 'Cross-provider',
  message: 'test',
  ringFields: ['llmModelPlan', 'llmModelReasoning'],
};

const infoIssue: MixIssue = {
  key: 'no-base-fallback',
  severity: 'info',
  title: 'No fallback',
  message: 'test',
  ringFields: ['llmPlanFallbackModel'],
};

describe('resolveRingColor contracts', () => {
  it('maps active issues to the highest-severity ring color for a field', () => {
    const cases = [
      {
        name: 'error trumps warning and info',
        field: 'llmPlanFallbackModel',
        issues: [infoIssue, errorIssue, warningIssue],
        dismissed: {},
        expected: 'var(--sf-error, #dc2626)',
      },
      {
        name: 'warning trumps info when no error remains',
        field: 'llmModelPlan',
        issues: [infoIssue, warningIssue],
        dismissed: {},
        expected: 'var(--sf-warning, #d97706)',
      },
      {
        name: 'info resolves when it is the only active severity',
        field: 'llmPlanFallbackModel',
        issues: [infoIssue],
        dismissed: {},
        expected: 'var(--sf-info, #2563eb)',
      },
      {
        name: 'partial dismissal leaves remaining lower-severity issues visible',
        field: 'llmPlanFallbackModel',
        issues: [errorIssue, infoIssue],
        dismissed: { 'fallback-same-as-base': true },
        expected: 'var(--sf-info, #2563eb)',
      },
    ];

    for (const row of cases) {
      strictEqual(
        resolveRingColor(row.field, row.issues, row.dismissed),
        row.expected,
        row.name,
      );
    }
  });

  it('returns null when every matching issue is dismissed or no issue targets the field', () => {
    const cases = [
      {
        name: 'full dismissal removes the ring color',
        field: 'llmPlanFallbackModel',
        issues: [errorIssue, infoIssue],
        dismissed: { 'fallback-same-as-base': true, 'no-base-fallback': true },
      },
      {
        name: 'non-matching issue fields do not affect the ring',
        field: 'llmModelReasoning',
        issues: [errorIssue, infoIssue],
        dismissed: {},
      },
      {
        name: 'empty issue lists return null',
        field: 'llmModelPlan',
        issues: [],
        dismissed: {},
      },
    ];

    for (const row of cases) {
      strictEqual(resolveRingColor(row.field, row.issues, row.dismissed), null, row.name);
    }
  });
});
