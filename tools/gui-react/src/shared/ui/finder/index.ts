/**
 * Finder Panel UI Contract — shared/ui/finder
 *
 * Every finder panel MUST use these shared components for visual consistency.
 * Module-specific content goes inside the body; the chrome is standardized.
 *
 * Required per panel:
 *   IndexingPanelHeader — unified chrome for all indexing-lab panels (pipeline,
 *                         cef, pif, rdf, sku, key). Drives rail + icon chip
 *                         color via the `panel` prop. See IndexingPanelHeader.tsx.
 *   FinderKpiCard       — metric cards (grid of N, module decides count + tones)
 *   FinderPanelFooter   — last-run date, model badge, run count
 *   FinderDeleteConfirmModal — confirmation for single-run or delete-all
 *   FinderRunPromptDetails   — expandable system prompt / user message / LLM response
 *   FinderSectionCard        — collapsible card for body sections (images, variants, history)
 *   FinderHowItWorks         — collapsible "How It Works" explainer (2-col grid layout)
 *                              Content via typed HiwSection[] from feature-specific content file.
 *                              Block types: text, flow, callout, compare, learn-chain, slot-steps, table.
 *                              Place between KPI grid and first content section.
 *
 * Required hooks / selectors:
 *   useResolvedFinderModel(phaseId) — LLM model resolution, parameterized by phase
 *   formatAtomLabel(atom)           — titlecase raw color atoms for display
 *
 * Props sourced from finderModuleRegistry.js:
 *   chipLabel  ← moduleLabel   (e.g. "CEF", "PIF")
 *   chipClass  ← chipStyle     (e.g. "sf-chip-accent", "sf-chip-info")
 *   phaseId    ← phase         (e.g. "colorFinder", "imageFinder")
 *
 * Collapse key convention: `indexing:<moduleType>:collapsed:${productId}`
 * Section card key convention: `indexing:section:<moduleType>:<section>:${productId}`
 *
 * Section defaults: data sections (images, selected state) = open;
 *                   control sections (variants) = closed;
 *                   audit sections (run history) = closed.
 *
 * Run history pattern: manual <ModuleRunHistoryRow> components (flex row +
 *   expand/collapse arrow), NOT DataTable. Inner rows use sf-surface-panel
 *   inside the elevated FinderSectionCard. Expanded content uses
 *   FinderRunPromptDetails for prompt/response sections.
 *
 * Canonical templates:
 *   - Scalar field producers (variantFieldProducer): GenericScalarFinderPanel.tsx
 *     (RDF is the canonical consumer; future scalar finders wrap this)
 *   - Variant artifact producers (variantArtifactProducer): ProductImageFinderPanel.tsx
 *
 * GenericScalarFinderPanel hook-prop convention:
 *   The 3 hook props (useQuery, useDeleteRunMutation, useDeleteAllMutation)
 *   are use*-prefixed so ESLint's rules-of-hooks plugin recognizes them.
 *   Wrappers pass the generated hook references directly; do not rename.
 */

export { ColorSwatch, colorCircleStyle } from './ColorSwatch.tsx';
export { DataIntegrityBanner } from './DataIntegrityBanner.tsx';
export { FinderKpiCard } from './FinderKpiCard.tsx';
export { IndexingPanelHeader } from './IndexingPanelHeader.tsx';
export type { IndexingPanelId, IndexingPanelHeaderProps } from './IndexingPanelHeader.tsx';
export { PromptPreviewTriggerButton } from './PromptPreviewTriggerButton.tsx';
export { AnimatedDots } from './AnimatedDots.tsx';
export { FinderVariantRow } from './FinderVariantRow.tsx';
export { FinderRunHistoryRow } from './FinderRunHistoryRow.tsx';
export { ConfidenceRing } from './ConfidenceRing.tsx';
export type { ConfidenceRingProps } from './ConfidenceRing.tsx';
export { VariantSlotDots } from './VariantSlotDots.tsx';
export type { VariantSlotDotsProps } from './VariantSlotDots.tsx';
export { ImageCountBadge } from './ImageCountBadge.tsx';
export type { ImageCountBadgeProps } from './ImageCountBadge.tsx';
export { deriveConfidenceRingSpec } from './confidenceRingMath.ts';
export type { ConfidenceRingSpec, ConfidenceRingTone } from './confidenceRingMath.ts';
export { buildSlotDots, deriveSlotFracTone } from './slotDotsHelpers.ts';
export type { SlotDotItem, SlotFracTone } from './slotDotsHelpers.ts';
export { useFinderColorHexMap } from './useFinderColorHexMap.ts';
export { buildFinderVariantRows, buildEditionsMap } from './variantRowHelpers.ts';
export type { FinderVariantRowData, CefLikeData, CefLikeRegistryEntry, CefLikePublished } from './variantRowHelpers.ts';
export { FinderPanelFooter } from './FinderPanelFooter.tsx';
export { FinderDeleteConfirmModal } from './FinderDeleteConfirmModal.tsx';
export { DiscoverySummaryBar } from './DiscoverySummaryBar.tsx';
export { FinderRunModelBadge } from './FinderRunModelBadge.tsx';
export { FinderRunPromptDetails } from './FinderRunPromptDetails.tsx';
export { PromptPreviewView } from './PromptPreviewView.tsx';
export { PromptPreviewList } from './PromptPreviewList.tsx';
export { PromptPreviewModal } from './PromptPreviewModal.tsx';
export { PromptDrawerChevron } from './PromptDrawerChevron.tsx';
export { FinderRunTimestamp } from './FinderRunTimestamp.tsx';
export { FinderSectionCard } from './FinderSectionCard.tsx';
export { toneToValueClass } from './toneMappings.ts';
export { formatAtomLabel, resolveVariantColorAtoms } from './finderSelectors.ts';
export { useResolvedFinderModel } from './useResolvedFinderModel.ts';
export type { ResolvedFinderModel } from './useResolvedFinderModel.ts';
export type { KpiCard, RunDiscoveryLog, DeleteTarget } from './types.ts';
export { computePagination } from './paginationLogic.ts';
export { usePagination } from './usePagination.ts';
export { PagerSizeSelector } from './PagerSizeSelector.tsx';
export { PagerNavFooter } from './PagerNavFooter.tsx';
export { useShowMore } from './useShowMore.ts';
export { FinderDiscoveryDetails } from './FinderDiscoveryDetails.tsx';
export type { DiscoverySection } from './FinderDiscoveryDetails.tsx';
export { FinderEvidenceRow } from './FinderEvidenceRow.tsx';
export type { FinderEvidenceRowSource } from './FinderEvidenceRow.tsx';
export { GenericScalarFinderPanel } from './GenericScalarFinderPanel.tsx';
export type {
  GenericScalarFinderPanelProps,
  GenericScalarResult,
  GenericScalarRun,
  GenericScalarRunResponse,
  GenericScalarCandidate,
} from './GenericScalarFinderPanel.tsx';
export {
  deriveFinderKpiCards,
  deriveVariantRows,
  sortRunsNewestFirst,
} from './scalarFinderSelectors.ts';
export { FinderHowItWorks } from './FinderHowItWorks.tsx';
export { DiscoveryHistoryButton } from './DiscoveryHistoryButton.tsx';
export { DiscoveryHistoryDrawer } from './DiscoveryHistoryDrawer.tsx';
export type {
  FinderHowItWorksProps,
  HiwSection,
  HiwBlock,
  HiwTone,
  HiwFlowBox,
  HiwCompareCard,
  HiwLearnCell,
  HiwSlotStep,
} from './FinderHowItWorks.tsx';
