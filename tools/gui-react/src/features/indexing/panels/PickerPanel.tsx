import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { formatNumber } from '../helpers.tsx';
import type { CatalogRow } from '../../../types/product.ts';
import type { LlmKeyGateError } from '../../../hooks/llmKeyGateHelpers.js';

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
  processRunning: boolean;
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
  runtimeSettingsReady: boolean;
  canRunSingle: boolean;
  onRunIndexLab: () => void;
  stopForceKill: boolean;
  onStopForceKillChange: (value: boolean) => void;
  onStopProcess: (opts: { force: boolean }) => void;
  stopPending: boolean;
  selectedIndexLabRunId: string;
  onClearSelectedRunView: () => void;
  onReplaySelectedRunView: () => void;
  llmKeyGateErrors: LlmKeyGateError[];
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
  processRunning,
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
  runtimeSettingsReady,
  canRunSingle,
  onRunIndexLab,
  stopForceKill,
  onStopForceKillChange,
  onStopProcess,
  stopPending,
  selectedIndexLabRunId,
  onClearSelectedRunView,
  onReplaySelectedRunView,
  llmKeyGateErrors,
}: PickerPanelProps) {
  const hasKeyGateBlock = llmKeyGateErrors.length > 0;
  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: -20 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center text-sm font-semibold sf-text-primary">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-5 h-5 mr-1 sf-text-caption sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span>Product Picker</span>
          <Tip text="Pick one exact product, then run IndexLab." />
        </div>
      </div>
      {!collapsed ? (
        <>
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
          {hasKeyGateBlock && (
            <div className="sf-callout sf-callout-danger px-3 py-2 sf-text-caption">
              <span className="font-semibold">Missing API Keys</span>
              <span> — {llmKeyGateErrors.map((e) => e.label).join(', ')}. Configure keys in the LLM settings tab.</span>
            </div>
          )}
          <button
            onClick={onRunIndexLab}
            disabled={!canRunSingle || busy || processRunning || !runtimeSettingsReady || hasKeyGateBlock}
            className={`w-full px-3 py-2 text-sm rounded sf-primary-button transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed ${
              processRunning
                ? 'translate-y-px scale-[0.99] shadow-inner'
                : 'shadow-sm hover:shadow active:translate-y-px active:scale-[0.99] active:shadow-inner'
            }`}
            title={hasKeyGateBlock
              ? 'Run blocked — LLM API keys are missing.'
              : runtimeSettingsReady
                ? 'Run IndexLab for selected product and stream events.'
                : 'Run start is locked until shared pipeline settings finish hydrating.'}
          >
            Run IndexLab
          </button>
          <div className="grid grid-cols-1 md:grid-cols-3 items-start gap-2">
            <div className="space-y-1">
              <button
                onClick={() => onStopProcess({ force: stopForceKill })}
                disabled={stopPending}
                className="w-full h-10 inline-flex items-center justify-center px-3 text-sm rounded sf-danger-button-solid shadow-sm hover:shadow active:translate-y-px active:scale-[0.99] active:shadow-inner transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
                title={stopForceKill ? 'Force kill process tree if needed.' : 'Graceful stop request.'}
              >
                Stop Process
              </button>
              <label className="inline-flex items-center gap-2 sf-text-label sf-text-muted">
                <input
                  type="checkbox"
                  checked={stopForceKill}
                  onChange={(e) => onStopForceKillChange(e.target.checked)}
                  disabled={stopPending}
                />
                force kill (hard stop)
                <Tip text="When enabled, Stop Process uses forced kill behavior if graceful stop hangs." />
              </label>
            </div>
            <button
              onClick={onClearSelectedRunView}
              disabled={busy || !selectedIndexLabRunId}
              className="w-full h-10 self-start inline-flex items-center justify-center px-3 text-sm rounded sf-icon-button shadow-sm hover:shadow active:translate-y-px active:scale-[0.99] active:shadow-inner transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Clear only selected run containers from the current view."
            >
              Clear Selected View
            </button>
            <button
              onClick={onReplaySelectedRunView}
              disabled={busy || !selectedIndexLabRunId}
              className="w-full h-10 self-start inline-flex items-center justify-center px-3 text-sm rounded sf-icon-button shadow-sm hover:shadow active:translate-y-px active:scale-[0.99] active:shadow-inner transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Replay selected run from persisted events/artifacts."
            >
              Replay Selected Run
            </button>
          </div>
          {!runtimeSettingsReady ? (
            <div className="sf-text-label sf-status-text-warning">
              Pipeline settings are loading. Run start is locked until persisted settings hydrate.
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
