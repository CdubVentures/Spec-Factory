import test from 'node:test';
import assert from 'node:assert/strict';
import { startIntelGraphApi } from '../intelGraphApi.js';

function toBuffer(body) {
  return Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
}

function makeMemoryStorage(config) {
  const map = new Map();

  return {
    async readJsonOrNull(key) {
      const raw = map.get(key);
      return raw ? JSON.parse(raw.toString('utf8')) : null;
    },
    async writeObject(key, body) {
      map.set(key, toBuffer(body));
    },
    resolveOutputKey(...parts) {
      return ['specs/outputs', ...parts].filter(Boolean).join('/');
    }
  };
}

test('intel graph API serves product snapshot, missing critical fields, and best evidence', async () => {
  const config = {};
  const storage = makeMemoryStorage(config);
  const latestBase = storage.resolveOutputKey('mouse', 'mouse-acme-m100', 'latest');

  await storage.writeObject(
    `${latestBase}/summary.json`,
    JSON.stringify({
      productId: 'mouse-acme-m100',
      critical_fields_below_pass_target: ['sensor'],
      fields_below_pass_target: ['sensor'],
      missing_required_fields: ['sensor'],
      constraint_analysis: {
        contradiction_count: 1,
        contradictions: [
          {
            code: 'sensor_brand_without_sensor',
            severity: 'warning',
            fields: ['sensor_brand', 'sensor'],
            message: 'sensor_brand is present while sensor is unknown.'
          }
        ]
      },
      anchor_conflicts: [
        {
          field: 'sensor',
          expected: 'Focus Pro 35K',
          observed: 'unk',
          severity: 'MAJOR'
        }
      ],
      validated: false
    })
  );
  await storage.writeObject(
    `${latestBase}/normalized.json`,
    JSON.stringify({
      productId: 'mouse-acme-m100',
      fields: { sensor: 'unk', sensor_brand: 'Acme' }
    })
  );
  await storage.writeObject(
    `${latestBase}/provenance.json`,
    JSON.stringify({
      sensor: {
        value: 'unk',
        evidence: [
          {
            url: 'https://manufacturer.com/support/m100',
            host: 'manufacturer.com',
            rootDomain: 'manufacturer.com',
            tier: 1,
            tierName: 'manufacturer',
            method: 'network_json',
            keyPath: 'payload.specs.sensor',
            approvedDomain: true
          }
        ]
      }
    })
  );

  const started = await startIntelGraphApi({
    storage,
    config,
    category: 'mouse',
    host: '127.0.0.1',
    port: 0
  });

  try {
    const response = await fetch(started.graphqlUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'query Q($productId:String!,$field:String!){ product missingCriticalFields bestEvidence whyFieldRejected conflictGraph }',
        variables: {
          productId: 'mouse-acme-m100',
          field: 'sensor',
          limit: 5
        }
      })
    });

    assert.equal(response.ok, true);
    const payload = await response.json();
    assert.equal(payload.data.product.productId, 'mouse-acme-m100');
    assert.deepEqual(payload.data.missingCriticalFields, ['sensor']);
    assert.equal(payload.data.bestEvidence.length, 1);
    assert.equal(payload.data.bestEvidence[0].rootDomain, 'manufacturer.com');
    assert.equal(payload.data.whyFieldRejected.field, 'sensor');
    assert.equal(payload.data.whyFieldRejected.reasons.includes('critical_field_below_pass_target'), true);
    assert.equal(payload.data.conflictGraph.node_count >= 2, true);
    assert.equal(payload.data.conflictGraph.edge_count >= 1, true);
  } finally {
    await new Promise((resolve) => started.server.close(resolve));
  }
});
