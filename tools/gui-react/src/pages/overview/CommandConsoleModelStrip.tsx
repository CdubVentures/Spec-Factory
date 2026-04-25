/**
 * CommandConsoleModelStrip — read-only summary of the LLM models that the
 * Command Console's bulk + pipeline buttons would dispatch with. Mirrors the
 * per-finder panel headers so operators can see model / lab / web /
 * thinking / effort at a glance before firing a 50-product fan-out.
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

import { FinderRunModelBadge, useResolvedFinderModel } from '../../shared/ui/finder/index.ts';
import { useKeyDifficultyModelMap, type DifficultyTier } from '../../features/key-finder/hooks/useKeyDifficultyModelMap.ts';
import type { LlmOverridePhaseId } from '../../features/llm-config/types/llmPhaseOverrideTypes.generated.ts';

interface FinderPhaseSpec {
  readonly label: string;
  readonly phaseId: LlmOverridePhaseId;
}

const FINDER_PHASES: readonly FinderPhaseSpec[] = [
  { label: 'CEF',  phaseId: 'colorFinder' },
  { label: 'PIF',  phaseId: 'imageFinder' },
  { label: 'EVAL', phaseId: 'imageEvaluator' },
  { label: 'RDF',  phaseId: 'releaseDateFinder' },
  { label: 'SKU',  phaseId: 'skuFinder' },
];

const KF_TIERS: readonly { readonly tier: DifficultyTier; readonly label: string }[] = [
  { tier: 'easy',      label: 'KF·EASY' },
  { tier: 'medium',    label: 'KF·MED' },
  { tier: 'hard',      label: 'KF·HARD' },
  { tier: 'very_hard', label: 'KF·V.HARD' },
];

function FinderPhaseBadge({ spec }: { spec: FinderPhaseSpec }) {
  const { modelDisplay, accessMode, effortLevel, model } = useResolvedFinderModel(spec.phaseId);
  return (
    <FinderRunModelBadge
      labelPrefix={spec.label}
      model={modelDisplay}
      accessMode={accessMode}
      thinking={model?.thinking ?? false}
      webSearch={model?.webSearch ?? false}
      effortLevel={effortLevel}
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
        return (
          <FinderRunModelBadge
            key={t.tier}
            labelPrefix={t.label}
            model={r.model}
            thinking={r.thinking}
            webSearch={r.webSearch}
            effortLevel={r.effortLevel}
          />
        );
      })}
    </span>
  );
}
