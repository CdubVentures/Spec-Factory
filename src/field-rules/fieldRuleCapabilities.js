import { CONSUMER_BADGE_REGISTRY } from './consumerBadgeRegistry.js';
import { FIELD_RULE_SCHEMA } from './fieldRuleSchema.js';

const CAPABILITY_VERSION = 1;

const STATUS_OVERRIDES = Object.freeze({
  'contract.rounding.mode': Object.freeze({
    status: 'deferred',
    consumer: null,
    reason: "Only 'nearest' mode exists; will wire when floor/ceil needed",
  }),
});

const LEGACY_CAPABILITIES = Object.freeze({
  core_fields: Object.freeze({
    status: 'live',
    consumer: 'src/engine/fieldRulesEngine.js:getFieldClassification',
    description: 'Top-level array of field keys classified as core facts.',
  }),
  selection_policy: Object.freeze({
    status: 'live',
    consumer: 'src/scoring/consensusEngine.js:applyPolicyBonus + applySelectionPolicyReducers',
    description: 'Consensus winner selection policy.',
  }),
  'enum.new_value_policy': Object.freeze({
    status: 'live',
    consumer: 'src/engine/fieldRulesEngine.js:normalizeCandidate',
    description: 'Policy for handling new values not in the enum list.',
  }),
  'priority.effort': Object.freeze({
    status: 'live',
    consumer: 'src/runner/runUntilComplete.js:inferRuleEffort',
    description: 'Weighted effort score for search budget allocation.',
  }),
  'parse.template': Object.freeze({
    status: 'retired',
    consumer: 'none',
    description: 'RETIRED: replaced by contract.type in type-driven normalization.',
  }),
  'parse.unit': Object.freeze({
    status: 'retired',
    consumer: 'none',
    description: 'RETIRED: redundant with contract.unit.',
  }),
  'parse.delimiters': Object.freeze({
    status: 'live',
    consumer: 'src/engine/fieldRulesEngine.js:normalizeCandidate',
    description: 'Delimiters for list value parsing.',
  }),
  'parse.token_map': Object.freeze({
    status: 'live',
    consumer: 'src/engine/fieldRulesEngine.js:normalizeCandidate',
    description: 'Token normalization map.',
  }),
  'ui.label': Object.freeze({
    status: 'ui_only',
    consumer: 'React GUI (tools/gui-react/)',
    description: 'Human-readable field label.',
  }),
  'ui.group': Object.freeze({
    status: 'live',
    consumer: 'src/engine/fieldRulesEngine.js:buildUiGroupIndex + React GUI',
    description: 'Field grouping for display.',
  }),
  'ui.order': Object.freeze({
    status: 'ui_only',
    consumer: 'React GUI (tools/gui-react/)',
    description: 'Display order within group.',
  }),
  'ui.input_control': Object.freeze({
    status: 'retired',
    consumer: 'Derived at render time by deriveInputControl()',
    description: 'UI widget type now computed from field-rule contract metadata.',
  }),
  'ui.display_decimals': Object.freeze({
    status: 'ui_only',
    consumer: 'React GUI (tools/gui-react/)',
    description: 'Decimal places for display rendering.',
  }),
  'ui.surfaces': Object.freeze({
    status: 'ui_only',
    consumer: 'React GUI (tools/gui-react/)',
    description: 'Surface visibility flags.',
  }),
  'ui.tooltip_md': Object.freeze({
    status: 'ui_only',
    consumer: 'React GUI (tools/gui-react/)',
    description: 'Markdown tooltip content.',
  }),
  'ui.tooltip_source': Object.freeze({
    status: 'ui_only',
    consumer: 'src/app/api/guiServer.js + React GUI',
    description: 'Source reference for tooltip content.',
  }),
});

function capabilityKeyForSchemaPath(pathValue) {
  const pathText = String(pathValue || '');
  if (pathText.startsWith('ai_assist.') && pathText.endsWith('.enabled')) {
    return pathText.replace(/\.enabled$/, '');
  }
  if (pathText.startsWith('contract.range.')) {
    return 'contract.range';
  }
  return pathText;
}

function buildBadgeConsumerIndex() {
  const out = new Map();
  for (const entry of CONSUMER_BADGE_REGISTRY) {
    const keys = Object.keys(entry.consumers || {});
    if (keys.length === 0) continue;
    out.set(entry.path, keys.join(' + '));
  }
  return out;
}

function resolveConsumer({ key, entries, badgeConsumerIndex }) {
  const direct = badgeConsumerIndex.get(key);
  if (direct) return direct;
  const childConsumers = entries
    .map((entry) => badgeConsumerIndex.get(entry.path))
    .filter(Boolean);
  if (childConsumers.length > 0) {
    return [...new Set(childConsumers)].join(' + ');
  }
  return '';
}

function buildSchemaCapabilities() {
  const badgeConsumerIndex = buildBadgeConsumerIndex();
  const byKey = new Map();

  for (const entry of FIELD_RULE_SCHEMA) {
    const key = capabilityKeyForSchemaPath(entry.path);
    const rows = byKey.get(key) || [];
    rows.push(entry);
    byKey.set(key, rows);
  }

  return Object.fromEntries([...byKey.entries()].map(([key, entries]) => {
    const override = STATUS_OVERRIDES[key] || {};
    const description = [...new Set(entries.map((entry) => entry.doc).filter(Boolean))].join(' ');
    const status = override.status || 'live';
    const consumer = Object.prototype.hasOwnProperty.call(override, 'consumer')
      ? override.consumer
      : resolveConsumer({ key, entries, badgeConsumerIndex });
    const capability = {
      status,
      consumer,
      description,
    };
    if (override.reason) capability.reason = override.reason;
    return [key, Object.freeze(capability)];
  }));
}

export const FIELD_RULE_CAPABILITIES = Object.freeze({
  _doc: 'Derived registry of supported field-rule knobs. Schema knobs derive from FIELD_RULE_SCHEMA; compatibility-only knobs live in LEGACY_CAPABILITIES.',
  _version: CAPABILITY_VERSION,
  knobs: Object.freeze({
    ...buildSchemaCapabilities(),
    ...LEGACY_CAPABILITIES,
  }),
});

export const FIELD_RULE_CAPABILITY_KEYS = Object.freeze(Object.keys(FIELD_RULE_CAPABILITIES.knobs).sort());

export { capabilityKeyForSchemaPath };
