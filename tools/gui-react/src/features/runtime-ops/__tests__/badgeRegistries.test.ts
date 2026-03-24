// WHY: Golden-master characterization tests — locks down all badge function
// behavior before refactoring switches into registries.
import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import {
  statusBadgeClass,
  workerStateBadgeClass,
  methodBadgeClass,
  fieldStatusBadgeClass,
  fallbackResultBadgeClass,
  fetchModeBadgeClass,
  queueStatusBadgeClass,
  tierLabel,
  tierBadgeClass,
  llmCallStatusBadgeClass,
  triageDecisionBadgeClass,
  domainRoleBadgeClass,
  safetyClassBadgeClass,
  friendlyMethod,
} from '../helpers';
import {
  resolveNeedsetState,
  resolveNeedsetBucket,
  resolveIdentityBadge,
  resolveBlockerBadge,
} from '../badgeRegistries';

// ── Table-driven helper ──────────────────────────────────────────────
function assertTable(fn: (k: string) => string, table: [string, string][]) {
  for (const [input, expected] of table) {
    it(`"${input}" → "${expected}"`, () => {
      strictEqual(fn(input), expected);
    });
  }
}

// ── statusBadgeClass ─────────────────────────────────────────────────
describe('statusBadgeClass', () => {
  assertTable(statusBadgeClass, [
    ['running',     'sf-chip-info'],
    ['fetching',    'sf-chip-success'],
    ['parsing',     'sf-chip-info'],
    ['indexing',    'sf-chip-success'],
    ['completed',   'sf-chip-success'],
    ['fetched',     'sf-chip-success'],
    ['parsed',      'sf-chip-success'],
    ['indexed',     'sf-chip-success'],
    ['idle',        'sf-chip-success'],
    ['stuck',       'sf-chip-danger'],
    ['fetch_error', 'sf-chip-danger'],
    ['failed',      'sf-chip-danger'],
    ['skipped',     'sf-chip-warning'],
    ['__unknown__', 'sf-chip-neutral'],
  ]);
});

// ── workerStateBadgeClass ────────────────────────────────────────────
describe('workerStateBadgeClass', () => {
  assertTable(workerStateBadgeClass, [
    ['stuck',    'sf-chip-danger animate-pulse'],
    ['running',  'sf-chip-info'],
    ['blocked',  'sf-chip-warning'],
    ['captcha',  'sf-chip-danger'],
    ['retrying', 'sf-chip-info animate-pulse'],
    ['queued',   'sf-chip-neutral opacity-50'],
    ['idle',     'sf-chip-neutral'],
    ['__unknown__', 'sf-chip-neutral'],
  ]);
});

// ── methodBadgeClass ─────────────────────────────────────────────────
describe('methodBadgeClass', () => {
  assertTable(methodBadgeClass, [
    ['html_spec_table',          'sf-chip-info'],
    ['html_table',               'sf-chip-info'],
    ['embedded_json',            'sf-chip-accent'],
    ['json_ld',                  'sf-chip-accent'],
    ['microdata',                'sf-chip-accent'],
    ['opengraph',                'sf-chip-accent'],
    ['main_article',             'sf-chip-info'],
    ['dom',                      'sf-chip-info'],
    ['pdf_text',                 'sf-chip-warning'],
    ['pdf_kv',                   'sf-chip-warning'],
    ['pdf_table',                'sf-chip-warning'],
    ['scanned_pdf_ocr',          'sf-chip-danger'],
    ['scanned_pdf_ocr_table',    'sf-chip-danger'],
    ['scanned_pdf_ocr_kv',       'sf-chip-danger'],
    ['scanned_pdf_ocr_text',     'sf-chip-danger'],
    ['image_ocr',                'sf-chip-danger'],
    ['chart_payload',            'sf-chip-accent'],
    ['network_json',             'sf-chip-accent'],
    ['llm_extract',              'sf-chip-warning'],
    ['llm_validate',             'sf-chip-warning'],
    ['deterministic_normalizer', 'sf-chip-success'],
    ['consensus_policy_reducer', 'sf-chip-success'],
    ['__unknown__',              'sf-chip-neutral'],
  ]);
});

