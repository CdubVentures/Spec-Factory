// WHY: MACRO-RED for the evidence-kind registry. Locks the 10-kind contract
// (matching the backend src/core/finder/evidencePromptFragment.js zod enum),
// the label text, the color-family assignments, and the "only verbatim kinds
// get Copy-Quote" rule used by EvidenceKindTooltip.tsx.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_KIND_VALUES,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KIND_COLOR_CLASS,
  EVIDENCE_KIND_VERBATIM,
  evidenceKindLabel,
  isEvidenceKind,
} from '../evidenceKindRegistry.ts';

const ALL_KINDS = [
  'direct_quote',
  'structured_metadata',
  'byline_timestamp',
  'artifact_metadata',
  'visual_inspection',
  'lab_measurement',
  'comparative_rebadge',
  'inferred_reasoning',
  'absence_of_evidence',
  'identity_only',
] as const;

describe('EVIDENCE_KIND_VALUES', () => {
  it('locks the 10 kinds in documented order (matches backend enum)', () => {
    assert.deepEqual([...EVIDENCE_KIND_VALUES], [...ALL_KINDS]);
  });

  it('is frozen — runtime mutation throws', () => {
    assert.throws(() => {
      (EVIDENCE_KIND_VALUES as string[]).push('new_kind');
    });
  });
});

describe('EVIDENCE_KIND_LABELS', () => {
  it('has a human label for every kind', () => {
    for (const kind of ALL_KINDS) {
      const label = EVIDENCE_KIND_LABELS[kind];
      assert.equal(typeof label, 'string');
      assert.ok(label.length > 0, `label for ${kind} must not be empty`);
    }
  });

  it('labels are Title Case (no snake_case leakage)', () => {
    for (const kind of ALL_KINDS) {
      const label = EVIDENCE_KIND_LABELS[kind];
      assert.ok(!label.includes('_'), `label for ${kind} must not contain underscores`);
      assert.match(label[0], /[A-Z]/, `label for ${kind} must start with uppercase`);
    }
  });
});

describe('EVIDENCE_KIND_COLOR_CLASS', () => {
  it('has a semantic text color class for every kind', () => {
    for (const kind of ALL_KINDS) {
      const cls = EVIDENCE_KIND_COLOR_CLASS[kind];
      assert.equal(typeof cls, 'string');
      assert.ok(cls.includes('text-'), `color class for ${kind} must be a text-* utility`);
    }
  });

  it('identity_only is dimmed (opacity-60)', () => {
    assert.match(EVIDENCE_KIND_COLOR_CLASS.identity_only, /opacity-60/);
  });

  it('direct_quote and structured_metadata share the green family', () => {
    assert.match(EVIDENCE_KIND_COLOR_CLASS.direct_quote, /success/);
    assert.match(EVIDENCE_KIND_COLOR_CLASS.structured_metadata, /success/);
  });

  it('absence_of_evidence and identity_only share the red family', () => {
    assert.match(EVIDENCE_KIND_COLOR_CLASS.absence_of_evidence, /danger/);
    assert.match(EVIDENCE_KIND_COLOR_CLASS.identity_only, /danger/);
  });
});

describe('EVIDENCE_KIND_VERBATIM', () => {
  it('contains direct_quote + structured_metadata only', () => {
    assert.equal(EVIDENCE_KIND_VERBATIM.size, 2);
    assert.ok(EVIDENCE_KIND_VERBATIM.has('direct_quote'));
    assert.ok(EVIDENCE_KIND_VERBATIM.has('structured_metadata'));
  });

  it('does NOT include reasoning / byline / absence kinds (non-verbatim)', () => {
    for (const kind of [
      'byline_timestamp',
      'artifact_metadata',
      'visual_inspection',
      'lab_measurement',
      'comparative_rebadge',
      'inferred_reasoning',
      'absence_of_evidence',
      'identity_only',
    ] as const) {
      assert.ok(!EVIDENCE_KIND_VERBATIM.has(kind), `${kind} must NOT be in VERBATIM set`);
    }
  });
});

describe('evidenceKindLabel', () => {
  it('returns the label for a known kind', () => {
    assert.equal(evidenceKindLabel('direct_quote'), 'Direct Quote');
    assert.equal(evidenceKindLabel('identity_only'), 'Identity Only');
  });

  it('returns empty string for unknown kind', () => {
    assert.equal(evidenceKindLabel('made_up_kind'), '');
  });

  it('returns empty string for null / undefined / non-string', () => {
    assert.equal(evidenceKindLabel(null), '');
    assert.equal(evidenceKindLabel(undefined), '');
    assert.equal(evidenceKindLabel(42 as unknown as string), '');
  });
});

describe('isEvidenceKind', () => {
  it('returns true for every known kind', () => {
    for (const kind of ALL_KINDS) assert.ok(isEvidenceKind(kind));
  });

  it('returns false for unknown / non-string input', () => {
    assert.equal(isEvidenceKind('bogus'), false);
    assert.equal(isEvidenceKind(null), false);
    assert.equal(isEvidenceKind(undefined), false);
    assert.equal(isEvidenceKind(0), false);
    assert.equal(isEvidenceKind({}), false);
  });
});
