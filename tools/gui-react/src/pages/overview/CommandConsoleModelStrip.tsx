/**
 * CommandConsoleModelStrip — per-finder LLM model badges that operators can
 * click to edit the dispatched model + reasoning + thinking + web-search bundle
 * inline. Mirrors the LLM Config phase / KF tier picker — same backing settings,
 * just surfaced from the Overview Command Console row.
 *
 * Modules covered:
 *   CEF  -> colorFinder phase
 *   PIF  -> imageFinder phase (run/loop)
 *   EVAL -> imageEvaluator phase (PIF eval)
 *   RDF  -> releaseDateFinder phase
 *   SKU  -> skuFinder phase
 *   KF   -> 4 difficulty tiers (easy / medium / hard / very_hard) routed via
 *          keyFinderTierSettingsJson.
 */

import { FinderEditablePhaseModelBadge, FinderModelPickerPopover, FinderRunModelBadge } from '../../shared/ui/finder/index.ts';
import { useKeyDifficultyModelMap, type DifficultyTier } from '../../features/key-finder/hooks/useKeyDifficultyModelMap.ts';
import type { LlmOverridePhaseId } from '../../features/llm-config/types/llmPhaseOverrideTypes.generated.ts';

interface FinderPhaseSpec {
  readonly label: string;
  readonly phaseId: LlmOverridePhaseId;
  readonly title: string;
}

const FINDER_PHASES: readonly FinderPhaseSpec[] = [
  { label: 'CEF',  phaseId: 'colorFinder',       title: 'CEF — Color & Edition Finder' },
  { label: 'PIF',  phaseId: 'imageFinder',       title: 'PIF — Product Image Finder' },
  { label: 'EVAL', phaseId: 'imageEvaluator',    title: 'EVAL — Image Evaluator' },
  { label: 'RDF',  phaseId: 'releaseDateFinder', title: 'RDF — Release Date Finder' },
  { label: 'SKU',  phaseId: 'skuFinder',         title: 'SKU — SKU Finder' },
];

const KF_TIERS: readonly { readonly tier: DifficultyTier; readonly label: string; readonly title: string }[] = [
  { tier: 'easy',      label: 'KF·EASY',   title: 'KF — Easy Tier' },
  { tier: 'medium',    label: 'KF·MED',    title: 'KF — Medium Tier' },
  { tier: 'hard',      label: 'KF·HARD',   title: 'KF — Hard Tier' },
  { tier: 'very_hard', label: 'KF·V.HARD', title: 'KF — Very Hard Tier' },
];

function FinderPhaseBadge({ spec }: { spec: FinderPhaseSpec }) {
  return (
    <FinderEditablePhaseModelBadge
      phaseId={spec.phaseId}
      labelPrefix={spec.label}
      title={spec.title}
      showAccessModeText
    />
  );
}

export function CommandConsoleModelStrip() {
  const tierMap = useKeyDifficultyModelMap();
  return (
    <span className="sf-cc-models-strip">
      {FINDER_PHASES.map((spec) => (
        <FinderPhaseBadge key={spec.phaseId} spec={spec} />
      ))}
      <span className="sf-cc-models-divider" aria-hidden />
      {KF_TIERS.map((t) => {
        const r = tierMap[t.tier];
        const badge = (
          <FinderRunModelBadge
            labelPrefix={t.label}
            model={r.model}
            accessMode={r.accessMode}
            thinking={r.thinking}
            webSearch={r.webSearch}
            effortLevel={r.effortLevel}
            showAccessModeText
          />
        );
        return (
          <FinderModelPickerPopover
            key={t.tier}
            binding="kfTier"
            tier={t.tier}
            title={t.title}
            trigger={badge}
          />
        );
      })}
    </span>
  );
}
