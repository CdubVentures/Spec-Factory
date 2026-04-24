import type { ScalarVariantProgressGen } from '../../types/product.generated.ts';
import { ColorSwatch } from '../../shared/ui/finder/ColorSwatch.tsx';
import { ConfidenceDiamond } from './ConfidenceDiamond.tsx';
import './PifVariantRings.css';

export interface ScalarVariantsCellProps {
  readonly variants: readonly ScalarVariantProgressGen[];
  readonly hexMap: ReadonlyMap<string, string>;
  /** Label format for the truncated value under each diamond. */
  readonly formatLabel?: (value: string) => string;
  /** Tooltip field label — e.g. "SKU" or "Release Date". */
  readonly valueLabel: string;
}

function truncate(str: string, max = 10): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '\u2026';
}

const DEFAULT_FORMAT = (v: string) => truncate(v, 10);

/**
 * Overview-table cell for per-variant scalar finders (SKU + RDF).
 * Each variant renders as: color chip on top · confidence diamond · truncated
 * value label. Hover tooltip shows the full value + confidence.
 */
export function ScalarVariantsCell({
  variants, hexMap, formatLabel = DEFAULT_FORMAT, valueLabel,
}: ScalarVariantsCellProps) {
  if (!variants.length) {
    return <span className="sf-text-subtle text-xs italic">—</span>;
  }
  return (
    <span className="inline-flex gap-2.5 flex-wrap items-start">
      {variants.map((v) => {
        const hexParts = v.color_atoms.map((atom) => hexMap.get(atom) || '').filter(Boolean);
        const hasValue = v.value && v.confidence > 0;
        const tooltip = hasValue
          ? `${v.variant_label || v.variant_key || v.variant_id} \u00b7 ${valueLabel}: ${v.value} \u00b7 conf ${Math.round(v.confidence)}%`
          : `${v.variant_label || v.variant_key || v.variant_id} \u00b7 ${valueLabel}: (no candidate)`;
        return (
          <span key={v.variant_id} className="sf-pif-rings-cluster" title={tooltip}>
            <ColorSwatch hexParts={hexParts} size="md" />
            <ConfidenceDiamond confidence={v.confidence} />
            <span className="sf-pif-rings-label">
              {hasValue ? formatLabel(v.value) : '\u2014'}
            </span>
          </span>
        );
      })}
    </span>
  );
}