// ── friendlyMethod ───────────────────────────────────────────────────
describe('friendlyMethod', () => {
  assertTable(friendlyMethod, [
    ['html_spec_table',          'HTML Spec Table'],
    ['html_table',               'HTML Table'],
    ['embedded_json',            'Embedded JSON'],
    ['json_ld',                  'JSON-LD'],
    ['microdata',                'Microdata'],
    ['opengraph',                'OpenGraph'],
    ['main_article',             'Article Text'],
    ['dom',                      'DOM Selector'],
    ['pdf_text',                 'PDF Text'],
    ['pdf_kv',                   'PDF Key-Value'],
    ['pdf_table',                'PDF Table'],
    ['scanned_pdf_ocr',          'Scanned PDF (OCR)'],
    ['scanned_pdf_ocr_table',    'Scanned PDF Table (OCR)'],
    ['scanned_pdf_ocr_kv',       'Scanned PDF KV (OCR)'],
    ['scanned_pdf_ocr_text',     'Scanned PDF Text (OCR)'],
    ['image_ocr',                'Image OCR'],
    ['chart_payload',            'Chart Data'],
    ['network_json',             'Network JSON'],
    ['llm_extract',              'LLM Extraction'],
    ['llm_validate',             'LLM Validation'],
    ['deterministic_normalizer', 'Normalizer'],
    ['consensus_policy_reducer', 'Consensus'],
    ['__unknown__',              '__unknown__'],
  ]);
});

// ── fieldStatusBadgeClass ────────────────────────────────────────────
describe('fieldStatusBadgeClass', () => {
  assertTable(fieldStatusBadgeClass, [
    ['accepted',    'sf-chip-success'],
    ['conflict',    'sf-chip-danger'],
    ['candidate',   'sf-chip-info'],
    ['unknown',     'sf-chip-warning'],
    ['__unknown__', 'sf-chip-neutral'],
  ]);
});

// ── fallbackResultBadgeClass ─────────────────────────────────────────
describe('fallbackResultBadgeClass', () => {
  assertTable(fallbackResultBadgeClass, [
    ['succeeded',   'sf-chip-success'],
    ['exhausted',   'sf-chip-danger'],
    ['failed',      'sf-chip-danger'],
    ['pending',     'sf-chip-info'],
    ['__unknown__', 'sf-chip-neutral'],
  ]);
});

// ── fetchModeBadgeClass ──────────────────────────────────────────────
describe('fetchModeBadgeClass', () => {
  assertTable(fetchModeBadgeClass, [
    ['playwright',  'sf-chip-accent'],
    ['crawlee',     'sf-chip-info'],
    ['http',        'sf-chip-success'],
    ['__unknown__', 'sf-chip-neutral'],
  ]);
});

// ── queueStatusBadgeClass ────────────────────────────────────────────
describe('queueStatusBadgeClass', () => {
  assertTable(queueStatusBadgeClass, [
    ['queued',      'sf-chip-info'],
    ['running',     'sf-chip-info animate-pulse'],
    ['done',        'sf-chip-success'],
    ['failed',      'sf-chip-danger'],
    ['cooldown',    'sf-chip-warning'],
    ['__unknown__', 'sf-chip-neutral'],
  ]);
});

// ── tierLabel ────────────────────────────────────────────────────────
describe('tierLabel', () => {
  const table: [number | null, string][] = [
    [1,    'T1 Official'],
    [2,    'T2 Lab Review'],
    [3,    'T3 Retail'],
    [4,    'T4 Unverified'],
    [null, '-'],
    [99,   '-'],
  ];
  for (const [input, expected] of table) {
    it(`${input} → "${expected}"`, () => {
      strictEqual(tierLabel(input), expected);
    });
  }
});

// ── tierBadgeClass ───────────────────────────────────────────────────
describe('tierBadgeClass', () => {
  const table: [number | null, string][] = [
    [1,    'sf-chip-success'],
    [2,    'sf-chip-info'],
    [3,    'sf-chip-warning'],
    [4,    'sf-chip-neutral'],
    [null, 'sf-chip-neutral'],
    [99,   'sf-chip-neutral'],
  ];
  for (const [input, expected] of table) {
    it(`${input} → "${expected}"`, () => {
      strictEqual(tierBadgeClass(input), expected);
    });
  }
});

// ── llmCallStatusBadgeClass ──────────────────────────────────────────
describe('llmCallStatusBadgeClass', () => {
  assertTable(llmCallStatusBadgeClass, [
    ['finished',    'sf-chip-success'],
    ['failed',      'sf-chip-danger'],
    ['running',     'sf-chip-info animate-pulse'],
    ['__unknown__', 'sf-chip-neutral'],
  ]);
});

// ── triageDecisionBadgeClass ─────────────────────────────────────────
describe('triageDecisionBadgeClass', () => {
  assertTable(triageDecisionBadgeClass, [
    ['keep',        'sf-chip-success'],
    ['hard_drop',   'sf-chip-warning'],
    ['drop',        'sf-chip-danger'],
    ['skip',        'sf-chip-danger'],
    ['fetch',       'sf-chip-info'],
    ['__unknown__', 'sf-chip-neutral'],
  ]);
});

// ── domainRoleBadgeClass ─────────────────────────────────────────────
describe('domainRoleBadgeClass', () => {
  assertTable(domainRoleBadgeClass, [
    ['manufacturer', 'sf-chip-success'],
    ['lab_review',   'sf-chip-info'],
    ['review',       'sf-chip-info'],
    ['retail',       'sf-chip-warning'],
    ['database',     'sf-chip-accent'],
    ['__unknown__',  'sf-chip-neutral'],
  ]);
});

