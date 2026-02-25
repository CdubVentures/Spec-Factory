export interface GateQueryRow {
  query?: string;
  hint_source?: string;
  doc_hint?: string;
  domain_hint?: string;
  source_host?: string;
  __from_plan_profile?: boolean;
}

export interface QueryGateFlags {
  queryTerms: boolean;
  domainHints: boolean;
  contentTypes: boolean;
  fieldRules: boolean;
  contract: boolean;
  sourceHost: boolean;
}

export interface GateSummaryKeyCount {
  source: string;
  count: number;
}

export interface GateSummary {
  queryTermsCount: number;
  domainHintsCount: number;
  contentTypesCount: number;
  fieldRulesCount: number;
  contractCount: number;
  sourceHostCount: number;
  queryTermsOn: boolean;
  domainHintsOn: boolean;
  contentTypesOn: boolean;
  fieldRulesOn: boolean;
  contractOn: boolean;
  sourceHostOn: boolean;
  fieldRuleSourceRows: number;
  runtimeSourceRows: number;
  total: number;
  fieldRuleKeyCounts: GateSummaryKeyCount[];
}

export interface FieldRuleGateCountRow {
  value_count?: number;
  total_value_count?: number;
  effective_value_count?: number;
  enabled_field_count?: number;
  disabled_field_count?: number;
  status?: string;
}

export interface NormalizedFieldRuleGateCount {
  key: string;
  label: string;
  valueCount: number;
  totalValueCount: number;
  effectiveValueCount: number;
  enabledFieldCount: number;
  disabledFieldCount: number;
  status: 'active' | 'off' | 'zero';
}

export interface ResolvedFieldRuleRowGateCount {
  status: 'active' | 'off' | 'zero';
  value: number;
  total: number;
  effective: number;
}

export function sourceHostFromRow(row?: GateQueryRow): string;
export function isRuntimeSource(row?: GateQueryRow): boolean;
export function shouldUseProfileCounts(row?: GateQueryRow): boolean;
export function hasFieldRuleSourceFromCounts(counts: Record<string, number> | undefined, target?: string): boolean;
export function sumHintSourceCounts(counts: Record<string, number> | undefined, targetPrefixOrExact?: string): number;
export function isFieldRulesSource(row?: GateQueryRow): boolean;
export function isContractSource(row?: GateQueryRow): boolean;
export function isQueryTermsSource(row?: GateQueryRow): boolean;
export function fieldRulesCountForSource(row?: GateQueryRow, hintSourceCounts?: Record<string, number>): number;
export function getQueryGateFlags(row?: GateQueryRow, hintSourceCounts?: Record<string, number>): QueryGateFlags;
export function querySourceLabel(row?: GateQueryRow): string;
export function querySourceChipClass(source?: string): string;
export function buildGateSummary(queryRows?: GateQueryRow[], hintSourceCounts?: Record<string, number>): GateSummary;
export function normalizeFieldRuleGateCounts(gateCounts?: Record<string, FieldRuleGateCountRow>): NormalizedFieldRuleGateCount[];
export function resolveFieldRuleHintCountForRowGate(options?: {
  perFieldHintCounts?: {
    query_terms?: {
      value_count?: number;
      total_value_count?: number;
      effective_value_count?: number;
      status?: string;
    };
    domain_hints?: {
      value_count?: number;
      total_value_count?: number;
      effective_value_count?: number;
      status?: string;
    };
    preferred_content_types?: {
      value_count?: number;
      total_value_count?: number;
      effective_value_count?: number;
      status?: string;
    };
  } | null;
  gateKey?: 'query_terms' | 'domain_hints' | 'preferred_content_types' | string;
  fallbackGate?: {
    valueCount?: number;
    totalValueCount?: number;
    effectiveValueCount?: number;
    status?: string;
  } | null;
}): ResolvedFieldRuleRowGateCount;
