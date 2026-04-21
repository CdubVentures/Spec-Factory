import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { formatNumber } from '../helpers.tsx';
import type { CatalogRow } from '../../../types/product.ts';

interface AmbiguityMeterShape {
  count: number;
  level: string;
  label: string;
  badgeCls: string;
  barCls: string;
  widthPct: number;
}

interface VariantOption {
  productId: string;
  label: string;
}

interface PickerPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  busy: boolean;
  singleBrand: string;
  onBrandChange: (brand: string) => void;
  singleModel: string;
  onModelChange: (model: string) => void;
  singleProductId: string;
  onProductIdChange: (productId: string) => void;
  brandOptions: string[];
  modelOptions: string[];
  variantOptions: VariantOption[];
  selectedCatalogProduct: CatalogRow | null;
  displayVariant: (variant: string) => string;
  selectedAmbiguityMeter: AmbiguityMeterShape;
}

function resolveAmbiguityToken(level: string): 'success' | 'warning' | 'danger' | 'neutral' {
  const normalized = (level || '').toLowerCase().replace(/[_\s]+/g, '-');
  if (normalized === 'easy') return 'success';
  if (normalized === 'medium') return 'warning';
  if (normalized === 'hard' || normalized === 'very-hard' || normalized === 'extra-hard') return 'danger';
  return 'neutral';
}

function ambiguityBadgeClass(level: string): string {
  const token = resolveAmbiguityToken(level);
  if (token === 'success') return 'sf-chip-success';
  if (token === 'warning') return 'sf-chip-warning';
  if (token === 'danger') return 'sf-chip-danger';
  return 'sf-chip-neutral';
}

function ambiguityBarColor(level: string): string {
  const token = resolveAmbiguityToken(level);
  if (token === 'success') return 'var(--sf-state-success-fg)';
  if (token === 'warning') return 'var(--sf-state-warning-fg)';
  if (token === 'danger') return 'var(--sf-state-danger-fg)';
  return 'rgb(var(--sf-color-text-muted-rgb))';
}

export function PickerPanel({
  collapsed,
  onToggle,
  busy,
  singleBrand,
  onBrandChange,
  singleModel,
  onModelChange,
  singleProductId,
  onProductIdChange,
  brandOptions,
  modelOptions,
  variantOptions,
  selectedCatalogProduct,
  displayVariant,
  selectedAmbiguityMeter,
}: PickerPanelProps) {
  return (
    <div className="sf-surface-panel p-0" style={{ order: -20 }}>
      <div className={`flex items-center gap-2.5 px-6 pt-4 ${collapsed ? 'pb-3' : 'pb-0'}`}>
        <button
          onClick={onToggle}
          className="inline-flex items-center justify-center w-5 h-5 sf-text-caption sf-icon-button"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '+' : '-'}
        </button>
        <span className="text-[15px] font-bold sf-text-primary">Product Picker</span>
        <Tip text="Pick one exact product. Run and inspect runs from the Pipeline panel below." />
      </div>
      {!collapsed ? (
        <div className="px-6 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={singleBrand}
              onChange={(e) => {
                onBrandChange(e.target.value);
              }}
              disabled={busy}
              className="px-2 py-2 text-sm rounded sf-select"
              title="Step 1: Choose brand."
            >
              <option value="">1) select brand</option>
              {brandOptions.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <select
              value={singleModel}
              onChange={(e) => {
                onModelChange(e.target.value);
              }}
              disabled={busy || !singleBrand}
              className="px-2 py-2 text-sm rounded sf-select"
              title="Step 2: Choose model."
            >
              <option value="">2) select model</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <select
              value={singleProductId}
              onChange={(e) => onProductIdChange(e.target.value)}
              disabled={busy || !singleModel || variantOptions.length <= 1}
              className="px-2 py-2 text-sm rounded sf-select"
              title="Step 3: Choose variant."
            >
              <option value="">{variantOptions.length <= 1 ? '(auto)' : '3) select variant'}</option>
              {variantOptions.map((option) => (
                <option key={option.productId} value={option.productId}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sf-surface-elevated p-2 sf-text-caption sf-text-muted">
            selected product id: <span className="font-mono">{singleProductId || '(none)'}</span>
            {selectedCatalogProduct ? (
              <span>
                {' '}| {selectedCatalogProduct.brand} {selectedCatalogProduct.base_model} {displayVariant(selectedCatalogProduct.variant || '')}
              </span>
            ) : null}
          </div>
          <div className="sf-surface-elevated p-2">
            <div className="flex flex-wrap items-center gap-2 sf-text-caption">
              <span className="font-semibold sf-text-primary inline-flex items-center">
                ambiguity meter
                <Tip text={`Brand + model family size in catalog:
- easy: 1 sibling (green)
- medium: 2-3 siblings (amber/yellow)
- hard: 4-5 siblings (red)
- very hard: 6-8 siblings (fuchsia)
- extra hard: 9+ siblings (purple, hardest)

Variant-empty extraction policy:
Variant-empty review hint:
- easy/medium: fewer sibling pages usually need review
- hard/very hard/extra hard: expect more sibling and variant review work`} />
              </span>
              <span className={`px-2 py-0.5 rounded ${ambiguityBadgeClass(selectedAmbiguityMeter.level)}`}>
                {selectedAmbiguityMeter.label}
              </span>
              <span className="sf-text-muted">
                family count {formatNumber(selectedAmbiguityMeter.count)}
              </span>
            </div>
            <div className="mt-2 h-2 w-full rounded sf-surface-panel overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${selectedAmbiguityMeter.widthPct}%`,
                  backgroundColor: ambiguityBarColor(selectedAmbiguityMeter.level),
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
