import type { PifVariantProgressGen } from '../../types/product.generated.ts';
import { ColorSwatch } from '../../shared/ui/finder/ColorSwatch.tsx';
import { PifVariantRings } from './PifVariantRings.tsx';
import './PifVariantRings.css';

export interface PifVariantsCellProps {
  readonly variants: readonly PifVariantProgressGen[];
  readonly hexMap: ReadonlyMap<string, string>;
}

/**
 * Overview-table cell for the PIF column. Renders one cluster per variant:
 * color chip + 3-ring progress + fraction label. Variants wrap horizontally
 * on overflow. Empty state (no PIF progress rows) renders an em-dash.
 */
export function PifVariantsCell({ variants, hexMap }: PifVariantsCellProps) {
  if (!variants.length) {
    return <span className="sf-text-subtle text-xs italic">—</span>;
  }
  return (
    <span className="inline-flex gap-2.5 flex-wrap items-start">
      {variants.map((v) => {
        const hexParts = v.color_atoms.map((atom) => hexMap.get(atom) || '').filter(Boolean);
        const totalFilled = v.priority_filled + v.loop_filled + v.hero_filled;
        const totalTarget = v.priority_total + v.loop_total + v.hero_target;
        const tooltip =
          `${v.variant_label || v.variant_key || v.variant_id} — ` +
          `Priority ${v.priority_filled}/${v.priority_total} · ` +
          `Hero ${v.hero_filled}/${v.hero_target} · ` +
          `Loop extras ${v.loop_filled}/${v.loop_total}`;
        return (
          <span key={v.variant_id} className="sf-pif-rings-cluster" title={tooltip}>
            <ColorSwatch hexParts={hexParts} size="md" />
            <PifVariantRings
              priorityFilled={v.priority_filled}
              priorityTotal={v.priority_total}
              loopFilled={v.loop_filled}
              loopTotal={v.loop_total}
              heroFilled={v.hero_filled}
              heroTarget={v.hero_target}
            />
            <span className="sf-pif-rings-label">
              {totalFilled}/{totalTarget}
            </span>
          </span>
        );
      })}
    </span>
  );
}
