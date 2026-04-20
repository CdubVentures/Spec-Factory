// Authority hook for the editable global prompt fragments (evidence
// contract, value confidence rubric, identity warning tiers, siblings
// exclusion, discovery history header). Mirrors useLlmPolicyAuthority —
// fetches once, writes immediately on every edit, refetches after save.

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  GLOBAL_PROMPTS_QUERY_KEY,
  fetchGlobalPrompts,
  persistGlobalPrompts,
  type GlobalPromptEntry,
  type GlobalPromptsPatch,
  type GlobalPromptsSnapshot,
} from '../api/globalPromptsApi.ts';

interface UseGlobalPromptsAuthorityResult {
  readonly snapshot: GlobalPromptsSnapshot | null;
  readonly isLoading: boolean;
  readonly isSaving: boolean;
  readonly setOverride: (key: string, value: string) => void;
  readonly clearOverride: (key: string) => void;
}

const EMPTY_SNAPSHOT: GlobalPromptsSnapshot = {
  ok: true,
  keys: [],
  prompts: {} as Readonly<Record<string, GlobalPromptEntry>>,
};

export function useGlobalPromptsAuthority(): UseGlobalPromptsAuthorityResult {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: GLOBAL_PROMPTS_QUERY_KEY,
    queryFn: fetchGlobalPrompts,
  });

  const mutation = useMutation({
    mutationFn: (patch: GlobalPromptsPatch) => persistGlobalPrompts(patch),
    onSuccess: (result) => {
      queryClient.setQueryData(GLOBAL_PROMPTS_QUERY_KEY, result);
    },
    onError: (error) => {
      console.error('Global prompts save failed:', error);
    },
  });

  const setOverride = useCallback((key: string, value: string) => {
    // Empty override value = fall back to default. Send empty string so
    // the server records the explicit "use default" intent.
    mutation.mutate({ [key]: value });
  }, [mutation]);

  const clearOverride = useCallback((key: string) => {
    mutation.mutate({ [key]: null });
  }, [mutation]);

  return {
    snapshot: data ?? EMPTY_SNAPSHOT,
    isLoading,
    isSaving: mutation.isPending,
    setOverride,
    clearOverride,
  };
}
