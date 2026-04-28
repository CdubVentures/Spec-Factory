/**
 * Module Settings Authority — per-module settings hook.
 *
 * Branches on settingsScope (from generated registry):
 *   - 'global'  : URL /module-settings/global/:moduleId, cache key [..., 'global', moduleId]
 *   - 'category': URL /module-settings/:category/:moduleId, cache key [..., category, moduleId]
 *
 * Category-scoped queries are gated on `category` being non-empty so switching
 * categories auto-refetches. Global-scoped queries fetch unconditionally.
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { createSettingsOptimisticMutationContract } from '../../../stores/settingsMutationContract.ts';
import { invalidateDataChangeQueries } from '../../data-change/index.js';
import {
  MODULE_SETTINGS_SCOPE_BY_ID,
  type ModuleSettingsModuleId,
  type ModuleSettingsScope,
} from './moduleSettingsSections.generated.ts';

interface ModuleSettingsResponse {
  category?: string;
  scope?: ModuleSettingsScope;
  module: string;
  settings: Record<string, string>;
}

function isKnownModuleId(id: string): id is ModuleSettingsModuleId {
  return id in MODULE_SETTINGS_SCOPE_BY_ID;
}

function resolveScope(moduleId: string, scopeOverride?: ModuleSettingsScope): ModuleSettingsScope {
  if (scopeOverride) return scopeOverride;
  return isKnownModuleId(moduleId) ? MODULE_SETTINGS_SCOPE_BY_ID[moduleId] : 'category';
}

function buildUrl(scope: ModuleSettingsScope, category: string, moduleId: string): string {
  if (scope === 'global') {
    return `/module-settings/global/${encodeURIComponent(moduleId)}`;
  }
  return `/module-settings/${encodeURIComponent(category)}/${encodeURIComponent(moduleId)}`;
}

function buildQueryKey(scope: ModuleSettingsScope, category: string, moduleId: string) {
  const scopeSegment = scope === 'global' ? 'global' : category;
  return ['module-settings', scopeSegment, moduleId] as const;
}

function buildOptimisticModuleSettingsResponse(args: {
  readonly category: string;
  readonly moduleId: string;
  readonly scope: ModuleSettingsScope;
  readonly settings: Record<string, string>;
  readonly previousData: ModuleSettingsResponse | undefined;
}): ModuleSettingsResponse {
  const { category, moduleId, scope, settings, previousData } = args;
  return {
    ...previousData,
    category: scope === 'category' ? category : previousData?.category,
    scope,
    module: previousData?.module ?? moduleId,
    settings: {
      ...(previousData?.settings ?? {}),
      ...settings,
    },
  };
}

/**
 * Imperative PUT helper — mirrors the mutation inside useModuleSettingsAuthority
 * but is callable from non-hook contexts (e.g. "Reset all" fan-out that PUTs
 * many moduleIds in parallel). Writes the response back into the React Query
 * cache so mounted hooks see the update.
 */
export async function putModuleSettings(args: {
  readonly category: string;
  readonly moduleId: ModuleSettingsModuleId;
  readonly settings: Record<string, string>;
  readonly queryClient: QueryClient;
  readonly scopeOverride?: ModuleSettingsScope;
}): Promise<ModuleSettingsResponse> {
  const { category, moduleId, settings, queryClient, scopeOverride } = args;
  const scope = resolveScope(moduleId, scopeOverride);
  const result = await api.put<ModuleSettingsResponse>(
    buildUrl(scope, category, moduleId),
    { settings },
  );
  queryClient.setQueryData(buildQueryKey(scope, category, moduleId), result);
  return result;
}

export function useModuleSettingsAuthority({
  category,
  moduleId,
  scopeOverride,
}: {
  category: string;
  moduleId: string;
  scopeOverride?: ModuleSettingsScope;
}) {
  const queryClient = useQueryClient();
  const scope = resolveScope(moduleId, scopeOverride);
  const queryKey = buildQueryKey(scope, category, moduleId);

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => api.get<ModuleSettingsResponse>(buildUrl(scope, category, moduleId)),
    enabled: scope === 'global' ? Boolean(moduleId) : Boolean(category && moduleId),
  });

  const mutation = useMutation(
    createSettingsOptimisticMutationContract<
      Record<string, string>,
      ModuleSettingsResponse,
      ModuleSettingsResponse,
      ModuleSettingsResponse
    >({
      queryClient,
      queryKey,
      mutationFn: (settings) =>
        api.put<ModuleSettingsResponse>(buildUrl(scope, category, moduleId), { settings }),
      toOptimisticData: (settings, previousData) =>
        buildOptimisticModuleSettingsResponse({
          category,
          moduleId,
          scope,
          settings,
          previousData,
        }),
      toAppliedData: (response) => response,
      toPersistedResult: (response) => response,
      onPersisted: (_response, savedSettings) => {
        invalidateDataChangeQueries({
          queryClient,
          message: {
            type: 'data-change',
            event: 'module-settings-updated',
            category,
            meta: {
              scope,
              moduleId,
              keys: Object.keys(savedSettings),
            },
          },
          fallbackCategory: category,
        });
      },
    }),
  );

  return {
    settings: data?.settings ?? {},
    isLoading,
    error: error ? String(error) : null,
    isSaving: mutation.isPending,
    saveSetting: (key: string, value: string) => {
      mutation.mutate({ [key]: value });
    },
    saveSettings: (settings: Record<string, string>) => {
      mutation.mutate(settings);
    },
  };
}
