import { useQuery } from '@tanstack/react-query';

import { api } from '../../../api/client.ts';
import type {
  ArtifactEntry,
  ComponentDbResponse,
  FieldStudioMapResponse,
  KnownValuesResponse,
  StudioPayload,
  TooltipBankResponse,
} from '../../../types/studio.ts';

export interface UseStudioPageQueriesInput {
  category: string;
  activeTab: string;
  processRunning: boolean;
}

export interface UseStudioPageQueriesResult {
  studio: StudioPayload | undefined;
  isLoading: boolean;
  wbMapRes: FieldStudioMapResponse | undefined;
  tooltipBank: TooltipBankResponse | undefined;
  artifacts: ArtifactEntry[] | undefined;
  knownValuesRes: KnownValuesResponse | undefined;
  knownValuesIsError: boolean;
  knownValuesError: unknown;
  componentDbRes: ComponentDbResponse | undefined;
  knownValuesTabActive: boolean;
}

function isKnownValuesTabActive(activeTab: string): boolean {
  return (
    activeTab === 'mapping' ||
    activeTab === 'keys' ||
    activeTab === 'contract'
  );
}

export function useStudioPageQueries({
  category,
  activeTab,
  processRunning,
}: UseStudioPageQueriesInput): UseStudioPageQueriesResult {
  const knownValuesTabActive = isKnownValuesTabActive(activeTab);

  const { data: studio, isLoading } = useQuery({
    queryKey: ['studio', category],
    queryFn: () => api.get<StudioPayload>(`/studio/${category}/payload`),
  });

  const { data: wbMapRes } = useQuery({
    queryKey: ['studio-config', category],
    queryFn: () =>
      api.get<FieldStudioMapResponse>(`/studio/${category}/field-studio-map`),
  });

  const { data: tooltipBank } = useQuery({
    queryKey: ['studio-tooltip-bank', category],
    queryFn: () =>
      api.get<TooltipBankResponse>(`/studio/${category}/tooltip-bank`),
    enabled: activeTab === 'mapping',
  });

  const { data: artifacts } = useQuery({
    queryKey: ['studio-artifacts', category],
    queryFn: () => api.get<ArtifactEntry[]>(`/studio/${category}/artifacts`),
    enabled: activeTab === 'reports',
    refetchInterval: activeTab === 'reports' && processRunning ? 1200 : false,
  });

  const {
    data: knownValuesRes,
    isError: knownValuesIsError,
    error: knownValuesError,
  } = useQuery({
    queryKey: ['studio-known-values', category],
    queryFn: () =>
      api.get<KnownValuesResponse>(`/studio/${category}/known-values`),
    enabled: knownValuesTabActive,
  });

  const { data: componentDbRes } = useQuery({
    queryKey: ['studio-component-db', category],
    queryFn: () =>
      api.get<ComponentDbResponse>(`/studio/${category}/component-db`),
    enabled: activeTab === 'keys' || activeTab === 'contract',
  });

  return {
    studio,
    isLoading,
    wbMapRes,
    tooltipBank,
    artifacts,
    knownValuesRes,
    knownValuesIsError,
    knownValuesError,
    componentDbRes,
    knownValuesTabActive,
  };
}
