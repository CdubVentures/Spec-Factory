// WHY: Single icon set for the five key archetypes (variant-dependent,
// product-image-dependent, component-self, component-identity-projection,
// component-attribute). Consumed by Key Navigator, Review Grid, and
// Studio Workbench. KeyTypeIconStrip is the only thing surfaces should
// render — it composes the icons + tooltip + ordering from the kinds
// returned by deriveKeyTypeIcons.

import type { KeyTypeIconKind } from './keyTypeIconHelpers.ts';
import { componentColorClass } from './componentColor.ts';

const ICON_SIZE = 14;

interface IconProps {
  readonly className?: string;
}

const baseSvgProps = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function VariantDependentIcon({ className }: IconProps) {
  // Three diverging branches from a single root — "value forks per variant"
  return (
    <svg {...baseSvgProps} className={className} aria-hidden="true">
      <path d="M8 14V9" />
      <path d="M8 9L4 4" />
      <path d="M8 9L8 3" />
      <path d="M8 9L12 4" />
      <circle cx="4" cy="3" r="1.1" />
      <circle cx="8" cy="2.5" r="1.1" />
      <circle cx="12" cy="3" r="1.1" />
    </svg>
  );
}

export function ProductImageDependentIcon({ className }: IconProps) {
  // Framed image with focus dot — "PIF identity image evidence"
  return (
    <svg {...baseSvgProps} className={className} aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 11l3.5-3 3 2.5 2.5-2 3 2.5" />
      <circle cx="11" cy="6" r="1.1" />
    </svg>
  );
}

export function ComponentSelfIcon({ className }: IconProps) {
  // Solid hexagon — "this field IS a component"
  return (
    <svg {...baseSvgProps} className={className} aria-hidden="true">
      <path d="M8 1.5l5.5 3.25v6.5L8 14.5 2.5 11.25v-6.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ComponentIdentityProjectionIcon({ className }: IconProps) {
  // Hexagon with arrow — "derived/projected from a parent component"
  return (
    <svg {...baseSvgProps} className={className} aria-hidden="true">
      <path d="M6 1.5l3.5 2.25v4.5L6 10.5 2.5 8.25v-4.5z" />
      <path d="M9.5 12h4" />
      <path d="M12 10.5L13.5 12 12 13.5" />
    </svg>
  );
}

export function ComponentAttributeIcon({ className }: IconProps) {
  // Hexagon with interior dot — "sibling attribute of a component"
  return (
    <svg {...baseSvgProps} className={className} aria-hidden="true">
      <path d="M8 1.5l5.5 3.25v6.5L8 14.5 2.5 11.25v-6.5z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

const ICON_BY_KIND: Record<KeyTypeIconKind, (props: IconProps) => JSX.Element> = {
  variant: VariantDependentIcon,
  pif: ProductImageDependentIcon,
  component_self: ComponentSelfIcon,
  component_identity_projection: ComponentIdentityProjectionIcon,
  component_attribute: ComponentAttributeIcon,
};

const TOOLTIP_BY_KIND: Record<KeyTypeIconKind, string> = {
  variant: 'Variant-dependent — value resolves per variant',
  pif: 'Product-image-dependent — fed into PIF identity prompts',
  component_self: 'Component — this field IS a component',
  component_identity_projection: 'Generated component identity — derived from the parent component link',
  component_attribute: 'Component attribute — sibling subfield of a component',
};

// WHY: when a key belongs to a component, every icon related to that
// component shares the same color tint so all keys in that component family
// (self + <component>_brand + <component>_link + sibling attributes) read
// as one group at a glance. Non-component icons (variant / pif) keep the
// neutral info-blue.
const COMPONENT_TINTED_KINDS: ReadonlySet<KeyTypeIconKind> = new Set([
  'component_self',
  'component_identity_projection',
  'component_attribute',
]);

interface KeyTypeIconStripProps {
  readonly kinds: readonly KeyTypeIconKind[];
  readonly owningComponent?: string;
  readonly className?: string;
  readonly extraTooltip?: string;
}

export function KeyTypeIconStrip({
  kinds,
  owningComponent = '',
  className,
  extraTooltip,
}: KeyTypeIconStripProps) {
  if (kinds.length === 0) return null;
  const tooltipLines = kinds.map((k) => TOOLTIP_BY_KIND[k]);
  if (owningComponent) tooltipLines.push(`Component: ${owningComponent}`);
  if (extraTooltip) tooltipLines.push(extraTooltip);
  const title = tooltipLines.join('\n');
  const componentTint = componentColorClass(owningComponent);
  return (
    <span
      className={`inline-flex items-center gap-0.5 flex-shrink-0 ${className || ''}`}
      title={title}
      aria-label={tooltipLines.join('; ')}
    >
      {kinds.map((kind) => {
        const Icon = ICON_BY_KIND[kind];
        const tint = componentTint && COMPONENT_TINTED_KINDS.has(kind)
          ? componentTint
          : 'sf-status-text-info';
        return <Icon key={kind} className={tint} />;
      })}
    </span>
  );
}
