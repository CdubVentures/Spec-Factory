/**
 * Finder Panel UI Contract — shared/ui/finder
 *
 * Every finder panel MUST use these shared components for visual consistency.
 * Module-specific content goes inside the body; the chrome is standardized.
 *
 * Required per panel:
 *   FinderPanelHeader   — collapse toggle, title, status chip, module chip, run button
 *   FinderKpiCard       — metric cards (grid of N, module decides count + tones)
 *   FinderCooldownStrip — 30-day cooldown progress bar
 *   FinderPanelFooter   — last-run date, model badge, run count
 *   FinderDeleteConfirmModal — confirmation for single-run or delete-all
 *   FinderRunPromptDetails   — expandable system prompt / user message / LLM response
 *   FinderSectionCard        — collapsible card for body sections (images, variants, history)
 *
 * Required hooks / selectors:
 *   useResolvedFinderModel(phaseId) — LLM model resolution, parameterized by phase
 *   deriveCooldownState(result)     — cooldown from server result
 *   deriveFinderStatusChip(result)  — status chip from run count
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
 * Canonical template: ProductImageFinderPanel.tsx
 */

export { ColorSwatch, colorCircleStyle } from './ColorSwatch.tsx';
export { FinderKpiCard } from './FinderKpiCard.tsx';
export { FinderPanelHeader } from './FinderPanelHeader.tsx';
export { FinderCooldownStrip } from './FinderCooldownStrip.tsx';
export { FinderPanelFooter } from './FinderPanelFooter.tsx';
export { FinderDeleteConfirmModal } from './FinderDeleteConfirmModal.tsx';
export { DiscoverySummaryBar } from './DiscoverySummaryBar.tsx';
export { FinderRunModelBadge } from './FinderRunModelBadge.tsx';
export { FinderRunPromptDetails } from './FinderRunPromptDetails.tsx';
export { FinderRunTimestamp } from './FinderRunTimestamp.tsx';
export { FinderSectionCard } from './FinderSectionCard.tsx';
export { toneToChipClass, toneToValueClass } from './toneMappings.ts';
export { deriveCooldownState, deriveFinderStatusChip, formatAtomLabel } from './finderSelectors.ts';
export { useResolvedFinderModel } from './useResolvedFinderModel.ts';
export type { ResolvedFinderModel } from './useResolvedFinderModel.ts';
export type { KpiCard, CooldownState, StatusChipData, RunDiscoveryLog, DeleteTarget } from './types.ts';
