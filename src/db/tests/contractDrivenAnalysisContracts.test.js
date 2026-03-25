import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CATEGORY,
  HELPER_ROOT,
  createContractDrivenAnalysisHarness,
} from './fixtures/contractDrivenHarness.js';

test('contract-driven analysis contracts stay aligned with the authored mouse contract', async (t) => {
  const harness = await createContractDrivenAnalysisHarness();
  const { contractAnalysis, scenarioDefs } = harness;
  const fieldRulesRaw = contractAnalysis._raw.fields;
  const componentTypes = contractAnalysis._raw.componentTypes;

  await t.test('component property keys always resolve to field definitions', () => {
    const missing = [];
    for (const componentType of componentTypes) {
      for (const propertyKey of componentType.propKeys) {
        if (!fieldRulesRaw[propertyKey]) {
          missing.push(`${componentType.type}.${propertyKey}`);
        }
      }
    }
    assert.strictEqual(
      missing.length,
      0,
      `component property keys missing from fields: ${missing.join(', ')}`,
    );
  });

  await t.test('component property mappings declare field_key on both generated and workbook sources', async () => {
    const fieldRulesJson = JSON.parse(
      await fs.readFile(path.join(HELPER_ROOT, CATEGORY, '_generated', 'field_rules.json'), 'utf8'),
    );
    const workbookMap = JSON.parse(
      await fs.readFile(path.join(HELPER_ROOT, CATEGORY, '_control_plane', 'field_studio_map.json'), 'utf8'),
    );
    const generatedSources = Object.values(fieldRulesJson.component_db_sources || {});
    const workbookSources = workbookMap.component_db_sources || [];
    const propertyMappings = [
      ...generatedSources.flatMap((source) => source.roles?.properties || source.property_mappings || []),
      ...workbookSources.flatMap((source) => source.roles?.properties || []),
    ];

    const missingFieldKey = [...new Set(
      propertyMappings
        .filter((mapping) => mapping.key && !mapping.field_key)
        .map((mapping) => mapping.key),
    )];

    assert.strictEqual(
      missingFieldKey.length,
      0,
      `property mappings missing field_key: ${missingFieldKey.join(', ')}`,
    );
  });

  await t.test('component property fields keep variance and constraint metadata available to downstream consumers', () => {
    const missingVariancePolicy = [];
    const missingConstraintsArray = [];

    for (const componentType of componentTypes) {
      for (const propertyKey of componentType.propKeys) {
        const fieldDefinition = fieldRulesRaw[propertyKey];
        if (!fieldDefinition) continue;
        if (!fieldDefinition.variance_policy) missingVariancePolicy.push(propertyKey);
        if (!Array.isArray(fieldDefinition.constraints)) missingConstraintsArray.push(propertyKey);
      }
    }

    assert.strictEqual(
      missingVariancePolicy.length,
      0,
      `component property fields missing variance_policy: ${missingVariancePolicy.join(', ')}`,
    );
    assert.strictEqual(
      missingConstraintsArray.length,
      0,
      `component property fields missing constraints array: ${missingConstraintsArray.join(', ')}`,
    );
  });

  await t.test('cross-validation coverage matrix includes every trigger and related contract field', () => {
    const crossValidationId = scenarioDefs.find((scenario) => scenario.name === 'cross_validation')?.id;
    if (!crossValidationId) return;

    const assignedFields = new Set(
      contractAnalysis.matrices.fieldRules.rows
        .filter((row) => row.testNumbers.includes(crossValidationId))
        .map((row) => row.cells.fieldKey),
    );
    const existingFieldKeys = new Set(contractAnalysis._raw.fieldKeys);
    const expectedFields = new Set(
      (contractAnalysis._raw.rules || []).flatMap((rule) => [
        rule.trigger_field,
        ...(rule.related_fields || []),
        ...(rule.depends_on || []),
        ...(rule.requires_field ? [rule.requires_field] : []),
      ]).filter(Boolean),
    );

    for (const fieldKey of expectedFields) {
      if (!existingFieldKeys.has(fieldKey)) continue;
      assert.ok(
        assignedFields.has(fieldKey),
        `contract cross-validation field "${fieldKey}" should have cross_validation coverage`,
      );
    }
  });

  await t.test('component-constraint coverage matrix includes every constrained component property field', () => {
    const constraintId = scenarioDefs.find((scenario) => scenario.name === 'component_constraints')?.id;
    if (!constraintId) return;

    const assignedFields = new Set(
      contractAnalysis.matrices.fieldRules.rows
        .filter((row) => row.testNumbers.includes(constraintId))
        .map((row) => row.cells.fieldKey),
    );
    const existingFieldKeys = new Set(contractAnalysis._raw.fieldKeys);
    const constrainedFields = new Set(
      componentTypes.flatMap((componentType) => Object.keys(componentType.allConstraints)),
    );

    for (const fieldKey of constrainedFields) {
      if (!existingFieldKeys.has(fieldKey)) continue;
      assert.ok(
        assignedFields.has(fieldKey),
        `component constraint field "${fieldKey}" should have component_constraints coverage`,
      );
    }
  });

  await t.test('variance-policy coverage matrix includes every non-authoritative component property field', () => {
    const varianceId = scenarioDefs.find((scenario) => scenario.name === 'variance_policies')?.id;
    if (!varianceId) return;

    const assignedFields = new Set(
      contractAnalysis.matrices.fieldRules.rows
        .filter((row) => row.testNumbers.includes(varianceId))
        .map((row) => row.cells.fieldKey),
    );
    const expectedFields = new Set(
      componentTypes.flatMap((componentType) =>
        Object.entries(componentType.allVariancePolicies)
          .filter(([, policy]) => policy !== 'authoritative')
          .map(([fieldKey]) => fieldKey),
      ),
    );

    for (const fieldKey of expectedFields) {
      assert.ok(
        assignedFields.has(fieldKey),
        `non-authoritative variance field "${fieldKey}" should have variance_policies coverage`,
      );
    }
  });
});
