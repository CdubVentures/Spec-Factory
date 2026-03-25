import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateIdentityGate } from '../identityGate.js';
import { makeAcceptedSource } from './helpers/identityGateRelaxedHarness.js';

test('evaluateIdentityGate keeps strong, provisional, and failed certainty bands stable', () => {
  const cases = [
    {
      label: 'manufacturer plus two credible sources',
      sources: [
        makeAcceptedSource({
          url: 'https://razer.com/mice/viper',
          rootDomain: 'razer.com',
          tier: 1,
          role: 'manufacturer'
        }),
        makeAcceptedSource({
          url: 'https://rtings.com/review',
          rootDomain: 'rtings.com',
          tier: 2
        }),
        makeAcceptedSource({
          url: 'https://techpowerup.com/review',
          rootDomain: 'techpowerup.com',
          tier: 2
        })
      ],
      assertGate(gate) {
        assert.equal(gate.validated, true);
        assert.ok(gate.certainty >= 0.95, `strong validation certainty should stay >= 0.95, got ${gate.certainty}`);
        assert.equal(gate.acceptedSourceCount, 3);
        assert.equal(gate.requirements.additionalCredibleSources, 2);
      }
    },
    {
      label: 'manufacturer only',
      sources: [
        makeAcceptedSource({
          url: 'https://razer.com/mice/viper',
          rootDomain: 'razer.com',
          tier: 1,
          role: 'manufacturer'
        })
      ],
      assertGate(gate) {
        assert.equal(gate.validated, false);
        assert.ok(
          gate.certainty >= 0.70 && gate.certainty < 0.95,
          `manufacturer-only certainty should stay provisional, got ${gate.certainty}`
        );
        assert.equal(gate.acceptedSourceCount, 1);
        assert.equal(gate.reasonCodes.includes('missing_additional_credible_sources'), true);
      }
    },
    {
      label: 'zero accepted sources',
      sources: [
        makeAcceptedSource({
          url: 'https://unknown.com/page',
          rootDomain: 'unknown.com',
          tier: 4,
          role: 'retail',
          approvedDomain: false,
          identity: { match: false, score: 0.2, reasons: [], criticalConflicts: [] }
        })
      ],
      assertGate(gate) {
        assert.equal(gate.validated, false);
        assert.equal(gate.acceptedSourceCount, 0);
        assert.ok(gate.certainty < 0.70, `failed identity certainty should stay < 0.70, got ${gate.certainty}`);
        assert.equal(gate.reasonCodes.includes('certainty_below_publish_threshold'), true);
      }
    }
  ];

  for (const testCase of cases) {
    testCase.assertGate(evaluateIdentityGate(testCase.sources), testCase.label);
  }
});
