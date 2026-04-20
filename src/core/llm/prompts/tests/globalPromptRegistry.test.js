/**
 * Contract tests for the global prompt registry and resolver.
 *
 * The registry is the single source of truth for universal prompt fragments.
 * Adding a new global prompt means editing exactly one file: globalPromptRegistry.js.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GLOBAL_PROMPT_KEYS,
  GLOBAL_PROMPTS,
  resolveGlobalPrompt,
} from '../globalPromptRegistry.js';
import { setGlobalPromptsSnapshot } from '../globalPromptStore.js';

describe('GLOBAL_PROMPTS registry', () => {
  const EXPECTED_KEYS = [
    'evidenceContract',
    'evidenceVerification',
    'evidenceKindGuidance',
    'valueConfidenceRubric',
    'identityWarningEasy',
    'identityWarningMedium',
    'identityWarningHard',
    'siblingsExclusion',
    'discoveryHistoryBlock',
  ];

  it('exports all expected keys', () => {
    assert.deepEqual([...GLOBAL_PROMPT_KEYS].sort(), [...EXPECTED_KEYS].sort());
  });

  it('every entry has defaultTemplate, variables, appliesTo, label, description', () => {
    for (const key of GLOBAL_PROMPT_KEYS) {
      const entry = GLOBAL_PROMPTS[key];
      assert.ok(entry, `missing entry: ${key}`);
      assert.equal(typeof entry.defaultTemplate, 'string', `${key}.defaultTemplate`);
      assert.ok(entry.defaultTemplate.length > 0, `${key}.defaultTemplate must not be empty`);
      assert.ok(Array.isArray(entry.variables), `${key}.variables must be array`);
      assert.ok(Array.isArray(entry.appliesTo), `${key}.appliesTo must be array`);
      assert.equal(typeof entry.label, 'string', `${key}.label`);
      assert.equal(typeof entry.description, 'string', `${key}.description`);
    }
  });

  it('evidence-family prompts apply to cef + rdf (PIF excluded)', () => {
    for (const key of ['evidenceContract', 'evidenceVerification', 'valueConfidenceRubric']) {
      const applies = GLOBAL_PROMPTS[key].appliesTo;
      assert.deepEqual([...applies].sort(), ['cef', 'rdf']);
    }
  });

  it('identity/siblings/discovery-history prompts apply to cef + pif + rdf', () => {
    for (const key of ['identityWarningEasy', 'identityWarningMedium', 'identityWarningHard', 'siblingsExclusion', 'discoveryHistoryBlock']) {
      const applies = GLOBAL_PROMPTS[key].appliesTo;
      assert.deepEqual([...applies].sort(), ['cef', 'pif', 'rdf']);
    }
  });

  it('evidenceKindGuidance applies to rdf + scalar (NOT cef/pif/carousel)', () => {
    const applies = GLOBAL_PROMPTS.evidenceKindGuidance.appliesTo;
    assert.deepEqual([...applies].sort(), ['rdf', 'scalar']);
  });

  it('evidenceKindGuidance description explicitly excludes CEF + PIF + Carousel Builder', () => {
    const desc = GLOBAL_PROMPTS.evidenceKindGuidance.description;
    assert.match(desc, /Does Not Apply to:\s*CEF\s*\+\s*PIF\s*\+\s*Carousel Builder/i);
  });

  it('evidenceKindGuidance default template lists all 10 evidence_kind values', () => {
    const tpl = GLOBAL_PROMPTS.evidenceKindGuidance.defaultTemplate;
    for (const kind of [
      'direct_quote', 'structured_metadata', 'byline_timestamp',
      'artifact_metadata', 'visual_inspection', 'lab_measurement',
      'comparative_rebadge', 'inferred_reasoning',
      'absence_of_evidence', 'identity_only',
    ]) {
      assert.ok(tpl.includes(kind), `template must list kind "${kind}"`);
    }
  });

  it('variables declared per entry match {{VAR}} placeholders in defaultTemplate', () => {
    for (const key of GLOBAL_PROMPT_KEYS) {
      const entry = GLOBAL_PROMPTS[key];
      const pattern = /\{\{(\w+)\}\}/g;
      const foundInTemplate = new Set();
      let m;
      while ((m = pattern.exec(entry.defaultTemplate))) foundInTemplate.add(m[1]);
      const declared = new Set((entry.variables || []).map((v) => v.name));
      for (const v of foundInTemplate) {
        assert.ok(declared.has(v), `${key}: template uses {{${v}}} but it's not in variables[]`);
      }
    }
  });
});

describe('resolveGlobalPrompt', () => {
  beforeEach(() => setGlobalPromptsSnapshot({}));

  it('returns defaultTemplate when no override set', () => {
    const out = resolveGlobalPrompt('identityWarningMedium');
    assert.equal(out, GLOBAL_PROMPTS.identityWarningMedium.defaultTemplate);
  });

  it('returns override when set', () => {
    setGlobalPromptsSnapshot({ identityWarningMedium: 'OVERRIDE' });
    assert.equal(resolveGlobalPrompt('identityWarningMedium'), 'OVERRIDE');
  });

  it('empty-string override falls back to default', () => {
    setGlobalPromptsSnapshot({ identityWarningMedium: '' });
    assert.equal(resolveGlobalPrompt('identityWarningMedium'), GLOBAL_PROMPTS.identityWarningMedium.defaultTemplate);
  });

  it('whitespace-only override falls back to default', () => {
    setGlobalPromptsSnapshot({ identityWarningMedium: '   \n  ' });
    assert.equal(resolveGlobalPrompt('identityWarningMedium'), GLOBAL_PROMPTS.identityWarningMedium.defaultTemplate);
  });

  it('throws on unknown key', () => {
    assert.throws(
      () => resolveGlobalPrompt('not-a-real-key'),
      /unknown global prompt key/i,
    );
  });
});
