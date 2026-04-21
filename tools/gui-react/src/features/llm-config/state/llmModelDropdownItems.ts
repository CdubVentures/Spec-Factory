import type { DropdownModelOption } from './llmModelDropdownOptions.ts';
import type { LlmModelRole, LlmAccessMode } from '../types/llmProviderRegistryTypes.ts';

export interface DropdownListItem {
  key: string;
  value: string;
  label: string;
  role?: LlmModelRole;
  muted?: boolean;
  accessMode?: LlmAccessMode;
  thinking?: boolean;
  webSearch?: boolean;
  isDefault?: boolean;
  groupLabel?: string;
}

export interface BuildDropdownItemsArgs {
  options: readonly DropdownModelOption[];
  allowNone: boolean;
  noneLabel: string;
  /** Model ID the "(none)" row inherits — drives the role badge rendered on that row only. */
  noneModelId?: string;
  /** Model ID of the GLOBAL default — drives the DEFAULT badge in the option list. */
  globalDefaultModelId?: string;
  missingOption: DropdownModelOption | null;
}

function resolveCompositeKey(
  options: readonly DropdownModelOption[],
  modelId: string | undefined,
): { option: DropdownModelOption | undefined; key: string } {
  if (!modelId) return { option: undefined, key: '' };
  const match = options.find((o) => o.value === modelId)
    ?? options.find((o) => o.value.endsWith(`:${modelId}`));
  return { option: match, key: match?.value ?? modelId };
}

export function buildDropdownItems({
  options,
  allowNone,
  noneLabel,
  noneModelId,
  globalDefaultModelId,
  missingOption,
}: BuildDropdownItemsArgs): DropdownListItem[] {
  const list: DropdownListItem[] = [];
  const { option: derivedNoneOption } = resolveCompositeKey(options, noneModelId);
  const { key: defaultCompositeKey } = resolveCompositeKey(options, globalDefaultModelId);
  if (allowNone) {
    list.push({
      key: '__none__',
      value: '',
      label: noneLabel,
      role: derivedNoneOption?.role,
      accessMode: derivedNoneOption?.accessMode,
      thinking: derivedNoneOption?.thinking,
      webSearch: derivedNoneOption?.webSearch,
    });
  }
  if (missingOption) {
    list.push({
      key: `missing-${missingOption.value}`,
      value: missingOption.value,
      label: missingOption.label,
      muted: true,
    });
  }
  // WHY: Detect provider boundaries to render group headers in the dropdown.
  let lastProviderId: string | null = null;
  for (const o of options) {
    const isNewGroup = o.providerId != null && o.providerId !== lastProviderId;
    if (isNewGroup) lastProviderId = o.providerId;
    list.push({
      key: o.providerId ? `reg-${o.providerId}-${o.value}` : o.value,
      value: o.value,
      label: o.label,
      role: o.role,
      accessMode: o.accessMode,
      thinking: o.thinking,
      webSearch: o.webSearch,
      isDefault: defaultCompositeKey !== '' && o.value === defaultCompositeKey,
      ...(isNewGroup ? { groupLabel: o.providerName ?? o.providerId ?? undefined } : {}),
    });
  }
  return list;
}
