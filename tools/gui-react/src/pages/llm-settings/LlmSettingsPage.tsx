import { useEffect, useMemo, useRef, useState } from 'react';
import { usePersistedTab } from '../../stores/tabStore';
import { TabStrip } from '../../shared/ui/navigation/TabStrip';
import { useUiStore } from '../../stores/uiStore';
import { useLlmSettingsAuthority, useLlmSettingsBootstrapRows } from '../../stores/llmSettingsAuthority';
import { useSettingsAuthorityStore } from '../../stores/settingsAuthorityStore';
import { Spinner } from '../../shared/ui/feedback/Spinner';
import { resolveLlmSettingsStatusText } from '../../shared/ui/feedback/settingsStatus';
import type { LlmRouteRow, LlmScope } from '../../types/llmSettings';
import { LLM_ROUTE_PRESET_LIMITS, LLM_SETTING_LIMITS } from '../../stores/settingsManifest';
import type { LlmRoutePresetConfig } from '../../stores/settingsManifest';

const SCOPE_KEYS = ['field', 'component', 'list'] as const satisfies ReadonlyArray<LlmScope>;
const scopes = [
  { id: 'field', label: 'Field Keys' },
  { id: 'component', label: 'Component Review' },
  { id: 'list', label: 'List Review' },
] as const;

const REQUIRED_LEVEL_RANK: Record<string, number> = {
  identity: 7,
  critical: 6,
  required: 5,
  expected: 4,
  optional: 3,
  editorial: 2,
  commerce: 1
};

const DIFFICULTY_RANK: Record<string, number> = {
  instrumented: 4,
  hard: 3,
  medium: 2,
  easy: 1
};

const AVAILABILITY_RANK: Record<string, number> = {
  always: 5,
  expected: 4,
  sometimes: 3,
  rare: 2,
  editorial_only: 1
};

type SortBy = 'route_key' | 'required_level' | 'difficulty' | 'availability' | 'effort';
const SORT_BY_KEYS = [
  'route_key',
  'required_level',
  'difficulty',
  'availability',
  'effort',
] as const satisfies ReadonlyArray<SortBy>;
const SORT_DIR_KEYS = ['asc', 'desc'] as const;

const inputCls = 'sf-input';
const selectCls = inputCls;
const cardCls = 'rounded sf-surface-elevated p-4';
const EFFORT_BOUNDS = LLM_SETTING_LIMITS.effort;
const MAX_TOKEN_BOUNDS = LLM_SETTING_LIMITS.maxTokens;
const MIN_EVIDENCE_BOUNDS = LLM_SETTING_LIMITS.minEvidenceRefs;
const MAX_TOKEN_STEP = MAX_TOKEN_BOUNDS.step ?? 1;

function clampToRange(value: number, min: number, max: number) {
  const safeValue = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, safeValue));
}

const PROMPT_FLAG_FIELDS: Array<keyof LlmRouteRow> = [
  'studio_key_navigation_sent_in_extract_review',
  'studio_contract_rules_sent_in_extract_review',
  'studio_extraction_guidance_sent_in_extract_review',
  'studio_tooltip_or_description_sent_when_present',
  'studio_enum_options_sent_when_present',
  'studio_component_variance_constraints_sent_in_component_review',
  'studio_parse_template_sent_direct_in_extract_review',
  'studio_ai_mode_difficulty_effort_sent_direct_in_extract_review',
  'studio_required_level_sent_in_extract_review',
  'studio_component_entity_set_sent_when_component_field',
  'studio_evidence_policy_sent_direct_in_extract_review',
  'studio_variance_policy_sent_in_component_review',
  'studio_constraints_sent_in_component_review',
  'studio_send_booleans_prompted_to_model'
];

function toEffortBand(effort: number) {
  const parsedEffort = Number.isFinite(effort) ? effort : EFFORT_BOUNDS.min;
  const n = clampToRange(parsedEffort, EFFORT_BOUNDS.min, EFFORT_BOUNDS.max);
  if (n <= 3) return '1-3';
  if (n <= 6) return '4-6';
  if (n <= 8) return '7-8';
  return '9-10';
}

function rowEffortBand(row: Pick<LlmRouteRow, 'effort'>) {
  return toEffortBand(row.effort);
}

function normalizeRowEffortBand(row: LlmRouteRow): LlmRouteRow {
  const normalizedBand = rowEffortBand(row);
  if (row.effort_band === normalizedBand) return row;
  return {
    ...row,
    effort_band: normalizedBand,
  };
}

function normalizeRowsEffortBand(rows: LlmRouteRow[]) {
  return rows.map((row) => normalizeRowEffortBand(row));
}

