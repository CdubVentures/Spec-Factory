/**
 * GenericScalarFinderPanel — full panel scaffold for variantFieldProducer
 * (scalar) finders. RDF is the canonical consumer; future scalar finders
 * (sku, pricing, msrp, discontinued, upc) wrap this with their generated
 * hooks + HIW content.
 *
 * Wiring:
 *   - finderId → FINDER_PANELS lookup → moduleType / phase / label / routePrefix
 *     / panelTitle / panelTip / valueKey / valueLabelPlural
 *   - 3 React Query hook props (use*-prefixed so ESLint rules-of-hooks accepts them)
 *   - howItWorksSections (per-finder domain content)
 *   - optional formatValue (default identity) + renderEvidenceRow (default
 *     <FinderEvidenceRow>)
 */

import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { type UseQueryResult, type UseMutationResult } from '@tanstack/react-query';
import { clearPublishedField, deleteVariantField } from '../../../features/review/api/reviewApi.ts';
import { useDataChangeMutation } from '../../../features/data-change/index.js';
import { Spinner } from '../feedback/Spinner.tsx';
import { Chip } from '../feedback/Chip.tsx';
import { IndexingPanelHeader } from './IndexingPanelHeader.tsx';
import type { IndexingPanelId } from './IndexingPanelHeader.tsx';
import { PromptPreviewTriggerButton } from './PromptPreviewTriggerButton.tsx';
import { HeaderActionButton, RowActionButton, ACTION_BUTTON_WIDTH } from '../actionButton/index.ts';
// WHY: AnimatedDots removed — busy state now renders via <RowActionButton>'s
// built-in spinner for the 'locked' intent.
import { FinderKpiCard } from './FinderKpiCard.tsx';
import { FinderPanelFooter } from './FinderPanelFooter.tsx';
import { FinderEditablePhaseModelBadge } from './FinderEditablePhaseModelBadge.tsx';
import { FinderDeleteConfirmModal } from './FinderDeleteConfirmModal.tsx';
import { FinderSectionCard } from './FinderSectionCard.tsx';
import { FinderHowItWorks, type HiwSection } from './FinderHowItWorks.tsx';
import { FinderVariantRow } from './FinderVariantRow.tsx';
import { FinderRunHistoryRow } from './FinderRunHistoryRow.tsx';
import { ConfidenceChip } from './ConfidenceChip.tsx';
import { ConfidenceRing } from './ConfidenceRing.tsx';
import { FinderDiscoveryDetails, type DiscoverySection } from './FinderDiscoveryDetails.tsx';
import { FinderRunPromptDetails } from './FinderRunPromptDetails.tsx';
import { ColorSwatch } from './ColorSwatch.tsx';
import { DiscoveryHistoryButton } from './DiscoveryHistoryButton.tsx';
import { groupHistory, type FinderRun } from './discoveryHistoryHelpers.ts';
import { useFinderDiscoveryHistoryStore } from '../../../stores/finderDiscoveryHistoryStore.ts';
import { FinderEvidenceRow, type FinderEvidenceRowSource } from './FinderEvidenceRow.tsx';
import { PromptDrawerChevron } from './PromptDrawerChevron.tsx';
import { PromptPreviewModal } from './PromptPreviewModal.tsx';
import { useResolvedFinderModel } from './useResolvedFinderModel.ts';
import { useFinderColorHexMap } from './useFinderColorHexMap.ts';
import { getIndexingPanelCollapsedDefault } from './indexingPanelCollapseDefaults.ts';
import { resolveVariantColorAtoms } from './finderSelectors.ts';
import { buildFinderVariantRows, buildEditionsMap } from './variantRowHelpers.ts';
import { deriveFinderKpiCards, deriveVariantRows, sortRunsNewestFirst } from './scalarFinderSelectors.ts';
import type { DeleteTarget } from './types.ts';
import { FINDER_PANELS } from '../../../features/indexing/state/finderPanelRegistry.generated.ts';
import { FINDER_TAB_META } from '../../../features/indexing/panels/finderTabMeta.ts';
import type { FinderPanelId } from '../../../features/indexing/panels/finderTabMeta.ts';
import type { LlmOverridePhaseId } from '../../../features/llm-config/types/llmPhaseOverrideTypes.generated.ts';
import { ModelBadgeGroup } from '../../../features/llm-config/components/ModelAccessBadges.tsx';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { usePersistedExpandMap } from '../../../stores/tabStore.ts';
import { useFireAndForget } from '../../../features/operations/hooks/useFireAndForget.ts';
import { useIsModuleRunning, useRunningVariantKeys } from '../../../features/operations/hooks/useFinderOperations.ts';
import { useColorEditionFinderQuery } from '../../../features/color-edition-finder/index.ts';
import { usePromptPreviewQuery } from '../../../features/indexing/api/promptPreviewQueries.ts';
import type { PromptPreviewFinder, PromptPreviewRequestBody } from '../../../features/indexing/api/promptPreviewTypes.ts';

