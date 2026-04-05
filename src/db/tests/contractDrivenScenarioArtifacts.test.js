import test from 'node:test';
import assert from 'node:assert/strict';
import { buildValidationChecks } from '../../tests/testDataProvider.js';
import { createContractDrivenAnalysisHarness } from './fixtures/contractDrivenHarness.js';

test('contract-driven scenario artifacts preserve the behavior exercised by downstream review flows', async (t) => {
  const harness = await createContractDrivenAnalysisHarness();
  const {
    contractAnalysis,
    scenarioDefs,
    productArtifacts,
    getProductByScenarioName,
  } = harness;

  await t.test('happy_path produces broad non-unk coverage instead of a sparse seed shell', () => {
    const product = getProductByScenarioName('happy_path');
    const artifacts = productArtifacts[product.productId].artifacts;
    const allFieldCount = contractAnalysis._raw.fieldKeys.length;
    const populatedFieldCount = Object.values(artifacts.normalized.fields)
      .filter((value) => value && value !== 'unk')
      .length;

    assert.ok(
      populatedFieldCount > allFieldCount * 0.5,
      `${populatedFieldCount}/${allFieldCount} fields populated (expected >50%)`,
    );
    assert.ok(
      artifacts.summary.coverage_overall_percent > 50,
      `coverage ${artifacts.summary.coverage_overall_percent}% (expected >50%)`,
    );
  });

  await t.test('missing_required keeps required fields unresolved with a deliberately sparse source set', () => {
    const product = getProductByScenarioName('missing_required');
    const { artifacts, sourceResults } = productArtifacts[product.productId];

    assert.ok(sourceResults.length <= 2, `should have <=2 sources, got ${sourceResults.length}`);
    assert.ok(
      artifacts.summary.missing_required_fields.length > 0,
      'missing_required should leave at least one required field unresolved',
    );
  });

  await t.test('min_evidence_refs uses a single-source artifact to exercise evidence gating', () => {
    const product = getProductByScenarioName('min_evidence_refs');
    const { sourceResults } = productArtifacts[product.productId];
    assert.strictEqual(sourceResults.length, 1, 'min_evidence_refs should emit exactly one source');
  });

  await t.test('tier_preference_override resolves at least one declared tier-override field when the contract defines them', () => {
    const product = getProductByScenarioName('tier_preference_override');
    if (!product) return;

    const { artifacts } = productArtifacts[product.productId];
    const tierOverrideFields = contractAnalysis._raw.tierOverrideFields || [];
    const resolvedFields = tierOverrideFields.filter((field) => {
      const value = artifacts.normalized.fields[field.key];
      return value && value !== 'unk';
    });

    assert.ok(
      resolvedFields.length > 0 || tierOverrideFields.length === 0,
      `${resolvedFields.length}/${tierOverrideFields.length} declared tier-override fields resolved`,
    );
  });

  await t.test('validation checks stay populated and keep the universal checks green across every scenario', () => {
    for (const scenario of scenarioDefs) {
      const product = harness.getProductByScenarioId(scenario.id);
      const { artifacts } = productArtifacts[product.productId];
      const checks = buildValidationChecks(scenario.id, {
        normalized: artifacts.normalized,
        summary: artifacts.summary,
        suggestionsEnums: { suggestions: [] },
        suggestionsComponents: { suggestions: [] },
        scenarioDefs,
      });

      assert.ok(checks.length > 0, `${scenario.name} should emit validation checks`);
      for (const check of checks) {
        if (check.check === 'has_fields' || check.check === 'has_confidence') {
          assert.ok(check.pass, `${scenario.name} universal check "${check.check}" failed: ${check.detail}`);
        }
      }
    }
  });
});
