import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  FieldRulesEngine,
  createEngineFixtureRoot,
  createAdvancedEngineFixtureRoot,
} from './helpers/fieldRulesEngineHarness.js';

test('enforceEnumPolicy supports alias resolution and closed-policy rejection', async () => {
  const fixture = await createEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const aliased = engine.enforceEnumPolicy('connection', 'usb wired');
    assert.equal(aliased.ok, true);
    assert.equal(aliased.canonical_value, 'wired');
    assert.equal(aliased.was_aliased, true);

    const rejected = engine.enforceEnumPolicy('connection', 'satellite');
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason_code, 'enum_value_not_allowed');

    engine.rules.connection = {
      ...(engine.rules.connection || {}),
      enum_policy: 'closed_with_curation'
    };
    const rejectedClosedWithCuration = engine.enforceEnumPolicy('connection', 'satellite');
    assert.equal(rejectedClosedWithCuration.ok, false);
    assert.equal(rejectedClosedWithCuration.reason_code, 'enum_value_not_allowed');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('auditEvidence enforces url/snippet/quote and snippet text match', async () => {
  const fixture = await createEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const missing = engine.auditEvidence('weight', 54, {
      url: 'https://example.com/specs'
    });
    assert.equal(missing.ok, false);

    const mismatch = engine.auditEvidence(
      'weight',
      54,
      {
        url: 'https://example.com/specs',
        snippet_id: 's1',
        quote: '54 grams'
      },
      {
        evidencePack: {
          snippets: {
            s1: {
              text: 'The mouse weighs 58 grams.'
            }
          }
        }
      }
    );
    assert.equal(mismatch.ok, false);

    const ok = engine.auditEvidence(
      'weight',
      54,
      {
        url: 'https://example.com/specs',
        snippet_id: 's1',
        quote: '54 grams'
      },
      {
        evidencePack: {
          snippets: {
            s1: {
              text: 'Official specs list weight as 54 grams.'
            }
          }
        }
      }
    );
    assert.equal(ok.ok, true);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('auditEvidence strict mode validates source_id/snippet_hash/quote_span/retrieved_at/extraction_method', async () => {
  const fixture = await createAdvancedEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const bad = engine.auditEvidence(
      'sensor',
      'PAW3395',
      {
        url: 'https://example.com/specs',
        snippet_id: 's1',
        quote: 'PAW3395'
      },
      {
        strictEvidence: true,
        evidencePack: {
          snippets: {
            s1: {
              text: 'Sensor is PAW3395.',
              snippet_hash: 'sha256:good'
            }
          }
        }
      }
    );
    assert.equal(bad.ok, false);

    const ok = engine.auditEvidence(
      'sensor',
      'PAW3395',
      {
        url: 'https://example.com/specs',
        source_id: 'example_com',
        snippet_id: 's1',
        snippet_hash: 'sha256:good',
        quote: 'PAW3395',
        quote_span: [10, 17],
        retrieved_at: '2026-02-12T10:30:00Z',
        extraction_method: 'spec_table_match'
      },
      {
        strictEvidence: true,
        evidencePack: {
          snippets: {
            s1: {
              text: 'Sensor is PAW3395.',
              snippet_hash: 'sha256:good'
            }
          }
        }
      }
    );
    assert.equal(ok.ok, true);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