// ── Generic shapes (subset of every scalar finder's editorial schema) ──

interface GenericPublisherCandidate {
  readonly candidate_id: number;
  readonly status: string;
  readonly value: string | null;
  readonly confidence: number;
  readonly model: string;
}

interface GenericRejectionReason {
  readonly reason_code: string;
}

export interface GenericScalarCandidate {
  readonly variant_id: string | null;
  readonly variant_key: string;
  readonly variant_label: string;
  readonly variant_type: string;
  readonly value: string | null;
  readonly confidence: number;
  readonly unknown_reason?: string;
  readonly sources: readonly FinderEvidenceRowSource[];
  readonly ran_at: string;
  readonly rejected_by_gate?: boolean;
  readonly rejection_reasons?: readonly GenericRejectionReason[];
  readonly publisher_error?: string;
  readonly publisher_candidates?: readonly GenericPublisherCandidate[];
}

export interface GenericScalarRunResponse {
  readonly variant_id?: string | null;
  readonly variant_key?: string;
  readonly variant_label?: string;
  readonly confidence?: number;
  readonly unknown_reason?: string;
  readonly evidence_refs?: readonly unknown[];
  readonly discovery_log?: {
    readonly queries_run?: readonly string[];
    readonly urls_checked?: readonly string[];
    readonly notes?: readonly string[];
  };
  readonly loop_id?: string;
  readonly started_at?: string;
  readonly duration_ms?: number;
  readonly [k: string]: unknown;
}

export interface GenericScalarRun {
  readonly run_number: number;
  readonly ran_at: string;
  readonly model: string;
  readonly fallback_used: boolean;
  readonly effort_level?: string;
  readonly access_mode?: string;
  readonly thinking?: boolean;
  readonly web_search?: boolean;
  readonly started_at?: string | null;
  readonly duration_ms?: number | null;
  readonly prompt?: { readonly system?: string; readonly user?: string };
  readonly response?: GenericScalarRunResponse;
}

export interface GenericScalarResult {
  readonly product_id?: string;
  readonly category?: string;
  readonly run_count?: number;
  readonly last_ran_at?: string;
  readonly candidates?: readonly GenericScalarCandidate[];
  readonly runs?: readonly GenericScalarRun[];
}

// ── Props ──

export interface GenericScalarFinderPanelProps<
  TResult extends GenericScalarResult = GenericScalarResult,
> {
  readonly productId: string;
  readonly category: string;
  readonly finderId: string;
  // use*-prefixed so ESLint rules-of-hooks recognizes the props as hooks.
  readonly useQuery: (category: string, productId: string) => UseQueryResult<TResult | null>;
  readonly useDeleteRunMutation: (category: string, productId: string) => UseMutationResult<unknown, Error, number>;
  readonly useDeleteAllMutation: (category: string, productId: string) => UseMutationResult<unknown, Error, void>;
  readonly howItWorksSections: HiwSection[];
  readonly formatValue?: (value: string) => string;
  readonly renderEvidenceRow?: (source: FinderEvidenceRowSource, index: number) => ReactNode;
  /** When set, mounts a per-variant prompt-preview chevron drawer with Run/Loop
   *  actions and renders a single panel-level PromptPreviewModal. */
  readonly previewFinder?: PromptPreviewFinder;
}

type ScalarPromptModalState = {
  readonly variantKey: string;
  readonly variantLabel: string;
  readonly mode: 'run' | 'loop';
};

// ── Component ──

