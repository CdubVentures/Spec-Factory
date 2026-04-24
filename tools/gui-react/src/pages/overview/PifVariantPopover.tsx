import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PifVariantProgressGen } from '../../types/product.generated.ts';
import { ColorSwatch } from '../../shared/ui/finder/ColorSwatch.tsx';
import { FinderRunModelBadge, useResolvedFinderModel } from '../../shared/ui/finder/index.ts';
import { Popover } from '../../shared/ui/overlay/Popover.tsx';
import { FinderRunPopoverShell } from '../../shared/ui/overlay/FinderRunPopoverShell.tsx';
import { useFireAndForget } from '../../features/operations/hooks/useFireAndForget.ts';
import { useIsModuleRunning } from '../../features/operations/hooks/useFinderOperations.ts';
import { api } from '../../api/client.ts';
import { PifVariantRings } from './PifVariantRings.tsx';

// Minimal shape of what we need from PIF data — just image list for eval fan-out.
interface PifImageRow { readonly variant_key: string; readonly view: string }
interface PifDataShape { readonly images?: readonly PifImageRow[] }

export interface PifVariantPopoverProps {
  readonly productId: string;
  readonly category: string;
  readonly variant: PifVariantProgressGen;
  readonly hexMap: ReadonlyMap<string, string>;
  /** When true, the trigger SVGs pulse (this variant has a PIF op running). */
  readonly pulsing?: boolean;
}

const EVAL_STAGGER_MS = 500;

/**
 * Per-variant PIF trigger cell — color chip + 3-ring progress + fraction, all
 * wrapped in a popover with Run View / Run Hero / Run Loop / Evaluate actions
 * scoped to this single variant. Evaluate lazy-fetches the product's PIF image
 * list (only while the popover is open) so we don't load it for every row.
 */
export function PifVariantPopover({
  productId, category, variant, hexMap, pulsing = false,
}: PifVariantPopoverProps) {
  const [open, setOpen] = useState(false);
  const hexParts = variant.color_atoms.map((atom) => hexMap.get(atom) || '').filter(Boolean);
  const label = variant.variant_label || variant.variant_key || variant.variant_id;
  const totalFilled = variant.priority_filled + variant.loop_filled + variant.hero_filled;
  const totalTarget = variant.priority_total + variant.loop_total + variant.hero_target;

  const fire = useFireAndForget({ type: 'pif', category, productId });
  const isRunning = useIsModuleRunning('pif', productId);

  const runUrl = `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;
  const loopUrl = `${runUrl}/loop`;
  const evalViewUrl = `${runUrl}/evaluate-view`;
  const evalHeroUrl = `${runUrl}/evaluate-hero`;

  const finderModel = useResolvedFinderModel('imageFinder');
  const evalModel = useResolvedFinderModel('imageEvaluator');

  // Fetch PIF image list only when popover is open — Evaluate needs to know
  // which views have images to fan out `/evaluate-view` calls. Other actions
  // don't need it; we still mount the query so the "Evaluate" button can
  // reflect whether there's anything to evaluate.
  const { data: pifData } = useQuery<PifDataShape>({
    queryKey: ['product-image-finder', category, productId],
    queryFn: () => api.get<PifDataShape>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    enabled: open && Boolean(productId) && Boolean(category),
    staleTime: 0,
  });

  const variantKey = variant.variant_key || '';
  const variantId = variant.variant_id;

  const viewsForVariant = (() => {
    const set = new Set<string>();
    for (const img of pifData?.images ?? []) {
      if ((img?.variant_key || '') === variantKey) set.add(img?.view || '');
    }
    return set;
  })();
  const canonicalViews = [...viewsForVariant].filter((v) => v && v !== 'hero');
  const hasHeroes = viewsForVariant.has('hero');
  const hasEvalTargets = canonicalViews.length > 0 || hasHeroes;

  const handleRunView = useCallback(() => {
    fire(runUrl, { variant_key: variantKey, variant_id: variantId, mode: 'view' }, { subType: 'view', variantKey });
    setOpen(false);
  }, [fire, runUrl, variantKey, variantId]);

  const handleRunHero = useCallback(() => {
    fire(runUrl, { variant_key: variantKey, variant_id: variantId, mode: 'hero' }, { subType: 'hero', variantKey });
    setOpen(false);
  }, [fire, runUrl, variantKey, variantId]);

  const handleRunLoop = useCallback(() => {
    fire(loopUrl, { variant_key: variantKey, variant_id: variantId }, { subType: 'loop', variantKey });
    setOpen(false);
  }, [fire, loopUrl, variantKey, variantId]);

  const handleEval = useCallback(() => {
    canonicalViews.forEach((view, i) => {
      setTimeout(() => {
        fire(evalViewUrl, { variant_key: variantKey, variant_id: variantId, view }, { subType: 'evaluate', variantKey });
      }, i * EVAL_STAGGER_MS);
    });
    if (hasHeroes) {
      setTimeout(() => {
        fire(evalHeroUrl, { variant_key: variantKey, variant_id: variantId }, { subType: 'evaluate', variantKey });
      }, canonicalViews.length * EVAL_STAGGER_MS);
    }
    setOpen(false);
  }, [fire, evalViewUrl, evalHeroUrl, canonicalViews, hasHeroes, variantKey, variantId]);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      triggerLabel={`PIF ${label} — click to run`}
      trigger={
        <span className={`sf-pif-rings-cluster${pulsing ? ' sf-pulsing' : ''}`}>
          <ColorSwatch hexParts={hexParts} size="md" />
          <PifVariantRings
            priorityFilled={variant.priority_filled}
            priorityTotal={variant.priority_total}
            loopFilled={variant.loop_filled}
            loopTotal={variant.loop_total}
            heroFilled={variant.hero_filled}
            heroTarget={variant.hero_target}
          />
          <span className="sf-pif-rings-label">
            {totalFilled}/{totalTarget}
          </span>
        </span>
      }
    >
      <FinderRunPopoverShell
        title={`Product Image Finder — ${label}`}
        meta={
          <>P {variant.priority_filled}/{variant.priority_total} &middot; H {variant.hero_filled}/{variant.hero_target} &middot; L {variant.loop_filled}/{variant.loop_total}</>
        }
        modelSlot={
          <>
            <FinderRunModelBadge
              labelPrefix="PIF"
              model={finderModel.modelDisplay}
              accessMode={finderModel.accessMode}
              thinking={finderModel.model?.thinking ?? false}
              webSearch={finderModel.model?.webSearch ?? false}
              effortLevel={finderModel.effortLevel}
            />
            <FinderRunModelBadge
              labelPrefix="Eval"
              model={evalModel.modelDisplay}
              accessMode={evalModel.accessMode}
              thinking={evalModel.model?.thinking ?? false}
              webSearch={evalModel.model?.webSearch ?? false}
              effortLevel={evalModel.effortLevel}
            />
          </>
        }
        actions={
          <div className="sf-pif-popover-actions">
            <button type="button" className="sf-frp-btn-primary" onClick={handleRunView} disabled={isRunning}>
              Run View
            </button>
            <button type="button" className="sf-frp-btn-secondary" onClick={handleRunHero} disabled={isRunning}>
              Run Hero
            </button>
            <button type="button" className="sf-frp-btn-secondary" onClick={handleRunLoop} disabled={isRunning}>
              Run Loop
            </button>
            <button type="button" className="sf-frp-btn-secondary" onClick={handleEval} disabled={!hasEvalTargets}>
              Evaluate
            </button>
          </div>
        }
      />
    </Popover>
  );
}