function applyContextPack(row: LlmRouteRow, pack: 'minimal' | 'standard' | 'full') {
  const next = { ...row };
  if (pack === 'minimal') {
    for (const key of PROMPT_FLAG_FIELDS) next[key] = false as never;
    next.studio_key_navigation_sent_in_extract_review = true;
    next.studio_contract_rules_sent_in_extract_review = true;
    next.studio_parse_template_sent_direct_in_extract_review = true;
    next.studio_required_level_sent_in_extract_review = true;
    next.studio_evidence_policy_sent_direct_in_extract_review = true;
    next.studio_send_booleans_prompted_to_model = false;
    return next;
  }
  if (pack === 'full') {
    for (const key of PROMPT_FLAG_FIELDS) next[key] = true as never;
    next.studio_send_booleans_prompted_to_model = false;
    return next;
  }
  for (const key of PROMPT_FLAG_FIELDS) next[key] = true as never;
  next.studio_component_variance_constraints_sent_in_component_review = row.scope === 'component';
  next.studio_variance_policy_sent_in_component_review = row.scope === 'component';
  next.studio_constraints_sent_in_component_review = row.scope === 'component';
  next.studio_component_entity_set_sent_when_component_field = row.scope === 'component';
  next.studio_send_booleans_prompted_to_model = false;
  return next;
}

function routeSummary(row: LlmRouteRow) {
  return `${row.required_level} | ${row.difficulty} | ${row.availability} | effort ${row.effort}`;
}

function selectedRouteTone(row: LlmRouteRow) {
  const effortBand = rowEffortBand(row);
  if (effortBand === '9-10') {
    return 'sf-callout sf-callout-danger';
  }
  if (effortBand === '7-8') {
    return 'sf-callout sf-callout-warning';
  }
  if (effortBand === '4-6') {
    return 'sf-callout sf-callout-info';
  }
  return 'sf-callout sf-callout-success';
}

function selectedRouteToneStyle(row: LlmRouteRow) {
  const effortBand = rowEffortBand(row);
  if (effortBand === '9-10') {
    return {
      color: 'var(--sf-state-danger-fg)',
      backgroundColor: 'var(--sf-state-danger-bg)',
      borderColor: 'var(--sf-state-danger-border)',
    };
  }
  if (effortBand === '7-8') {
    return {
      color: 'var(--sf-state-warning-fg)',
      backgroundColor: 'var(--sf-state-warning-bg)',
      borderColor: 'var(--sf-state-warning-border)',
    };
  }
  if (effortBand === '4-6') {
    return {
      color: 'var(--sf-state-info-fg)',
      backgroundColor: 'var(--sf-state-info-bg)',
      borderColor: 'var(--sf-state-info-border)',
    };
  }
  return {
    color: 'var(--sf-state-success-fg)',
    backgroundColor: 'var(--sf-state-success-bg)',
    borderColor: 'var(--sf-state-success-border)',
  };
}

