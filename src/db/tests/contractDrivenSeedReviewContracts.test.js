import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REAL_FLAGS,
  createContractDrivenSeedReviewHarness,
} from './fixtures/contractDrivenHarness.js';

const RETAINED_REVIEW_SCENARIOS = [
  'happy_path',
  'new_encoder',
  'new_material',
  'new_sensor',
  'new_switch',
  'cross_validation',
  'min_evidence_refs',
];

test('contract-driven seeded review contracts survive DB materialization and review payload building', async (t) => {
  const harness = await createContractDrivenSeedReviewHarness(t, {
    scenarioNames: RETAINED_REVIEW_SCENARIOS,
  });
  const {
    contractAnalysis,
    db,
    componentIdentityRowsByType,
    getProductByScenarioName,
    getReviewPayload,
    getComponentReviewPayload,
    getEnumReviewPayload,
  } = harness;

  await t.test('component aliases resolve by canonical name and stored aliases', () => {
    for (const componentType of contractAnalysis._raw.componentTypes) {
      const identities = componentIdentityRowsByType.get(componentType.type) || [];
      assert.ok(identities.length > 0, `no identities seeded for ${componentType.type}`);

      const seededIdentity = identities.find((row) => String(row?.maker || '').trim()) || identities[0];
      const canonicalName = String(seededIdentity?.canonical_name || '').trim();
      assert.ok(canonicalName, `missing canonical name for ${componentType.type}`);

      const byCanonicalName = db.findComponentByAlias(componentType.type, canonicalName);
      assert.ok(byCanonicalName, `canonical lookup failed for ${componentType.type}/${canonicalName}`);

      const aliasRow = db.db.prepare(
        `SELECT alias
         FROM component_aliases
         WHERE component_id = ?
         ORDER BY alias
         LIMIT 1`,
      ).get(seededIdentity.id);
      assert.ok(aliasRow?.alias, `missing alias row for ${componentType.type}/${canonicalName}`);

      const byAlias = db.findComponentByAlias(componentType.type, aliasRow.alias);
      assert.ok(byAlias, `alias lookup failed for ${componentType.type}/${aliasRow.alias}`);
      assert.strictEqual(byAlias.canonical_name, byCanonicalName.canonical_name);
    }
  });

  await t.test('seeded component_values preserve the variance policy declared in field rules', () => {
    const mismatches = [];
    for (const componentType of contractAnalysis._raw.componentTypes) {
      for (const propertyKey of componentType.propKeys) {
        const fieldDefinition = contractAnalysis._raw.fields[propertyKey];
        if (!fieldDefinition || fieldDefinition.variance_policy == null) continue;

        const rows = db.db.prepare(
          `SELECT DISTINCT variance_policy
           FROM component_values
           WHERE category = ? AND property_key = ? AND variance_policy IS NOT NULL`,
        ).all(db.category, propertyKey);

        for (const row of rows) {
          if (row.variance_policy !== fieldDefinition.variance_policy) {
            mismatches.push(`${propertyKey}: db="${row.variance_policy}" vs field="${fieldDefinition.variance_policy}"`);
          }
        }
      }
    }

    assert.strictEqual(
      mismatches.length,
      0,
      `seeded variance_policy mismatches: ${mismatches.join(', ')}`,
    );
  });

  await t.test('key-review rows are materialized into the seeded database', () => {
    const counts = db.counts();

    const expectedKeyReviewCounts = [
      {
        label: 'grid_key',
        actual: db.db.prepare(
          "SELECT COUNT(*) AS c FROM key_review_state WHERE category = ? AND target_kind = 'grid_key'",
        ).get(db.category).c,
        expected: counts.item_field_state,
      },
      {
        label: 'enum_key',
        actual: db.db.prepare(
          "SELECT COUNT(*) AS c FROM key_review_state WHERE category = ? AND target_kind = 'enum_key'",
        ).get(db.category).c,
        expected: counts.list_values,
      },
      {
        label: 'component_key',
        actual: db.db.prepare(
          "SELECT COUNT(*) AS c FROM key_review_state WHERE category = ? AND target_kind = 'component_key'",
        ).get(db.category).c,
        expected: counts.component_values,
      },
    ];

    for (const { label, actual, expected } of expectedKeyReviewCounts) {
      assert.ok(actual > 0, `${label} rows should exist`);
      assert.strictEqual(actual, expected, `${label} count (${actual}) should match seeded source count (${expected})`);
    }
  });

  await t.test('key-review lane statuses mirror overridden and pending item-field state', () => {
    const overriddenItemCount = db.db.prepare(
      'SELECT COUNT(*) AS c FROM item_field_state WHERE category = ? AND overridden = 1',
    ).get(db.category).c;
    if (overriddenItemCount > 0) {
      const acceptedGridRows = db.db.prepare(
        "SELECT COUNT(*) AS c FROM key_review_state WHERE category = ? AND target_kind = 'grid_key' AND user_accept_primary_status = 'accepted'",
      ).get(db.category).c;
      assert.ok(
        acceptedGridRows >= overriddenItemCount,
        `accepted grid-key rows (${acceptedGridRows}) should cover overridden item fields (${overriddenItemCount})`,
      );
    }

    const pendingAiItemCount = db.db.prepare(
      'SELECT COUNT(*) AS c FROM item_field_state WHERE category = ? AND needs_ai_review = 1 AND ai_review_complete = 0',
    ).get(db.category).c;
    if (pendingAiItemCount > 0) {
      const pendingGridRows = db.db.prepare(
        "SELECT COUNT(*) AS c FROM key_review_state WHERE category = ? AND target_kind = 'grid_key' AND ai_confirm_primary_status = 'pending'",
      ).get(db.category).c;
      assert.ok(
        pendingGridRows >= pendingAiItemCount,
        `pending grid-key rows (${pendingGridRows}) should cover AI-review item fields (${pendingAiItemCount})`,
      );
    }
  });

  await t.test('component review payloads expose discovered rows, property columns, and variance violations', async () => {
    const componentPayloads = await Promise.all(
      contractAnalysis._raw.componentTypes.map(async (componentType) => ({
        componentType,
        payload: await getComponentReviewPayload(componentType.type),
      })),
    );

    for (const { componentType, payload } of componentPayloads) {
      assert.ok(payload.items.length > 0, `${componentType.type} should surface review rows`);

      if (componentType.propKeys.length > 0) {
        assert.ok(
          payload.property_columns.length > 0,
          `${componentType.type} should expose property columns for review consumers`,
        );
      }

      const newComponentRows = payload.items.filter((row) =>
        row.name_tracked?.reason_codes?.includes('new_component'));
      assert.ok(
        newComponentRows.length > 0,
        `${componentType.type} should include at least one pipeline-discovered row`,
      );

      if (Object.keys(componentType.allVariancePolicies).length > 0) {
        const reasonCodes = payload.items.flatMap((row) =>
          Object.values(row.properties || {}).flatMap((property) => property.reason_codes || []));
        assert.ok(
          reasonCodes.includes('variance_violation'),
          `${componentType.type} should surface a variance_violation in component review payloads`,
        );
      }
    }
  });

  await t.test('enum review payload keeps pipeline-suggested values reviewable', async () => {
    const enumPayload = await getEnumReviewPayload();
    const openPreferKnownCatalogs = (contractAnalysis._raw.knownValuesCatalogs || [])
      .filter((catalog) => catalog.policy === 'open_prefer_known' && catalog.catalog !== 'yes_no' && catalog.usingFields?.[0]);

    assert.ok(openPreferKnownCatalogs.length > 0, 'expected at least one open_prefer_known catalog');
    for (const catalog of openPreferKnownCatalogs) {
      const fieldKey = catalog.usingFields[0];
      const enumField = enumPayload.fields.find((field) => field.field === fieldKey);
      if (!enumField) continue;

      const pipelineValues = enumField.values.filter((value) => value.source === 'pipeline');
      for (const pipelineValue of pipelineValues) {
        assert.strictEqual(
          pipelineValue.needs_review,
          true,
          `${fieldKey}/${pipelineValue.value} should stay reviewable`,
        );
      }
    }
  });

  await t.test('review payload metrics count only real flags and keep happy_path clean', async () => {
    const metricProducts = [
      getProductByScenarioName('happy_path'),
      getProductByScenarioName('min_evidence_refs'),
    ].filter(Boolean);
    const payloadsByScenario = new Map(
      await Promise.all(
        metricProducts.map(async (product) => [
          product._testCase.name,
          await getReviewPayload(product.productId, { withSpecDb: true }),
        ]),
      ),
    );

    for (const product of metricProducts) {
      const payload = payloadsByScenario.get(product._testCase.name);
      const realFlagCount = Object.values(payload.fields)
        .filter((fieldState) => (fieldState.reason_codes || []).some((reasonCode) => REAL_FLAGS.has(reasonCode)))
        .length;

      assert.strictEqual(
        payload.metrics.flags,
        realFlagCount,
        `${product._testCase.name}: metrics.flags (${payload.metrics.flags}) should equal real flagged field count (${realFlagCount})`,
      );

      if (product._testCase.name === 'happy_path') {
        assert.strictEqual(payload.metrics.flags, 0, 'happy_path should not emit any real flags');
      }
    }
  });

  await t.test('scenario-specific review payload flags survive the seeded end-to-end flow', async () => {
    const minEvidenceProduct = getProductByScenarioName('min_evidence_refs');
    const crossValidationProduct = getProductByScenarioName('cross_validation');
    const [
      minEvidencePayload,
      crossValidationPayload,
    ] = await Promise.all([
      getReviewPayload(minEvidenceProduct.productId, { withSpecDb: true }),
      getReviewPayload(crossValidationProduct.productId),
    ]);

    const minEvidenceFlags = Object.values(minEvidencePayload.fields)
      .flatMap((fieldState) => fieldState.reason_codes || []);
    assert.ok(
      minEvidenceFlags.includes('below_min_evidence'),
      'min_evidence_refs should surface below_min_evidence',
    );

    const crossValidationReasonCodes = Object.fromEntries(
      Object.entries(crossValidationPayload.fields)
        .filter(([, fieldState]) => fieldState.reason_codes?.length > 0)
        .map(([fieldKey, fieldState]) => [fieldKey, fieldState.reason_codes]),
    );
    const allCrossValidationFlags = Object.values(crossValidationReasonCodes).flat();

    assert.ok(
      allCrossValidationFlags.includes('constraint_conflict') || allCrossValidationFlags.includes('compound_range_conflict'),
      `cross_validation should surface a constraint flag, got ${JSON.stringify(crossValidationReasonCodes)}`,
    );

    const requiresRules = (contractAnalysis._raw.rules || [])
      .filter((rule) => String(rule?.requires_field || '').trim() && String(rule?.trigger_field || '').trim());
    if (requiresRules.length > 0) {
      const triggerFields = new Set(requiresRules.map((rule) => String(rule.trigger_field).trim()));
      const dependencyMissingFields = Object.entries(crossValidationPayload.fields)
        .filter(([fieldKey, fieldState]) => (
          triggerFields.has(fieldKey)
          && (fieldState.reason_codes || []).includes('dependency_missing')
        ));

      assert.ok(
        dependencyMissingFields.length > 0,
        `cross_validation should surface dependency_missing on at least one trigger field, got ${JSON.stringify(crossValidationReasonCodes)}`,
      );
    }
  });
});