// ── safetyClassBadgeClass ────────────────────────────────────────────
describe('safetyClassBadgeClass', () => {
  assertTable(safetyClassBadgeClass, [
    ['safe',        'sf-chip-success'],
    ['caution',     'sf-chip-warning'],
    ['blocked',     'sf-chip-danger'],
    ['unsafe',      'sf-chip-danger'],
    ['__unknown__', 'sf-chip-neutral'],
  ]);
});

// ══════════════════════════════════════════════════════════════════════
// Prefetch panel registries (Finding 2)
// ══════════════════════════════════════════════════════════════════════

// ── resolveNeedsetState (merges stateBadge + stateDotCls) ────────────
describe('resolveNeedsetState', () => {
  const table: [string, { label: string; badge: string; dot: string }][] = [
    ['missing',     { label: 'missing',   badge: 'sf-chip-danger',  dot: 'bg-[var(--sf-state-error-fg)]' }],
    ['weak',        { label: 'weak',      badge: 'sf-chip-warning', dot: 'bg-[var(--sf-state-warning-fg)]' }],
    ['conflict',    { label: 'conflict',  badge: 'sf-chip-danger',  dot: 'bg-[var(--sf-state-error-fg)]' }],
    ['satisfied',   { label: 'satisfied', badge: 'sf-chip-success', dot: 'bg-[var(--sf-state-success-fg)]' }],
    ['covered',     { label: 'satisfied', badge: 'sf-chip-success', dot: 'bg-[var(--sf-state-success-fg)]' }],
  ];
  for (const [input, expected] of table) {
    it(`"${input}" → badge="${expected.badge}", dot="${expected.dot}"`, () => {
      const result = resolveNeedsetState(input);
      strictEqual(result.label, expected.label);
      strictEqual(result.badge, expected.badge);
      strictEqual(result.dot, expected.dot);
    });
  }
  it('unknown state falls back with dynamic label', () => {
    const result = resolveNeedsetState('exotic');
    strictEqual(result.label, 'exotic');
    strictEqual(result.badge, 'sf-chip-neutral');
    strictEqual(result.dot, 'sf-bg-surface-soft-strong');
  });
  it('empty string falls back with "unknown" label', () => {
    const result = resolveNeedsetState('');
    strictEqual(result.label, 'unknown');
    strictEqual(result.badge, 'sf-chip-neutral');
  });
});

// ── resolveNeedsetBucket ─────────────────────────────────────────────
describe('resolveNeedsetBucket', () => {
  const table: [string, { label: string; badge: string }][] = [
    ['core',      { label: 'core',      badge: 'sf-chip-danger' }],
    ['secondary', { label: 'secondary', badge: 'sf-chip-warning' }],
    ['expected',  { label: 'expected',  badge: 'sf-chip-info' }],
    ['optional',  { label: 'optional',  badge: 'sf-chip-neutral' }],
  ];
  for (const [input, expected] of table) {
    it(`"${input}" → badge="${expected.badge}"`, () => {
      const result = resolveNeedsetBucket(input);
      strictEqual(result.label, expected.label);
      strictEqual(result.badge, expected.badge);
    });
  }
  it('unknown bucket falls back with dynamic label', () => {
    const result = resolveNeedsetBucket('exotic');
    strictEqual(result.label, 'exotic');
    strictEqual(result.badge, 'sf-chip-neutral');
  });
  it('empty string falls back with "unknown" label', () => {
    const result = resolveNeedsetBucket('');
    strictEqual(result.label, 'unknown');
    strictEqual(result.badge, 'sf-chip-neutral');
  });
});

// ── resolveIdentityBadge ─────────────────────────────────────────────
describe('resolveIdentityBadge', () => {
  assertTable(resolveIdentityBadge, [
    ['exact',       'sf-chip-success'],
    ['family',      'sf-chip-info'],
    ['variant',     'sf-chip-warning'],
    ['multi_model', 'sf-chip-danger'],
    ['off_target',  'sf-chip-danger'],
    ['__unknown__', 'sf-chip-neutral'],
  ]);
});

// ── resolveBlockerBadge ──────────────────────────────────────────────
describe('resolveBlockerBadge', () => {
  assertTable(resolveBlockerBadge, [
    ['missing',           'sf-chip-neutral'],
    ['weak',              'sf-chip-warning'],
    ['weak_evidence',     'sf-chip-warning'],
    ['conflict',          'sf-chip-danger'],
    ['needs_exact_match', 'sf-chip-confirm'],
    ['__unknown__',       'sf-chip-neutral'],
  ]);
});
