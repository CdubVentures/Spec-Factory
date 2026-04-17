// Minimal compiled-rules fixture that activates the CEF candidate gate.
// Shape mirrors src/features/color-edition/tests/colorEditionCandidateGate.test.js:42-66.
// Known values use policy=closed so Gate 1 has something to reject against.

import { AUDIT_PALETTE } from './palette.js';

export function buildCompiledRules() {
  return {
    fields: {
      colors: {
        contract: {
          shape: 'list',
          type: 'string',
          list_rules: { dedupe: true, sort: 'none' },
        },
        parse: { template: 'list_of_tokens_delimited' },
        enum: { policy: 'closed', match: { strategy: 'exact' } },
        priority: {},
      },
      editions: {
        contract: { shape: 'list', type: 'string' },
        parse: { template: null },
        enum: { policy: 'open', match: { strategy: 'exact' } },
        priority: {},
      },
    },
    known_values: {
      colors: {
        policy: 'closed',
        values: AUDIT_PALETTE.map((c) => c.name),
      },
    },
  };
}
