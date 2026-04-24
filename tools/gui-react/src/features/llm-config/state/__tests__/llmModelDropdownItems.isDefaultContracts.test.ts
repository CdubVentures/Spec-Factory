import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';

import type { DropdownModelOption } from '../llmModelDropdownOptions.ts';
import { buildDropdownItems } from '../llmModelDropdownItems.ts';

const options: DropdownModelOption[] = [
  { value: 'default-gemini:gemini-2.5-flash', label: 'gemini-2.5-flash', providerId: 'default-gemini', providerName: 'Gemini' },
  { value: 'default-gemini:gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite', providerId: 'default-gemini', providerName: 'Gemini' },
  { value: 'default-deepseek:deepseek-v4-flash', label: 'deepseek-v4-flash', providerId: 'default-deepseek', providerName: 'DeepSeek' },
];

describe('buildDropdownItems isDefault badging contracts', () => {
  it('badges the option whose composite key ends with the bare globalDefaultModelId', () => {
    const items = buildDropdownItems({
      options, allowNone: false, noneLabel: '(none)', globalDefaultModelId: 'gemini-2.5-flash-lite', missingOption: null,
    });
    const defaults = items.filter((i) => i.isDefault);
    strictEqual(defaults.length, 1);
    strictEqual(defaults[0].value, 'default-gemini:gemini-2.5-flash-lite');
  });

  it('moves the default badge when globalDefaultModelId changes', () => {
    const first = buildDropdownItems({
      options, allowNone: false, noneLabel: '(none)', globalDefaultModelId: 'gemini-2.5-flash', missingOption: null,
    });
    const second = buildDropdownItems({
      options, allowNone: false, noneLabel: '(none)', globalDefaultModelId: 'deepseek-v4-flash', missingOption: null,
    });
    strictEqual(first.find((i) => i.isDefault)?.value, 'default-gemini:gemini-2.5-flash');
    strictEqual(second.find((i) => i.isDefault)?.value, 'default-deepseek:deepseek-v4-flash');
  });

  it('matches an exact composite-key globalDefaultModelId as well as a bare id', () => {
    const items = buildDropdownItems({
      options, allowNone: false, noneLabel: '(none)', globalDefaultModelId: 'default-deepseek:deepseek-v4-flash', missingOption: null,
    });
    const defaults = items.filter((i) => i.isDefault);
    strictEqual(defaults.length, 1);
    strictEqual(defaults[0].value, 'default-deepseek:deepseek-v4-flash');
  });

  it('omits the default flag on every option when globalDefaultModelId is undefined', () => {
    const items = buildDropdownItems({
      options, allowNone: false, noneLabel: '(none)', missingOption: null,
    });
    const defaults = items.filter((i) => i.isDefault);
    strictEqual(defaults.length, 0);
  });

  it('badges only the first occurrence when a bare id suffix-matches multiple composite keys', () => {
    const dupes: DropdownModelOption[] = [
      { value: 'provA:shared-model', label: 'provA / shared-model', providerId: 'provA', providerName: 'A' },
      { value: 'provB:shared-model', label: 'provB / shared-model', providerId: 'provB', providerName: 'B' },
    ];
    const items = buildDropdownItems({
      options: dupes, allowNone: false, noneLabel: '(none)', globalDefaultModelId: 'shared-model', missingOption: null,
    });
    const defaults = items.filter((i) => i.isDefault);
    strictEqual(defaults.length, 1, 'only first suffix match is badged');
    strictEqual(defaults[0].value, 'provA:shared-model');
  });

  it('emits a provider group label on the first option of each provider', () => {
    const items = buildDropdownItems({
      options, allowNone: false, noneLabel: '(none)', missingOption: null,
    });
    const grouped = items.filter((i) => i.groupLabel);
    strictEqual(grouped.length, 2);
    strictEqual(grouped[0].groupLabel, 'Gemini');
    strictEqual(grouped[1].groupLabel, 'DeepSeek');
  });

  it('noneModelId drives only the none-row role, not the DEFAULT badge', () => {
    const roled: DropdownModelOption[] = [
      { value: 'provA:override-model', label: 'override-model', providerId: 'provA', role: 'primary' },
      { value: 'provB:global-model', label: 'global-model', providerId: 'provB', role: 'primary' },
    ];
    const items = buildDropdownItems({
      options: roled,
      allowNone: true,
      noneLabel: '(inherit)',
      noneModelId: 'override-model',
      globalDefaultModelId: 'global-model',
      missingOption: null,
    });
    strictEqual(items[0].key, '__none__');
    strictEqual(items[0].label, '(inherit)');
    strictEqual(items[0].role, 'primary');
    const defaults = items.filter((i) => i.isDefault);
    strictEqual(defaults.length, 1, 'badge follows globalDefaultModelId, not noneModelId');
    strictEqual(defaults[0].value, 'provB:global-model');
  });
});