function prettyToken(value: string) {
  return String(value || '')
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function presetDisplayName(row: LlmRouteRow) {
  const required = prettyToken(row.required_level);
  const difficulty = prettyToken(row.difficulty);
  const availability = prettyToken(row.availability);
  return `${required} | ${difficulty} | ${availability}`;
}

function rowDefaultsComparable(row: LlmRouteRow) {
  return {
    scope: row.scope,
    required_level: row.required_level,
    difficulty: row.difficulty,
    availability: row.availability,
    effort: row.effort,
    effort_band: row.effort_band,
    single_source_data: row.single_source_data,
    all_source_data: row.all_source_data,
    enable_websearch: row.enable_websearch,
    model_ladder_today: row.model_ladder_today,
    all_sources_confidence_repatch: row.all_sources_confidence_repatch,
    max_tokens: row.max_tokens,
    studio_key_navigation_sent_in_extract_review: row.studio_key_navigation_sent_in_extract_review,
    studio_contract_rules_sent_in_extract_review: row.studio_contract_rules_sent_in_extract_review,
    studio_extraction_guidance_sent_in_extract_review: row.studio_extraction_guidance_sent_in_extract_review,
    studio_tooltip_or_description_sent_when_present: row.studio_tooltip_or_description_sent_when_present,
    studio_enum_options_sent_when_present: row.studio_enum_options_sent_when_present,
    studio_component_variance_constraints_sent_in_component_review: row.studio_component_variance_constraints_sent_in_component_review,
    studio_parse_template_sent_direct_in_extract_review: row.studio_parse_template_sent_direct_in_extract_review,
    studio_ai_mode_difficulty_effort_sent_direct_in_extract_review: row.studio_ai_mode_difficulty_effort_sent_direct_in_extract_review,
    studio_required_level_sent_in_extract_review: row.studio_required_level_sent_in_extract_review,
    studio_component_entity_set_sent_when_component_field: row.studio_component_entity_set_sent_when_component_field,
    studio_evidence_policy_sent_direct_in_extract_review: row.studio_evidence_policy_sent_direct_in_extract_review,
    studio_variance_policy_sent_in_component_review: row.studio_variance_policy_sent_in_component_review,
    studio_constraints_sent_in_component_review: row.studio_constraints_sent_in_component_review,
    studio_send_booleans_prompted_to_model: row.studio_send_booleans_prompted_to_model,
    scalar_linked_send: row.scalar_linked_send,
    component_values_send: row.component_values_send,
    list_values_send: row.list_values_send,
    llm_output_min_evidence_refs_required: row.llm_output_min_evidence_refs_required,
    insufficient_evidence_action: row.insufficient_evidence_action
  };
}

function applyRoutePreset(row: LlmRouteRow, preset: 'balanced' | 'deep') {
  const presetConfig: LlmRoutePresetConfig = LLM_ROUTE_PRESET_LIMITS[preset];
  if (preset === 'balanced') {
    return {
      ...row,
      single_source_data: presetConfig.singleSourceData,
      all_source_data: row.required_level === 'required' || row.required_level === 'critical' || row.difficulty === 'hard',
      enable_websearch: row.availability === 'rare' || row.difficulty === 'hard' || row.required_level === 'critical' || row.required_level === 'identity',
      all_sources_confidence_repatch: presetConfig.allSourcesConfidenceRepatch,
      model_ladder_today: row.model_ladder_today || presetConfig.modelLadderToday,
      max_tokens: clampToRange(row.max_tokens, presetConfig.maxTokensMin, presetConfig.maxTokensMax),
    };
  }
  return {
    ...row,
    single_source_data: presetConfig.singleSourceData,
    all_source_data: row.required_level === 'required' || row.required_level === 'critical' || row.difficulty === 'hard',
    enable_websearch: row.availability === 'rare' || row.difficulty === 'hard' || row.required_level === 'critical' || row.required_level === 'identity',
    all_sources_confidence_repatch: presetConfig.allSourcesConfidenceRepatch,
    model_ladder_today: row.model_ladder_today || presetConfig.modelLadderToday,
    max_tokens: clampToRange(row.max_tokens, presetConfig.maxTokensMin, presetConfig.maxTokensMax),
    llm_output_min_evidence_refs_required: clampToRange(
      Math.max(
        presetConfig.minEvidenceRefsRequired ?? MIN_EVIDENCE_BOUNDS.min,
        row.llm_output_min_evidence_refs_required ?? MIN_EVIDENCE_BOUNDS.min,
      ),
      MIN_EVIDENCE_BOUNDS.min,
      MIN_EVIDENCE_BOUNDS.max,
    ),
  };
}

function flagLabel(key: keyof LlmRouteRow): string {
  return String(key)
    .replace(/^studio_/, '')
    .replace(/_sent_/, ' ')
    .replace(/_in_/, ' in ')
    .replace(/_when_/, ' when ')
    .replace(/_/g, ' ');
}

function rankForSort(row: LlmRouteRow, sortBy: SortBy): number | string {
  if (sortBy === 'effort') return row.effort;
  if (sortBy === 'required_level') return REQUIRED_LEVEL_RANK[row.required_level] || 0;
  if (sortBy === 'difficulty') return DIFFICULTY_RANK[row.difficulty] || 0;
  if (sortBy === 'availability') return AVAILABILITY_RANK[row.availability] || 0;
  return row.route_key;
}

function tagCls(kind: 'required' | 'difficulty' | 'availability' | 'effort', value: string) {
  if (kind === 'required') {
    if (['identity', 'critical', 'required'].includes(value)) return 'sf-chip-danger';
    if (value === 'expected') return 'sf-chip-info';
    return 'sf-chip-neutral';
  }
  if (kind === 'difficulty') {
    if (value === 'hard' || value === 'instrumented') return 'sf-chip-warning';
    if (value === 'medium') return 'sf-chip-info';
    return 'sf-chip-success';
  }
  if (kind === 'availability') {
    if (value === 'always' || value === 'expected') return 'sf-chip-success';
    if (value === 'sometimes') return 'sf-chip-warning';
    return 'sf-chip-neutral';
  }
  const parsedEffort = Number.parseInt(String(value || ''), 10);
  const effortBand = toEffortBand(Number.isFinite(parsedEffort) ? parsedEffort : EFFORT_BOUNDS.min);
  if (effortBand === '1-3') return 'sf-chip-success';
  if (effortBand === '4-6') return 'sf-chip-info';
  if (effortBand === '7-8') return 'sf-chip-warning';
  return 'sf-chip-danger';
}

export function LlmSettingsPage() {
  const category = useUiStore((s) => s.category);
  const autoSaveEnabled = useUiStore((s) => s.runtimeAutoSaveEnabled);
  const setAutoSaveEnabled = useUiStore((s) => s.setRuntimeAutoSaveEnabled);
  const isAll = category === 'all';
  const llmSettingsReady = useSettingsAuthorityStore((s) => s.snapshot.llmSettingsReady);
  const llmSettingsBootstrapRows = useLlmSettingsBootstrapRows(category);
  const [activeScope, setActiveScope] = usePersistedTab<LlmScope>(
    'llmSettings:scope:main',
    'field',
    { validValues: SCOPE_KEYS },
  );
  const scopeStateKey = `${category}:${activeScope}`;
  const [selectedRouteKey, setSelectedRouteKey] = usePersistedTab<string>(
    `llmSettings:selectedRoute:${scopeStateKey}`,
    '',
  );
  const [rows, setRows] = useState<LlmRouteRow[]>(() => normalizeRowsEffortBand(llmSettingsBootstrapRows));
  const [defaultRowsByKey, setDefaultRowsByKey] = useState<Record<string, LlmRouteRow>>(
    () => Object.fromEntries(normalizeRowsEffortBand(llmSettingsBootstrapRows).map((row) => [row.route_key, row])),
  );
  const [dirty, setDirty] = useState(false);
  const [sortBy, setSortBy] = usePersistedTab<SortBy>(
    `llmSettings:sortBy:${scopeStateKey}`,
    'effort',
    { validValues: SORT_BY_KEYS },
  );
  const [sortDir, setSortDir] = usePersistedTab<'asc' | 'desc'>(
    `llmSettings:sortDir:${scopeStateKey}`,
    'desc',
    { validValues: SORT_DIR_KEYS },
  );
  const [filterRequiredLevel, setFilterRequiredLevel] = usePersistedTab<string>(
    `llmSettings:filterRequired:${scopeStateKey}`,
    'all',
  );
  const [filterDifficulty, setFilterDifficulty] = usePersistedTab<string>(
    `llmSettings:filterDifficulty:${scopeStateKey}`,
    'all',
  );
  const [filterAvailability, setFilterAvailability] = usePersistedTab<string>(
    `llmSettings:filterAvailability:${scopeStateKey}`,
    'all',
  );
  const [filterEffortBand, setFilterEffortBand] = usePersistedTab<string>(
    `llmSettings:filterEffortBand:${scopeStateKey}`,
    'all',
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{
    kind: 'idle' | 'ok' | 'partial' | 'error';
    message: string;
  }>({ kind: 'idle', message: '' });
  const editVersionRef = useRef(0);

  const {
    data,
    isLoading,
    isSaving,
    isResetting,
    reload,
    save,
    resetDefaults,
  } = useLlmSettingsAuthority({
    category,
    enabled: !isAll,
    rows,
    dirty,
    autoSaveEnabled,
    editVersion: editVersionRef.current,
    onPersisted: (result, payload) => {
      if (payload.version >= editVersionRef.current) {
        setRows(normalizeRowsEffortBand(result.rows || []));
        if (result.ok) {
          setDirty(false);
          setSaveStatus({ kind: 'ok', message: 'LLM settings saved.' });
        } else {
          const rejectedKeys = Object.keys(result.rejected);
          if (rejectedKeys.length > 0) {
            setSaveStatus({
              kind: 'partial',
              message: `LLM settings partially saved. Rejected ${rejectedKeys.length} route(s).`,
            });
          } else {
            setSaveStatus({ kind: 'error', message: 'LLM settings save failed.' });
          }
        }
        setLastSavedAt(new Date().toLocaleTimeString());
      }
    },
    onError: (error) => {
      setSaveStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Failed to save LLM settings.' });
    },
    onResetSuccess: (resp) => {
      const normalizedRows = normalizeRowsEffortBand(resp.rows || []);
      setRows(normalizedRows);
      setDefaultRowsByKey(Object.fromEntries(normalizedRows.map((row) => [row.route_key, row])));
      setDirty(false);
      editVersionRef.current += 1;
      setSaveStatus({ kind: 'ok', message: 'LLM settings reset to defaults.' });
      setLastSavedAt(new Date().toLocaleTimeString());
    },
  });
  const llmHydrated = isAll || (llmSettingsReady && !isLoading);

  useEffect(() => {
    const normalizedRows = normalizeRowsEffortBand(llmSettingsBootstrapRows);
    setRows(normalizedRows);
    setDefaultRowsByKey(Object.fromEntries(normalizedRows.map((row) => [row.route_key, row])));
    setDirty(false);
    setSaveStatus({ kind: 'idle', message: '' });
    setLastSavedAt(null);
  }, [category, llmSettingsBootstrapRows]);

  useEffect(() => {
    if (!data?.rows) return;
    const normalizedRows = normalizeRowsEffortBand(data.rows);
    setRows(normalizedRows);
    setDirty(false);
    setDefaultRowsByKey((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return Object.fromEntries(normalizedRows.map((row) => [row.route_key, row]));
    });
  }, [data]);

  const scopeRows = useMemo(
    () => rows.filter((row) => row.scope === activeScope),
    [rows, activeScope]
  );

  const scopeCounts = useMemo<Record<LlmScope, number>>(() => {
    const counts: Record<LlmScope, number> = { field: 0, component: 0, list: 0 };
    for (const row of rows) {
      counts[row.scope] = (counts[row.scope] || 0) + 1;
    }
    return counts;
  }, [rows]);

  const scopeTabs = useMemo(
    () => scopes.map((s) => ({ ...s, count: scopeCounts[s.id] || 0 })),
    [scopeCounts],
  );

  const filterOptions = useMemo(() => ({
    required: [...new Set(scopeRows.map((row) => row.required_level).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    difficulty: [...new Set(scopeRows.map((row) => row.difficulty).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    availability: [...new Set(scopeRows.map((row) => row.availability).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    effortBand: [...new Set(scopeRows.map((row) => rowEffortBand(row)).filter(Boolean))]
      .map((value) => String(value))
      .sort((a, b) => a.localeCompare(b))
  }), [scopeRows]);

  useEffect(() => {
    if (filterRequiredLevel !== 'all' && !filterOptions.required.includes(filterRequiredLevel)) {
      setFilterRequiredLevel('all');
    }
    if (filterDifficulty !== 'all' && !filterOptions.difficulty.includes(filterDifficulty)) {
      setFilterDifficulty('all');
    }
    if (filterAvailability !== 'all' && !filterOptions.availability.includes(filterAvailability)) {
      setFilterAvailability('all');
    }
    if (filterEffortBand !== 'all' && !filterOptions.effortBand.includes(filterEffortBand)) {
      setFilterEffortBand('all');
    }
  }, [
    filterRequiredLevel,
    filterDifficulty,
    filterAvailability,
    filterEffortBand,
    filterOptions,
    setFilterRequiredLevel,
    setFilterDifficulty,
    setFilterAvailability,
    setFilterEffortBand,
  ]);

  const filteredScopeRows = useMemo(() => {
    return scopeRows.filter((row) => {
      if (filterRequiredLevel !== 'all' && row.required_level !== filterRequiredLevel) return false;
      if (filterDifficulty !== 'all' && row.difficulty !== filterDifficulty) return false;
      if (filterAvailability !== 'all' && row.availability !== filterAvailability) return false;
      if (filterEffortBand !== 'all' && rowEffortBand(row) !== filterEffortBand) return false;
      return true;
    });
  }, [scopeRows, filterRequiredLevel, filterDifficulty, filterAvailability, filterEffortBand]);

  const sortedScopeRows = useMemo(() => {
    const copy = [...filteredScopeRows];
    copy.sort((a, b) => {
      const av = rankForSort(a, sortBy);
      const bv = rankForSort(b, sortBy);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filteredScopeRows, sortBy, sortDir]);
  const userSetByRouteKey = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const row of rows) {
      const baseline = defaultRowsByKey[row.route_key];
      if (!baseline) {
        map[row.route_key] = false;
        continue;
      }
      map[row.route_key] = JSON.stringify(rowDefaultsComparable(row)) !== JSON.stringify(rowDefaultsComparable(baseline));
    }
    return map;
  }, [rows, defaultRowsByKey]);

  useEffect(() => {
    if (sortedScopeRows.length === 0) {
      setSelectedRouteKey('');
      return;
    }
    const hasSelected = sortedScopeRows.some((row) => row.route_key === selectedRouteKey);
    if (!hasSelected) {
      setSelectedRouteKey(sortedScopeRows[0].route_key);
    }
  }, [sortedScopeRows, selectedRouteKey]);

  const selectedRow = useMemo(
    () => sortedScopeRows.find((row) => row.route_key === selectedRouteKey) || null,
    [sortedScopeRows, selectedRouteKey]
  );
  const selectedIsUserSet = selectedRow ? Boolean(userSetByRouteKey[selectedRow.route_key]) : false;

  function updateRow(routeKey: string, patch: Partial<LlmRouteRow>) {
    setRows((prev) => prev.map((row) => {
      if (row.route_key !== routeKey) return row;
      const merged = { ...row, ...patch };
      if (patch.effort_band === undefined) {
        merged.effort_band = toEffortBand(merged.effort);
      }
      return merged;
    }));
    editVersionRef.current += 1;
    setDirty(true);
  }

  function updateSelected(patch: Partial<LlmRouteRow>) {
    if (!selectedRow) return;
    updateRow(selectedRow.route_key, patch);
  }

  if (isAll) {
    return <p className="sf-status-text-muted mt-8 text-center">Select a specific category to manage LLM settings.</p>;
  }

  if (!llmHydrated && rows.length === 0) {
    return <Spinner className="h-6 w-6" />;
  }

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">LLM Settings Studio</h2>
            <p className="sf-text-label sf-status-text-muted mt-1">
              Route presets on the left, selected preset controls on the right.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { void reload(); }}
              disabled={!llmHydrated || isSaving || isResetting}
              className="rounded sf-icon-button px-3 py-1.5 sf-text-label disabled:opacity-50"
            >
              Reload
            </button>
            <button
              onClick={resetDefaults}
              disabled={!llmHydrated || isResetting}
              className="rounded sf-action-button px-3 py-1.5 sf-text-label disabled:opacity-50"
            >
              {isResetting ? 'Resetting...' : 'Reset Defaults'}
            </button>
            <button
              onClick={save}
              disabled={!llmHydrated || !dirty || isSaving}
              className="rounded sf-primary-button px-3 py-1.5 sf-text-label disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : autoSaveEnabled ? 'Save Now' : 'Save LLM Settings'}
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div
            className={`sf-text-label ${isSaving
              ? 'sf-status-text-info'
              : saveStatus.kind === 'error'
              ? 'sf-status-text-danger'
              : saveStatus.kind === 'partial'
              ? 'sf-status-text-warning'
              : 'sf-status-text-muted'
            }`}
          >
            {resolveLlmSettingsStatusText({
              isSaving,
              saveState: saveStatus.kind,
              saveMessage: saveStatus.message,
              llmHydrated,
              dirty,
              autoSaveEnabled,
              lastSavedAt,
            })}
          </div>
          <label className="sf-text-label flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(e) => setAutoSaveEnabled(e.target.checked)}
            />
            <span>Auto-Save</span>
          </label>
        </div>
      </div>

      <TabStrip
        tabs={scopeTabs}
        activeTab={activeScope}
        onSelect={setActiveScope}
        className="sf-tab-strip flex flex-wrap items-center gap-1 rounded p-1"
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4">
          <div className={`${cardCls} p-0 overflow-hidden`}>
            <div className="sticky top-0 z-20 sf-surface-elevated px-4 py-3 border-b space-y-3" style={{ borderColor: 'var(--sf-surface-border)' }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="sf-text-label font-semibold">Preset Buttons</div>
                  <div className="sf-text-caption sf-status-text-muted mt-0.5">Select a preset button, then tune it with Priority Mixer.</div>
                </div>
                <div className="text-right sf-text-caption sf-status-text-muted">
                  <div>
                    Showing {sortedScopeRows.length} / {scopeCounts[activeScope] || 0}
                  </div>
                  <div>Total loaded {scopeCounts[activeScope] || 0}</div>
                </div>
              </div>
              <div className="sf-text-caption sf-status-text-muted">
                Button imported from Field Rules {category} Contract
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="sf-text-caption sf-status-text-muted mb-1">Sort By</div>
                  <select className={`${selectCls} w-full`} value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                    <option value="effort">effort</option>
                    <option value="required_level">required_level</option>
                    <option value="difficulty">difficulty</option>
                    <option value="availability">availability</option>
                    <option value="route_key">route_key</option>
                  </select>
                </div>
                <div>
                  <div className="sf-text-caption sf-status-text-muted mb-1">Direction</div>
                  <button
                    className="w-full rounded sf-icon-button px-2 py-1.5 sf-text-label"
                    onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
                  >
                    {sortDir}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="sf-text-caption sf-status-text-muted mb-1">Filter Required</div>
                  <select className={`${selectCls} w-full`} value={filterRequiredLevel} onChange={(e) => setFilterRequiredLevel(e.target.value)}>
                    <option value="all">all</option>
                    {filterOptions.required.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <div className="sf-text-caption sf-status-text-muted mb-1">Filter Difficulty</div>
                  <select className={`${selectCls} w-full`} value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)}>
                    <option value="all">all</option>
                    {filterOptions.difficulty.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <div className="sf-text-caption sf-status-text-muted mb-1">Filter Availability</div>
                  <select className={`${selectCls} w-full`} value={filterAvailability} onChange={(e) => setFilterAvailability(e.target.value)}>
                    <option value="all">all</option>
                    {filterOptions.availability.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <div className="sf-text-caption sf-status-text-muted mb-1">Filter Effort Band</div>
                  <select className={`${selectCls} w-full`} value={filterEffortBand} onChange={(e) => setFilterEffortBand(e.target.value)}>
                    <option value="all">all</option>
                    {filterOptions.effortBand.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="max-h-[calc(100vh-360px)] overflow-y-auto p-3 space-y-2">
              {sortedScopeRows.map((row) => {
                const selected = row.route_key === selectedRouteKey;
                return (
                <button
                  key={row.route_key}
                  onClick={() => setSelectedRouteKey(row.route_key)}
                  className={`w-full text-left rounded sf-nav-item px-3 py-2 transition ${
                    selected
                      ? selectedRouteTone(row)
                      : ''
                  }`}
                  style={selected ? selectedRouteToneStyle(row) : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="sf-text-label font-semibold">{presetDisplayName(row)}</div>
                    {userSetByRouteKey[row.route_key] ? (
                      <span className="sf-text-caption px-1.5 py-0.5 rounded sf-chip-success">
                        User Set ✓
                      </span>
                    ) : null}
                  </div>
                  <div className="sf-text-label sf-status-text-muted mt-1">Effort band {rowEffortBand(row)}</div>
                  <div className="sf-text-caption sf-status-text-muted mt-0.5">{row.route_key}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className={`sf-text-caption px-1.5 py-0.5 rounded ${tagCls('required', row.required_level)}`}>
                      {row.required_level}
                    </span>
                    <span className={`sf-text-caption px-1.5 py-0.5 rounded ${tagCls('difficulty', row.difficulty)}`}>
                      {row.difficulty}
                    </span>
                    <span className={`sf-text-caption px-1.5 py-0.5 rounded ${tagCls('availability', row.availability)}`}>
                      {row.availability}
                    </span>
                    <span className={`sf-text-caption px-1.5 py-0.5 rounded ${tagCls('effort', String(row.effort))}`}>
                      effort {row.effort}
                    </span>
                  </div>
                </button>
                );
              })}

              {sortedScopeRows.length === 0 && (
                <div className="rounded sf-surface-elevated px-3 py-2">
                  <p className="sf-text-label sf-status-text-muted">No routes match current filters.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-8">
          {!selectedRow ? (
            <div className={cardCls}>
              <p className="sf-text-label sf-status-text-muted">Select a preset button to edit its settings.</p>
            </div>
          ) : (
            <div className={`${cardCls} p-0 overflow-hidden`}>
              <div className="sticky top-0 z-20 sf-surface-elevated px-4 py-3 border-b" style={{ borderColor: 'var(--sf-surface-border)' }}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="text-sm font-semibold">Priority Mixer</div>
                    <div className="sf-text-label sf-status-text-muted mt-0.5">{presetDisplayName(selectedRow)}</div>
                    <div className="sf-text-caption sf-status-text-muted mt-0.5">{selectedRow.route_key}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className={`sf-text-caption px-1.5 py-0.5 rounded ${selectedIsUserSet ? 'sf-chip-success' : 'sf-chip-neutral'}`}>
                      {selectedIsUserSet ? 'User Set ✓' : 'Default'}
                    </span>
                    <span className={`sf-text-caption px-1.5 py-0.5 rounded ${tagCls('required', selectedRow.required_level)}`}>
                      {selectedRow.required_level}
                    </span>
                    <span className={`sf-text-caption px-1.5 py-0.5 rounded ${tagCls('difficulty', selectedRow.difficulty)}`}>
                      {selectedRow.difficulty}
                    </span>
                    <span className={`sf-text-caption px-1.5 py-0.5 rounded ${tagCls('availability', selectedRow.availability)}`}>
                      {selectedRow.availability}
                    </span>
                    <span className={`sf-text-caption px-1.5 py-0.5 rounded ${tagCls('effort', String(selectedRow.effort))}`}>
                      effort {selectedRow.effort}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <div className="sf-text-label sf-status-text-muted mb-1">Required Level</div>
                    <select className={`${selectCls} w-full`} value={selectedRow.required_level} onChange={(e) => updateSelected({ required_level: e.target.value })}>
                      <option value="identity">identity</option>
                      <option value="required">required</option>
                      <option value="critical">critical</option>
                      <option value="expected">expected</option>
                      <option value="optional">optional</option>
                      <option value="editorial">editorial</option>
                      <option value="commerce">commerce</option>
                    </select>
                  </div>
                  <div>
                    <div className="sf-text-label sf-status-text-muted mb-1">Availability</div>
                    <select className={`${selectCls} w-full`} value={selectedRow.availability} onChange={(e) => updateSelected({ availability: e.target.value })}>
                      <option value="always">always</option>
                      <option value="expected">expected</option>
                      <option value="sometimes">sometimes</option>
                      <option value="rare">rare</option>
                      <option value="editorial_only">editorial_only</option>
                    </select>
                  </div>
                  <div>
                    <div className="sf-text-label sf-status-text-muted mb-1">Difficulty</div>
                    <select className={`${selectCls} w-full`} value={selectedRow.difficulty} onChange={(e) => updateSelected({ difficulty: e.target.value })}>
                      <option value="easy">easy</option>
                      <option value="medium">medium</option>
                      <option value="hard">hard</option>
                      <option value="instrumented">instrumented</option>
                    </select>
                  </div>
                  <div>
                    <div className="sf-text-label sf-status-text-muted mb-1">Effort: {selectedRow.effort}</div>
                    <input
                      className="w-full"
                      type="range"
                      min={EFFORT_BOUNDS.min}
                      max={EFFORT_BOUNDS.max}
                      value={selectedRow.effort}
                      onChange={(e) => updateSelected({
                        effort: clampToRange(Number.parseInt(e.target.value, 10), EFFORT_BOUNDS.min, EFFORT_BOUNDS.max),
                      })}
                    />
                    <div className="sf-text-caption sf-status-text-muted mt-1">Band: {rowEffortBand(selectedRow)}</div>
                  </div>
                </div>
              </div>

              <div className="max-h-[calc(100vh-360px)] overflow-y-auto p-4 space-y-4">
                <div className={cardCls}>
                  <div className="text-sm font-semibold mb-2">Source Package</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <label className="sf-text-label flex items-center gap-2">
                      <input type="checkbox" checked={selectedRow.single_source_data} onChange={(e) => updateSelected({ single_source_data: e.target.checked })} />
                      <span>Single Source Data</span>
                    </label>
                    <label className="sf-text-label flex items-center gap-2">
                      <input type="checkbox" checked={selectedRow.all_source_data} onChange={(e) => updateSelected({ all_source_data: e.target.checked })} />
                      <span>All Source Data</span>
                    </label>
                    <label className="sf-text-label flex items-center gap-2">
                      <input type="checkbox" checked={selectedRow.enable_websearch} onChange={(e) => updateSelected({ enable_websearch: e.target.checked })} />
                      <span>Enable Web Search</span>
                    </label>
                    <label className="sf-text-label flex items-center gap-2">
                      <input type="checkbox" checked={selectedRow.all_sources_confidence_repatch} onChange={(e) => updateSelected({ all_sources_confidence_repatch: e.target.checked })} />
                      <span>All Confidence Repatch</span>
                    </label>
                    <div>
                      <div className="sf-text-label sf-status-text-muted mb-1">Context Pack</div>
                      <select className={`${selectCls} w-full`} defaultValue="standard" onChange={(e) => updateSelected(applyContextPack(selectedRow, e.target.value as 'minimal' | 'standard' | 'full'))}>
                        <option value="standard">standard</option>
                        <option value="minimal">minimal</option>
                        <option value="full">full</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                    <div>
                      <div className="sf-text-label sf-status-text-muted mb-1">Scalar Send</div>
                      <select className={`${selectCls} w-full`} value={selectedRow.scalar_linked_send} onChange={(e) => updateSelected({ scalar_linked_send: e.target.value })}>
                        <option value="scalar value">scalar value</option>
                        <option value="scalar value + prime sources">scalar value + prime sources</option>
                      </select>
                    </div>
                    <div>
                      <div className="sf-text-label sf-status-text-muted mb-1">Component Send</div>
                      <select className={`${selectCls} w-full`} value={selectedRow.component_values_send} onChange={(e) => updateSelected({ component_values_send: e.target.value })}>
                        <option value="component values">component values</option>
                        <option value="component values + prime sources">component values + prime sources</option>
                      </select>
                    </div>
                    <div>
                      <div className="sf-text-label sf-status-text-muted mb-1">List Send</div>
                      <select className={`${selectCls} w-full`} value={selectedRow.list_values_send} onChange={(e) => updateSelected({ list_values_send: e.target.value })}>
                        <option value="list values">list values</option>
                        <option value="list values prime sources">list values prime sources</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className={cardCls}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold">Model Deck</div>
                    <div className="flex items-center gap-2">
                      <button className="rounded sf-icon-button px-2 py-1 sf-text-label" onClick={() => updateSelected(applyRoutePreset(selectedRow, 'balanced'))}>Balanced</button>
                      <button className="rounded sf-icon-button px-2 py-1 sf-text-label" onClick={() => updateSelected(applyRoutePreset(selectedRow, 'deep'))}>Deep</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="sf-text-label sf-status-text-muted mb-1">Model Ladder (today)</div>
                      <input className={`${inputCls} w-full`} value={selectedRow.model_ladder_today} onChange={(e) => updateSelected({ model_ladder_today: e.target.value })} />
                    </div>
                    <div>
                      <div className="sf-text-label sf-status-text-muted mb-1">Max Tokens: {selectedRow.max_tokens}</div>
                      <input
                        className="w-full"
                        type="range"
                        min={MAX_TOKEN_BOUNDS.min}
                        max={MAX_TOKEN_BOUNDS.max}
                        step={MAX_TOKEN_STEP}
                        value={selectedRow.max_tokens}
                        onChange={(e) => updateSelected({
                          max_tokens: clampToRange(Number.parseInt(e.target.value, 10), MAX_TOKEN_BOUNDS.min, MAX_TOKEN_BOUNDS.max),
                        })}
                      />
                    </div>
                  </div>
                </div>

                <div className={cardCls}>
                  <div className="text-sm font-semibold mb-2">Evidence Gate</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="sf-text-label sf-status-text-muted mb-1">Min Evidence Refs: {selectedRow.llm_output_min_evidence_refs_required}</div>
                      <input
                        className="w-full"
                        type="range"
                        min={MIN_EVIDENCE_BOUNDS.min}
                        max={MIN_EVIDENCE_BOUNDS.max}
                        value={selectedRow.llm_output_min_evidence_refs_required}
                        onChange={(e) => updateSelected({
                          llm_output_min_evidence_refs_required: clampToRange(
                            Number.parseInt(e.target.value, 10),
                            MIN_EVIDENCE_BOUNDS.min,
                            MIN_EVIDENCE_BOUNDS.max,
                          ),
                        })}
                      />
                    </div>
                    <div>
                      <div className="sf-text-label sf-status-text-muted mb-1">Insufficient Evidence Action</div>
                      <select className={`${selectCls} w-full`} value={selectedRow.insufficient_evidence_action} onChange={(e) => updateSelected({ insufficient_evidence_action: e.target.value })}>
                        <option value="threshold_unmet">threshold_unmet</option>
                        <option value="return_unk">return_unk</option>
                        <option value="escalate">escalate</option>
                      </select>
                    </div>
                  </div>
                </div>

                <details className={cardCls}>
                  <summary className="cursor-pointer sf-text-label sf-status-text-muted">Advanced Prompt Flags</summary>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                    {PROMPT_FLAG_FIELDS.map((key) => (
                      <label key={key} className="sf-text-label flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedRow[key])}
                          onChange={(e) => updateSelected({ [key]: e.target.checked } as Partial<LlmRouteRow>)}
                        />
                        <span>{flagLabel(key)}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
