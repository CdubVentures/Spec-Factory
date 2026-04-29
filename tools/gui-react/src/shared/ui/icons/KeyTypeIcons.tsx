// WHY: Single icon set for the five key archetypes (variant-dependent,
// product-image-dependent, component-self, component-identity-projection,
// component-attribute). Consumed by Key Navigator, Review Grid, and
// Studio Workbench. KeyTypeIconStrip is the only thing surfaces should
// render — it composes the icons + tooltip + ordering from the kinds
// returned by deriveKeyTypeIcons.

import * as Tooltip from '@radix-ui/react-tooltip';
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

export function ComponentIdentityBrandIcon({ className }: IconProps) {
  // Hexagon with outbound arrow + bold brand mark — "brand side of identity,
  // resolved with full component table"
  return (
    <svg {...baseSvgProps} className={className} aria-hidden="true">
      <path d="M6 1.5l3.5 2.25v4.5L6 10.5 2.5 8.25v-4.5z" />
      <path d="M9.5 12h4" />
      <path d="M12 10.5L13.5 12 12 13.5" />
      <circle cx="6" cy="6" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ComponentIdentityLinkIcon({ className }: IconProps) {
  // Hexagon with chain-link motif — "link/attribute lane, resolved row only"
  return (
    <svg {...baseSvgProps} className={className} aria-hidden="true">
      <path d="M6 1.5l3.5 2.25v4.5L6 10.5 2.5 8.25v-4.5z" />
      <path d="M10 11.5h1.5a1.5 1.5 0 010 3H10" />
      <path d="M14 11.5h-1.5a1.5 1.5 0 000 3H14" />
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
  component_identity_brand: ComponentIdentityBrandIcon,
  component_identity_link: ComponentIdentityLinkIcon,
  component_attribute: ComponentAttributeIcon,
};

// WHY: tooltips spell out the key's special treatment so a hover answers
// "how is this key run differently and what does the LLM see?" without the
// user reading the routes/contracts. Structured as { title, body } so the
// Radix tooltip can render the title in bold and the body in normal weight.
interface KindTooltipInfo {
  readonly title: string;
  readonly body: string;
}

const TOOLTIP_INFO_BY_KIND: Record<KeyTypeIconKind, KindTooltipInfo> = {
  variant: {
    title: 'Variant-dependent',
    body: [
      'Value resolves per variant.',
      'Candidates are keyed by variant_id; runs target one variant\'s lane.',
    ].join('\n'),
  },
  pif: {
    title: 'Product-image-dependent',
    body: [
      'This field\'s resolved value is injected into Product Image Finder',
      'identity prompts as exact-product context.',
    ].join('\n'),
  },
  component_self: {
    title: 'Component name field',
    body: [
      'Runs DEDICATED, no passengers.',
      'LLM injection: full component candidate table for this category.',
      'Output may include component_aliases and/or brand_aliases',
      '(alias metadata for matching; omit when none).',
      'After this and <component>_brand both publish, the publisher creates/updates',
      'component_identity and item_component_links for this product.',
    ].join('\n'),
  },
  component_identity_brand: {
    title: 'Component brand field',
    body: [
      'Runs DEDICATED, no passengers.',
      'LLM injection: full component candidate table to resolve the brand/maker',
      'side of identity.',
      'Output may include component_aliases and/or brand_aliases',
      '(alias metadata for matching; omit when none).',
      'Publisher waits until this AND the parent <component> are both published,',
      'then creates/updates component_identity + item_component_links.',
    ].join('\n'),
  },
  component_identity_link: {
    title: 'Component link field',
    body: [
      'Runs DEDICATED, no passengers.',
      'LLM injection: only the already-resolved component row for this product',
      '(attribute-style, not the full component table).',
      'Used as the link reference into the resolved component identity.',
    ].join('\n'),
  },
  component_attribute: {
    title: 'Component attribute',
    body: [
      'Sibling subfield of a component.',
      'LLM injection: only the already-resolved component row for this product',
      '(not the full component table).',
      'Displayed as a property column in the Component Review table.',
    ].join('\n'),
  },
};

// WHY: when a key belongs to a component, every icon related to that
// component shares the same color tint so all keys in that component family
// (self + <component>_brand + <component>_link + sibling attributes) read
// as one group at a glance. Non-component icons (variant / pif) keep the
// neutral info-blue.
const COMPONENT_TINTED_KINDS: ReadonlySet<KeyTypeIconKind> = new Set([
  'component_self',
  'component_identity_brand',
  'component_identity_link',
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
  const componentTint = componentColorClass(owningComponent);
  const ariaLabel = [
    ...kinds.map((k) => TOOLTIP_INFO_BY_KIND[k].title),
    owningComponent ? `Component: ${owningComponent}` : '',
    extraTooltip || '',
  ].filter(Boolean).join('; ');
  return (
    <Tooltip.Root delayDuration={180}>
      <Tooltip.Trigger asChild>
        <span
          tabIndex={0}
          aria-label={ariaLabel}
          className={`sf-key-type-icon-strip inline-flex items-center gap-0.5 flex-shrink-0 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-sm ${className || ''}`}
        >
          {kinds.map((kind) => {
            const Icon = ICON_BY_KIND[kind];
            const tint = componentTint && COMPONENT_TINTED_KINDS.has(kind)
              ? componentTint
              : 'sf-status-text-info';
            return <Icon key={kind} className={tint} />;
          })}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="sf-tooltip-content z-[300] max-w-sm px-3 py-2.5 text-xs leading-snug rounded shadow-lg"
          sideOffset={6}
          side="top"
        >
          <div className="sf-key-type-tooltip-body space-y-2">
            {kinds.map((kind) => {
              const info = TOOLTIP_INFO_BY_KIND[kind];
              return (
                <div key={kind} className="sf-key-type-tooltip-section">
                  <div className="font-semibold text-[12px] mb-0.5">{info.title}</div>
                  <div className="whitespace-pre-line text-[11px] opacity-90">{info.body}</div>
                </div>
              );
            })}
            {(owningComponent || extraTooltip) && (
              <div className="sf-key-type-tooltip-footer pt-1.5 mt-1.5 border-t border-current/20 text-[11px] space-y-0.5">
                {owningComponent && (
                  <div>
                    <span className="font-semibold">Component:</span>{' '}
                    <span className="font-mono">{owningComponent}</span>
                  </div>
                )}
                {extraTooltip && <div className="opacity-90">{extraTooltip}</div>}
              </div>
            )}
          </div>
          <Tooltip.Arrow className="sf-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