export function GenericScalarFinderPanel<TResult extends GenericScalarResult>({
  productId,
  category,
  finderId,
  useQuery,
  useDeleteRunMutation,
  useDeleteAllMutation,
  howItWorksSections,
  formatValue,
  renderEvidenceRow,
  previewFinder,
}: GenericScalarFinderPanelProps<TResult>) {
  const panelMeta = FINDER_PANELS.find((p) => p.id === finderId);
  if (!panelMeta) {
    throw new Error(`GenericScalarFinderPanel: finderId '${finderId}' not found in FINDER_PANELS registry`);
  }
  const moduleType = (panelMeta as { moduleType?: string }).moduleType ?? finderId;
  const moduleLabel = panelMeta.label;
  const phase = (panelMeta as { phase?: string }).phase ?? finderId;
  const routePrefix = panelMeta.routePrefix;
  const panelTitle = (panelMeta as { panelTitle?: string }).panelTitle ?? moduleLabel;
  const panelTip = (panelMeta as { panelTip?: string }).panelTip ?? '';
  const valueKey = (panelMeta as { valueKey?: string }).valueKey ?? 'value';
  const valueLabelPlural = (panelMeta as { valueLabelPlural?: string }).valueLabelPlural ?? 'Values';

  const fmt = formatValue ?? ((v: string) => v);
  const renderEv = renderEvidenceRow ?? ((source: FinderEvidenceRowSource, i: number) => <FinderEvidenceRow key={i} source={source} />);
  const tabMeta = FINDER_TAB_META[finderId as FinderPanelId];
  const panelId = (tabMeta?.iconClass ?? finderId) as IndexingPanelId;

  const [collapsed, toggleCollapsed] = usePersistedToggle(
    `indexing:${moduleType}:collapsed:${productId}`,
    getIndexingPanelCollapsedDefault(panelId),
  );
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [variantExpand, toggleVariantExpand] = usePersistedExpandMap(`indexing:${moduleType}:variantExpand:${productId}`);
  const [runExpand, toggleRunExpand] = usePersistedExpandMap(`indexing:${moduleType}:runExpand:${productId}`);
  const [activePromptModal, setActivePromptModal] = useState<ScalarPromptModalState | null>(null);
  const [headerPromptModalOpen, setHeaderPromptModalOpen] = useState(false);
  const headerPromptQuery = usePromptPreviewQuery(
    previewFinder ?? 'rdf',
    category,
    productId,
    {},
    Boolean(previewFinder) && headerPromptModalOpen,
  );

  const promptPreviewBody: PromptPreviewRequestBody = useMemo(() => (
    activePromptModal
      ? { variant_key: activePromptModal.variantKey, mode: activePromptModal.mode }
      : {}
  ), [activePromptModal]);
  const promptPreviewQuery = usePromptPreviewQuery(
    previewFinder ?? 'rdf',
    category,
    productId,
    promptPreviewBody,
    Boolean(previewFinder) && Boolean(activePromptModal),
  );

  const { data: cefData } = useColorEditionFinderQuery(category, productId);
  const { data: result = null, isLoading, isError } = useQuery(category, productId);

  const hexMap = useFinderColorHexMap();
  const editions = useMemo(() => buildEditionsMap(cefData), [cefData]);
  const cefVariants = useMemo(() => buildFinderVariantRows(cefData), [cefData]);

  const fire = useFireAndForget({ type: moduleType, category, productId });
  const runAllUrl = `/${routePrefix}/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;
  const loopUrl = `${runAllUrl}/loop`;

  const deleteRunMut = useDeleteRunMutation(category, productId);
  const deleteAllMut = useDeleteAllMutation(category, productId);

  // Per-variant UnPub / Del — reuses the shared deleteTarget modal. UnPub
  // hits POST /review/:cat/clear-published with variantId → variant-single
  // scope (demote + strip variant_fields[vid][fk]). Del hits the new POST
  // /review/:cat/delete-variant-field → wipes candidates + evidence for
  // (pid, fk, vid) and strips the JSON entry. Both invalidate the panel's
  // data query so the row flips state on success.
  const scalarVariantQueryKeys = [
    [routePrefix, category, productId],
    ['review', category],
  ] as const;
  const unpublishVariantMut = useDataChangeMutation<unknown, Error, { readonly fieldKey: string; readonly variantId: string }>({
    event: 'review-clear-published',
    category,
    mutationFn: ({ fieldKey, variantId }) => clearPublishedField(category, { productId, field: fieldKey, variantId }),
    extraQueryKeys: scalarVariantQueryKeys,
  });
  const deleteVariantMut = useDataChangeMutation<unknown, Error, { readonly fieldKey: string; readonly variantId: string }>({
    event: 'review-variant-field-deleted',
    category,
    mutationFn: ({ fieldKey, variantId }) => deleteVariantField(category, { productId, field: fieldKey, variantId }),
    extraQueryKeys: scalarVariantQueryKeys,
  });

  const { model: resolvedModel, accessMode, modelDisplay, effortLevel } = useResolvedFinderModel(phase as LlmOverridePhaseId);

  const isRunningModule = useIsModuleRunning(moduleType, productId);
  const loopingVariantKeys = useRunningVariantKeys(moduleType, productId, 'loop');

  const effectiveResult = isError ? null : result;
  const kpiCards = useMemo(
    () => deriveFinderKpiCards({ result: effectiveResult, totalVariants: cefVariants.length, valueLabelPlural }),
    [effectiveResult, cefVariants.length, valueLabelPlural],
  );
  const variantRows = useMemo(
    () => deriveVariantRows<GenericScalarCandidate>(cefVariants, effectiveResult),
    [cefVariants, effectiveResult],
  );
  const runHistoryRuns = useMemo(() => sortRunsNewestFirst<GenericScalarRun>(effectiveResult), [effectiveResult]);

  // Per-variant URL/QU counts for the in-drawer Hist button label. Groups
  // the finder's runs by scope='variant' (matches the drawer's own grouping)
  // so the counts shown on each row exactly equal what the drawer will
  // render when opened for that variant. Declared here (not inline later)
  // so the Del enable-state can reuse `has(variantId)` to mean "this variant
  // has at least one run" — which is what the user cares about: runs are
  // data that Del should wipe, even when the latest candidate got rejected
  // and `row.candidate` is undefined.
  const histCountsByVariant = useMemo(() => {
    const grouped = groupHistory(runHistoryRuns as readonly FinderRun[], 'variant');
    const map = new Map<string, { urls: number; queries: number }>();
    for (const [vid, bucket] of grouped.byVariant.entries()) {
      map.set(vid, { urls: bucket.urls.size, queries: bucket.queries.size });
    }
    return map;
  }, [runHistoryRuns]);

  // Panel-level UnPub All / Del All targets. Fans out per-variant mutations
  // through the existing unpublishVariantMut / deleteVariantMut — each call
  // cleans all four storage layers (field_candidates + product.json +
  // finder JSON + finder SQL) for that variant. Declared before
  // handleConfirmDelete so the fan-out loop can see them.
  const variantIdsWithPublishedValue = useMemo(
    () => variantRows.filter((r) => r.variant_id && Boolean(r.candidate?.value)).map((r) => r.variant_id as string),
    [variantRows],
  );
  // "Any data" = latest candidate OR any run in history. A variant with only
  // rejected-candidate runs still has data worth wiping (its discovery_log
  // keeps the Hist (Nqu)(Nurl) counter alive until we delete the runs).
  const variantIdsWithAnyData = useMemo(
    () => variantRows
      .filter((r) => r.variant_id && (Boolean(r.candidate) || histCountsByVariant.has(r.variant_id)))
      .map((r) => r.variant_id as string),
    [variantRows, histCountsByVariant],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const dismiss = () => setDeleteTarget(null);
    const onError = (err: Error) => {
      setDeleteTarget(null);
      window.alert(`Operation failed: ${err.message}`);
    };
    if (deleteTarget.kind === 'run' && deleteTarget.runNumber) {
      deleteRunMut.mutate(deleteTarget.runNumber, { onSuccess: dismiss });
    } else if (deleteTarget.kind === 'all') {
      deleteAllMut.mutate(undefined, { onSuccess: dismiss });
    } else if (deleteTarget.kind === 'field-variant-unpublish' && deleteTarget.variantId && deleteTarget.fieldKey) {
      unpublishVariantMut.mutate(
        { fieldKey: deleteTarget.fieldKey, variantId: deleteTarget.variantId },
        { onSuccess: dismiss, onError },
      );
    } else if (deleteTarget.kind === 'field-variant-delete' && deleteTarget.variantId && deleteTarget.fieldKey) {
      deleteVariantMut.mutate(
        { fieldKey: deleteTarget.fieldKey, variantId: deleteTarget.variantId },
        { onSuccess: dismiss, onError },
      );
    } else if (deleteTarget.kind === 'field-all-variants-unpublish' && deleteTarget.fieldKey) {
      // Fan out — fires the same per-variant mutation N times. Each call
      // invalidates the shared query; react-query batches refetches so we
      // don't thrash. Dismiss immediately (fire-and-forget) to match the
      // keyFinder "Unresolve all" pattern.
      for (const variantId of variantIdsWithPublishedValue) {
        unpublishVariantMut.mutate({ fieldKey: deleteTarget.fieldKey, variantId });
      }
      dismiss();
    } else if (deleteTarget.kind === 'field-all-variants-delete' && deleteTarget.fieldKey) {
      for (const variantId of variantIdsWithAnyData) {
        deleteVariantMut.mutate({ fieldKey: deleteTarget.fieldKey, variantId });
      }
      dismiss();
    }
  }, [deleteTarget, deleteRunMut, deleteAllMut, unpublishVariantMut, deleteVariantMut, variantIdsWithPublishedValue, variantIdsWithAnyData]);

  const handleRunVariant = useCallback((variantKey: string) => {
    fire(runAllUrl, { variant_key: variantKey });
  }, [fire, runAllUrl]);

  const handleRunAll = useCallback(() => {
    for (const row of variantRows) {
      fire(runAllUrl, { variant_key: row.variant_key });
    }
  }, [fire, runAllUrl, variantRows]);

  const handleLoopVariant = useCallback((variantKey: string) => {
    if (loopingVariantKeys.has(variantKey)) return;
    fire(loopUrl, { variant_key: variantKey }, { subType: 'loop', variantKey });
  }, [fire, loopUrl, loopingVariantKeys]);

  const handleLoopAll = useCallback(() => {
    for (const row of variantRows) {
      if (!loopingVariantKeys.has(row.variant_key)) {
        fire(loopUrl, { variant_key: row.variant_key }, { subType: 'loop', variantKey: row.variant_key });
      }
    }
  }, [fire, loopUrl, variantRows, loopingVariantKeys]);

  if (!productId || !category) return null;

  const badgeProps = {
    accessMode,
    role: (resolvedModel?.useReasoning ? 'reasoning' : 'primary') as 'reasoning' | 'primary',
    thinking: resolvedModel?.thinking ?? false,
    webSearch: resolvedModel?.webSearch ?? false,
  };

  const isAnyDeletePending = deleteRunMut.isPending || deleteAllMut.isPending || unpublishVariantMut.isPending || deleteVariantMut.isPending;

  // Per-variant Hist — opens the shared Discovery History drawer pre-filtered
  // to just this variant so users can scan URLs/queries for that one variant
  // without hunting through the full product history.
  const openHistoryForVariant = useFinderDiscoveryHistoryStore((s) => s.openDrawer);
  const handleHistVariant = useCallback((variantId: string | null) => {
    if (!variantId) return;
    openHistoryForVariant({ finderId, productId, category, variantIdFilter: variantId });
  }, [openHistoryForVariant, finderId, productId, category]);

  const handleUnpubAllVariants = useCallback(() => {
    if (variantIdsWithPublishedValue.length === 0) return;
    setDeleteTarget({
      kind: 'field-all-variants-unpublish',
      fieldKey: valueKey,
      count: variantIdsWithPublishedValue.length,
    });
  }, [variantIdsWithPublishedValue, valueKey]);
  const handleDelAllVariants = useCallback(() => {
    if (variantIdsWithAnyData.length === 0) return;
    setDeleteTarget({
      kind: 'field-all-variants-delete',
      fieldKey: valueKey,
      count: variantIdsWithAnyData.length,
    });
  }, [variantIdsWithAnyData, valueKey]);
  const withValueCount = variantRows.filter((r) => r.candidate?.value).length;

  const iconGlyph = tabMeta?.icon ?? '◆';

  return (
    <div className="sf-surface-panel p-0 flex flex-col" data-panel={panelId}>
      <IndexingPanelHeader
        panel={panelId}
        icon={iconGlyph}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        title={panelTitle}
        tip={panelTip}
        isRunning={isRunningModule}
        modelStrip={<FinderEditablePhaseModelBadge phaseId={phase as LlmOverridePhaseId} labelPrefix={moduleLabel} title={`${moduleLabel} - Model`} />}
        actionSlot={
          <>
            <HeaderActionButton
              intent="spammable"
              label="Run"
              onClick={handleRunAll}
              width={ACTION_BUTTON_WIDTH.standardHeader}
            />
            <HeaderActionButton
              intent="locked"
              label="Loop"
              onClick={handleLoopAll}
              disabled={cefVariants.length === 0}
              busy={variantRows.length > 0 && variantRows.every((r) => loopingVariantKeys.has(r.variant_key))}
              width={ACTION_BUTTON_WIDTH.standardHeader}
            />
            <span className="inline-block h-5 w-px mx-0.5 bg-current opacity-20" aria-hidden />
            <PromptDrawerChevron
              storageKey={`indexing:${moduleType}:panel-drawer:${productId}`}
              openWidthClass="w-[56rem]"
              drawerHeight="header"
              ariaLabel={`Prompt + history + data actions for every ${moduleLabel} variant`}
              closedTitle={`Show Prompt / Hist / Data for ${moduleLabel}`}
              openedTitle={`Hide Prompt / Hist / Data for ${moduleLabel}`}
              openTitle={previewFinder ? 'Prompts:' : undefined}
              primaryCustom={previewFinder ? (
                <PromptPreviewTriggerButton
                  onClick={() => setHeaderPromptModalOpen(true)}
                  disabled={!productId}
                  width={ACTION_BUTTON_WIDTH.standardHeader}
                />
              ) : undefined}
              secondaryTitle="Hist:"
              secondaryLabelClass="sf-history-label"
              secondaryCustom={
                <DiscoveryHistoryButton
                  finderId={finderId}
                  productId={productId}
                  category={category}
                  width={ACTION_BUTTON_WIDTH.standardHeader}
                />
              }
              tertiaryTitle="Data:"
              tertiaryLabelClass="sf-delete-label"
              tertiaryActions={[
                {
                  id: 'unpub-all',
                  label: 'UnPub all',
                  onClick: handleUnpubAllVariants,
                  disabled: variantIdsWithPublishedValue.length === 0 || isAnyDeletePending,
                  intent: variantIdsWithPublishedValue.length === 0 || isAnyDeletePending ? 'locked' : 'delete',
                  width: ACTION_BUTTON_WIDTH.standardHeader,
                  title: variantIdsWithPublishedValue.length === 0
                    ? `Nothing to unpublish — no published ${valueKey} across any variant.`
                    : `Demote every published ${valueKey} (${variantIdsWithPublishedValue.length} variant(s)) back to candidate. Reversible.`,
                },
                {
                  id: 'del-all',
                  label: 'Del all',
                  onClick: handleDelAllVariants,
                  disabled: variantIdsWithAnyData.length === 0 || isAnyDeletePending,
                  intent: variantIdsWithAnyData.length === 0 || isAnyDeletePending ? 'locked' : 'delete',
                  width: ACTION_BUTTON_WIDTH.standardHeader,
                  title: variantIdsWithAnyData.length === 0
                    ? `Nothing to delete — no ${valueKey} data in any variant.`
                    : `Wipe every ${valueKey} candidate and run across ${variantIdsWithAnyData.length} variant(s). Not reversible.`,
                },
              ]}
            />
          </>
        }
      />

      {collapsed ? null : isLoading ? (
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      ) : cefVariants.length === 0 ? (
        <div className="px-6 pb-6 pt-4">
          <div className="sf-callout sf-callout-warning px-4 py-3 rounded-lg sf-text-caption">
            Run the <strong>Color & Edition Finder</strong> first — {moduleLabel} needs the variant registry to iterate.
          </div>
        </div>
      ) : (
        <div className="px-6 pb-6 pt-4 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpiCards.map((card) => (
              <FinderKpiCard key={card.label} value={card.value} label={card.label} tone={card.tone} />
            ))}
          </div>

          <FinderHowItWorks
            storeKey={`${moduleType}:${productId}`}
            subtitle={`Per-variant ${valueLabelPlural.toLowerCase()} discovery, evidence & publish`}
            sections={howItWorksSections}
          />

          <FinderSectionCard
            title={`All ${valueLabelPlural}`}
            count={`${withValueCount} across ${variantRows.length} variant${variantRows.length !== 1 ? 's' : ''}`}
            storeKey={`${moduleType}:variants:${productId}`}
            defaultOpen
          >
            <div className="grid grid-cols-2 gap-3 items-start">
              {[0, 1].map((colIdx) => (
              <div key={colIdx} className="flex flex-col gap-3">
              {variantRows.filter((_, i) => i % 2 === colIdx).map((row) => {
                const atoms = resolveVariantColorAtoms(row.variant_key, editions);
                const hexParts = atoms.map((a) => hexMap.get(a.trim()) || '');
                const c = row.candidate;
                const isLooping = loopingVariantKeys.has(row.variant_key);
                const valueDisplay = fmt(c?.value ?? '');
                const hasValue = Boolean(c?.value);
                // Del should wipe everything associated with this variant,
                // including runs whose latest candidate has been rejected
                // (so row.candidate is undefined but Hist counts are live).
                const variantHasRuns = Boolean(row.variant_id) && histCountsByVariant.has(row.variant_id as string);
                return (
                  <FinderVariantRow
                    key={row.variant_key}
                    variant={row}
                    hexParts={hexParts}
                    expandable={Boolean(c)}
                    expanded={Boolean(variantExpand[row.variant_key])}
                    onToggle={() => toggleVariantExpand(row.variant_key)}
                    secondary={
                      hasValue ? (
                        <span className="font-mono sf-text-primary">{valueDisplay}</span>
                      ) : c?.unknown_reason ? (
                        <span className="font-mono sf-status-text-warning italic">unknown</span>
                      ) : (
                        <span className="sf-text-muted italic">no value yet</span>
                      )
                    }
                    trailing={
                      <>
                        <ConfidenceRing
                          confidence={c && c.confidence > 0 ? c.confidence / 100 : null}
                        />
                        <div className="shrink-0 flex items-center gap-1">
                          <RowActionButton
                            intent="spammable"
                            label="Run"
                            onClick={() => handleRunVariant(row.variant_key)}
                            width={ACTION_BUTTON_WIDTH.standardRow}
                          />
                          <RowActionButton
                            intent="locked"
                            label="Loop"
                            onClick={() => handleLoopVariant(row.variant_key)}
                            busy={isLooping}
                            width={ACTION_BUTTON_WIDTH.standardRow}
                          />
                          {previewFinder && (
                            <>
                              <span className="inline-block h-5 w-px mx-0.5 bg-current opacity-20" aria-hidden />
                              <PromptDrawerChevron
                                storageKey={`indexing:${moduleType}:prompt-drawer:${productId}:${row.variant_key}`}
                                openWidthClass="w-[38rem]"
                                ariaLabel={`Prompt + history + data actions for ${row.variant_label}`}
                                openTitle="Prompts:"
                                actions={[
                                  { label: 'Run',  onClick: () => setActivePromptModal({ variantKey: row.variant_key, variantLabel: row.variant_label, mode: 'run' }) },
                                  { label: 'Loop', onClick: () => setActivePromptModal({ variantKey: row.variant_key, variantLabel: row.variant_label, mode: 'loop' }) },
                                ]}
                                secondaryTitle="Hist:"
                                secondaryLabelClass="sf-history-label"
                                secondaryActions={[
                                  {
                                    id: 'hist',
                                    label: (() => {
                                      const counts = row.variant_id ? histCountsByVariant.get(row.variant_id) : null;
                                      const q = counts?.queries ?? 0;
                                      const u = counts?.urls ?? 0;
                                      return (
                                        <>
                                          Hist
                                          <span className="ml-1 font-mono">
                                            (<span className="font-bold">{q}</span>
                                            <span className="font-normal opacity-70">qu</span>)
                                            (<span className="font-bold">{u}</span>
                                            <span className="font-normal opacity-70">url</span>)
                                          </span>
                                        </>
                                      );
                                    })(),
                                    onClick: () => handleHistVariant(row.variant_id),
                                    disabled: !row.variant_id,
                                    intent: row.variant_id ? 'history' : 'locked',
                                    width: 'w-28',
                                    title: !row.variant_id
                                      ? 'Scalar (product-level) variants have no per-variant history.'
                                      : `Open Discovery History filtered to "${row.variant_label}".`,
                                  },
                                ]}
                                tertiaryTitle="Data:"
                                tertiaryLabelClass="sf-delete-label"
                                tertiaryActions={[
                                  {
                                    label: 'UnPub',
                                    onClick: () => {
                                      if (!row.variant_id) return;
                                      setDeleteTarget({
                                        kind: 'field-variant-unpublish',
                                        fieldKey: valueKey,
                                        variantId: row.variant_id,
                                        label: row.variant_label,
                                      });
                                    },
                                    disabled: !row.variant_id || !hasValue || isAnyDeletePending,
                                    intent: row.variant_id && hasValue && !isAnyDeletePending ? 'delete' : 'locked',
                                    title: !row.variant_id
                                      ? 'Scalar (product-level) variants cannot be unpublished per-variant.'
                                      : !hasValue
                                        ? `Nothing to unpublish — no published ${valueKey} for this variant.`
                                        : `Unpublish — demote this variant's ${valueKey} back to a candidate. Reversible.`,
                                  },
                                  {
                                    label: 'Del',
                                    onClick: () => {
                                      if (!row.variant_id) return;
                                      setDeleteTarget({
                                        kind: 'field-variant-delete',
                                        fieldKey: valueKey,
                                        variantId: row.variant_id,
                                        label: row.variant_label,
                                      });
                                    },
                                    disabled: !row.variant_id || (!hasValue && !c && !variantHasRuns) || isAnyDeletePending,
                                    intent: row.variant_id && (hasValue || Boolean(c) || variantHasRuns) && !isAnyDeletePending ? 'delete' : 'locked',
                                    title: !row.variant_id
                                      ? 'Scalar (product-level) variants cannot be deleted per-variant.'
                                      : (!hasValue && !c && !variantHasRuns)
                                        ? `Nothing to delete — no ${valueKey} data for this variant.`
                                        : `Delete — wipe every ${valueKey} candidate, published value, and run history for this variant. Not reversible.`,
                                  },
                                ]}
                              />
                            </>
                          )}
                        </div>
                      </>
                    }
                  >
                    {c && (
                      <div className="space-y-2">
                        {c.unknown_reason && (
                          <div className="text-[11px] sf-status-text-warning italic">
                            Unknown: {c.unknown_reason}
                          </div>
                        )}
                        {c.rejected_by_gate && (
                          <div className="text-[11px] sf-status-text-danger">
                            Rejected by publisher gate:
                            {(c.rejection_reasons || []).map((r, i) => (
                              <span key={i} className="ml-1 font-mono">{r.reason_code}</span>
                            ))}
                          </div>
                        )}
                        {c.publisher_error && (
                          <div className="text-[11px] sf-status-text-danger">
                            Publisher error: {c.publisher_error}
                          </div>
                        )}
                        {c.sources.length > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted">
                              Evidence ({c.sources.length})
                            </span>
                            {c.sources.map((s, i) => renderEv(s, i))}
                          </div>
                        ) : !c.unknown_reason && (
                          <div className="text-[11px] sf-text-muted italic">No evidence recorded.</div>
                        )}
                        {c.publisher_candidates && c.publisher_candidates.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted">
                              Publisher Candidates
                            </span>
                            {c.publisher_candidates.map((pc) => (
                              <div key={pc.candidate_id} className="flex items-center gap-2 text-[10px] font-mono sf-text-muted">
                                <span className={`px-1.5 py-0.5 rounded ${pc.status === 'resolved' ? 'sf-chip-success' : 'sf-chip-neutral'}`}>
                                  {pc.status}
                                </span>
                                <span className="sf-text-primary">{fmt(pc.value ?? '')}</span>
                                <span>· {pc.confidence}%</span>
                                <span className="sf-text-subtle">· {pc.model}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </FinderVariantRow>
                );
              })}
              </div>
              ))}
            </div>
          </FinderSectionCard>

          {runHistoryRuns.length > 0 && (
            <FinderSectionCard
              title="Run History"
              count={`${runHistoryRuns.length} run${runHistoryRuns.length !== 1 ? 's' : ''}`}
              storeKey={`${moduleType}:history:${productId}`}
              trailing={
                <RowActionButton
                  intent="delete"
                  label="Delete All"
                  onClick={() => setDeleteTarget({ kind: 'all', count: runHistoryRuns.length })}
                  disabled={isAnyDeletePending}
                />
              }
            >
              <div className="space-y-1.5">
                {runHistoryRuns.map((run) => {
                  const expanded = Boolean(runExpand[String(run.run_number)]);
                  const resp = run.response;
                  const variantKey = resp?.variant_key ?? '';
                  const variantLabel = resp?.variant_label || variantKey || '--';
                  const atoms = resolveVariantColorAtoms(variantKey, editions);
                  const hexParts = atoms.map((a) => hexMap.get(a.trim()) || '');
                  const rawValue = resp ? (resp[valueKey] as string | null | undefined) : undefined;
                  const valueDisplay = fmt(rawValue ?? '');
                  const evidenceCount = (resp?.evidence_refs?.length) ?? 0;
                  const log = resp?.discovery_log;
                  const discoverySections: DiscoverySection[] = [];
                  if (log?.queries_run?.length) discoverySections.push({ title: 'Queries Run', format: 'lines', items: [...log.queries_run] });
                  if (log?.urls_checked?.length) discoverySections.push({ title: 'URLs Checked', format: 'lines', items: [...log.urls_checked] });
                  if (log?.notes?.length) discoverySections.push({ title: 'Notes', format: 'lines', items: [...log.notes] });

                  return (
                    <FinderRunHistoryRow
                      key={run.run_number}
                      runNumber={run.run_number}
                      ranAt={run.ran_at}
                      startedAt={run.started_at ?? resp?.started_at}
                      durationMs={run.duration_ms ?? resp?.duration_ms ?? null}
                      model={run.model}
                      accessMode={run.access_mode}
                      effortLevel={run.effort_level}
                      fallbackUsed={run.fallback_used}
                      thinking={run.thinking}
                      webSearch={run.web_search}
                      expanded={expanded}
                      onToggle={() => toggleRunExpand(String(run.run_number))}
                      onDelete={(rn) => setDeleteTarget({ kind: 'run', runNumber: rn })}
                      deleteDisabled={isAnyDeletePending}
                      leftContent={
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium sf-surface-panel border sf-border-soft">
                          <ColorSwatch hexParts={hexParts} />
                          <span className="sf-text-primary truncate max-w-[180px]">{variantLabel}</span>
                        </span>
                      }
                      rightContent={
                        <>
                          <Chip
                            label={valueDisplay || '—'}
                            className={valueDisplay ? 'sf-chip-success font-mono' : 'sf-chip-warning font-mono'}
                          />
                          <ConfidenceChip value={resp?.confidence ?? 0} />
                          <Chip
                            label={`${evidenceCount} evidence`}
                            className={evidenceCount > 0 ? 'sf-chip-info' : 'sf-chip-neutral'}
                          />
                        </>
                      }
                    >
                      {log && discoverySections.length > 0 && (
                        <FinderDiscoveryDetails
                          title="Discovery Log"
                          sections={discoverySections}
                          storageKey={`${moduleType}:discoveryLog:${run.run_number}`}
                        />
                      )}
                      <FinderRunPromptDetails
                        systemPrompt={run.prompt?.system}
                        userMessage={run.prompt?.user}
                        response={resp}
                        storageKeyPrefix={`${moduleType}:runPrompt:${run.run_number}`}
                      />
                    </FinderRunHistoryRow>
                  );
                })}
              </div>
            </FinderSectionCard>
          )}

          <FinderPanelFooter
            lastRanAt={effectiveResult?.last_ran_at}
            runCount={effectiveResult?.run_count ?? 0}
            modelSlot={
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold sf-text-subtle">
                <ModelBadgeGroup {...badgeProps} />
                {modelDisplay}
                {effortLevel && <span className="sf-text-muted font-normal">{effortLevel}</span>}
              </span>
            }
          />
        </div>
      )}

      {deleteTarget && (
        <FinderDeleteConfirmModal
          target={deleteTarget}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          isPending={isAnyDeletePending}
          moduleLabel={moduleLabel}
          confirmLabel={
            (deleteTarget.kind === 'field-variant-unpublish' || deleteTarget.kind === 'field-all-variants-unpublish')
              ? 'Unpublish'
              : 'Delete'
          }
          descriptionOverrides={{
            run: `This will delete run #${deleteTarget.runNumber ?? ''}. Per-variant candidate rows are removed from field_candidates and the field re-publishes from remaining sources.`,
            all: `This will delete all ${deleteTarget.count ?? 0} run(s) and every candidate from this ${moduleLabel} module. Touches the ${moduleLabel} tables, JSON, and field_candidates.`,
          }}
        />
      )}

      {previewFinder && (
        <PromptPreviewModal
          open={Boolean(activePromptModal)}
          onClose={() => setActivePromptModal(null)}
          query={promptPreviewQuery}
          title={`${moduleLabel} — ${activePromptModal?.mode === 'loop' ? 'Loop (iter 1)' : 'Run'}`}
          subtitle={activePromptModal ? `variant: ${activePromptModal.variantLabel}` : undefined}
          storageKeyPrefix={`indexing:${moduleType}:preview:${productId}:${activePromptModal?.variantKey ?? ''}:${activePromptModal?.mode ?? ''}`}
        />
      )}

      {previewFinder && (
        <PromptPreviewModal
          open={headerPromptModalOpen}
          onClose={() => setHeaderPromptModalOpen(false)}
          query={headerPromptQuery}
          title={`${moduleLabel} — Compiled Prompt`}
          subtitle={productId ? `product: ${productId}` : undefined}
          storageKeyPrefix={`indexing:${moduleType}:header-preview:${productId}`}
        />
      )}
    </div>
  );
}
