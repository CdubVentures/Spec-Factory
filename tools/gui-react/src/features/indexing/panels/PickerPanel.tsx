import { forwardRef, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { IndexingPanelHeader, type IndexingPanelId } from '../../../shared/ui/finder/IndexingPanelHeader.tsx';
import { HeaderActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { AmbiguityMeter } from '../../../shared/ui/data-display/AmbiguityMeter.tsx';
import { DrillColumn } from '../../../shared/ui/forms/DrillColumn.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { useSlashFocus } from './useSlashFocus.ts';
import { deriveStaleSelection } from '../selectors/staleSelection.ts';
import { deriveFilteredCatalog } from '../selectors/filteredCatalog.ts';
import { displayVariant } from '../indexingHelpers.ts';
import type { CatalogRow } from '../../../types/product.ts';
import type { PickerRecentSelection } from '../state/indexlabStore.ts';
import type { SelectedAmbiguityMeter } from '../selectors/indexingCatalogSelectors.ts';
import './PickerPanel.css';

interface PickerPanelProps {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly busy: boolean;
  readonly catalogRows: CatalogRow[];
  readonly singleBrand: string;
  readonly onBrandChange: (brand: string) => void;
  readonly singleModel: string;
  readonly onModelChange: (model: string) => void;
  readonly singleProductId: string;
  readonly onProductIdChange: (productId: string) => void;
  readonly selectedCatalogProduct: CatalogRow | null;
  readonly selectedAmbiguityMeter: SelectedAmbiguityMeter;
  readonly recentSelections: PickerRecentSelection[];
  readonly onPushRecent: (entry: PickerRecentSelection) => void;
  /** Panel whose accent color the picker rail + icon chip should mirror. */
  readonly linkedPanel: IndexingPanelId;
  /** True while the catalog query is on its first fetch — suppresses the
   *  stale-state styling so we don't flash a red banner before the catalog
   *  has actually resolved. */
  readonly catalogLoading: boolean;
}

export function PickerPanel({
  collapsed,
  onToggle,
  busy,
  catalogRows,
  singleBrand,
  onBrandChange,
  singleModel,
  onModelChange,
  singleProductId,
  onProductIdChange,
  selectedCatalogProduct,
  selectedAmbiguityMeter,
  recentSelections,
  onPushRecent,
  linkedPanel,
  catalogLoading,
}: PickerPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchInputRef);

  // WHY: stale only has meaning AFTER the catalog has finished loading at
  // least once. Before that, selectedCatalogProduct is always null even
  // though the product may be perfectly valid — evaluating staleness
  // early flashes a red "NOT IN CATALOG" state during tab switches.
  const rawStale = useMemo(
    () => deriveStaleSelection({ singleProductId, selectedCatalogProduct }),
    [singleProductId, selectedCatalogProduct],
  );
  const stale = catalogLoading
    ? { isStale: false, lastKnownId: '' }
    : rawStale;
  const filtered = useMemo(
    () => deriveFilteredCatalog({ catalogRows, singleBrand, singleModel, searchQuery }),
    [catalogRows, singleBrand, singleModel, searchQuery],
  );

  const activeStep: 1 | 2 | 3 = !singleBrand ? 1 : !singleModel ? 2 : 3;

  const handleBrandPick = (brand: string) => {
    if (busy) return;
    onBrandChange(brand);
  };
  const handleModelPick = (model: string) => {
    if (busy) return;
    onModelChange(model);
  };
  const handleVariantPick = (productId: string) => {
    if (busy) return;
    onProductIdChange(productId);
    const row = catalogRows.find((r) => r.productId === productId);
    if (row) {
      onPushRecent({
        productId: row.productId,
        brand: row.brand,
        model: row.base_model,
        variant: row.variant,
        at: Date.now(),
      });
    }
  };
  const handleRecentPick = (entry: PickerRecentSelection) => {
    if (busy) return;
    onBrandChange(entry.brand);
    onModelChange(entry.model);
    onProductIdChange(entry.productId);
    onPushRecent({ ...entry, at: Date.now() });
  };
  const handleClear = () => {
    if (busy) return;
    onBrandChange('');
  };

  const outerClass = `sf-surface-panel sf-picker-panel sf-picker-order p-0 flex flex-col${stale.isStale ? ' sf-picker-stale' : ''}`;
  const headerPanelId: IndexingPanelId = stale.isStale ? 'picker' : linkedPanel;
  const subtitleSlot = renderSubtitle({ stale, busy });
  const actionSlot = renderActions({ stale, hasSelection: Boolean(selectedCatalogProduct), onClear: handleClear, onClearStale: () => onProductIdChange(''), busy });
  const variantLabel = selectedCatalogProduct ? displayVariant(String(selectedCatalogProduct.variant || '')) : '';

  return (
    <div className={outerClass} data-panel={headerPanelId}>
      <IndexingPanelHeader
        panel={headerPanelId}
        icon="◎"
        title="Product Picker"
        tip="Pick one exact product. Run and inspect runs from the Pipeline panel below."
        collapsed={collapsed}
        onToggle={onToggle}
        isRunning={busy}
        subtitleSlot={subtitleSlot}
        actionSlot={actionSlot}
      />
      {!collapsed ? (
        <div className="sf-picker-body">
          <SelectionRow
            brand={singleBrand}
            model={singleModel}
            variantLabel={variantLabel}
            hasProduct={Boolean(selectedCatalogProduct)}
          />
          {catalogLoading ? (
            <div className="sf-picker-loading" role="status" aria-live="polite">
              <Spinner />
              <span>Loading catalog…</span>
            </div>
          ) : (
            <>
              <SearchBar
                ref={searchInputRef}
                value={searchQuery}
                onChange={setSearchQuery}
                totalMatches={filtered.totalMatches}
                disabled={busy}
              />
              <div className="sf-picker-drill">
                <DrillColumn
                  step={1}
                  label="Brand"
                  status={singleBrand ? 'done' : (activeStep === 1 ? 'active' : 'pending')}
                  items={filtered.brandList}
                  selectedValue={singleBrand}
                  onSelect={handleBrandPick}
                  disabled={busy}
                  emptyHint={searchQuery ? 'no brands match' : 'no brands'}
                  totalHeaderCount={filtered.brandList.length}
                />
                <DrillColumn
                  step={2}
                  label="Model"
                  status={singleModel ? 'done' : (activeStep === 2 ? 'active' : 'pending')}
                  items={filtered.modelList}
                  selectedValue={singleModel}
                  onSelect={handleModelPick}
                  disabled={busy || !singleBrand}
                  emptyHint={!singleBrand ? 'pick a brand first' : 'no models match'}
                  totalHeaderCount={filtered.modelList.length}
                />
                <DrillColumn
                  step={3}
                  label="Variant"
                  status={singleProductId ? 'done' : (activeStep === 3 ? 'active' : 'pending')}
                  items={filtered.variantList}
                  selectedValue={singleProductId}
                  onSelect={handleVariantPick}
                  disabled={busy || !singleModel}
                  emptyHint={!singleModel ? 'pick a model first' : 'no variants match'}
                  totalHeaderCount={filtered.variantList.length}
                />
              </div>

              {stale.isStale ? (
                <StaleNotice lastKnownId={stale.lastKnownId} onClear={() => onProductIdChange('')} />
              ) : selectedAmbiguityMeter.level !== 'unknown' ? (
                <AmbiguityMeter
                  level={selectedAmbiguityMeter.level}
                  familyCount={selectedAmbiguityMeter.count}
                />
              ) : !selectedCatalogProduct ? (
                <EmptyHero hasBrandPicked={Boolean(singleBrand)} hasModelPicked={Boolean(singleModel)} />
              ) : null}

              {recentSelections.length > 0 ? (
                <RecentsRail entries={recentSelections} currentProductId={singleProductId} onPick={handleRecentPick} disabled={busy} />
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────

function renderSubtitle({
  stale,
  busy,
}: {
  stale: { isStale: boolean; lastKnownId: string };
  busy: boolean;
}) {
  if (stale.isStale) {
    return (
      <span className="sf-picker-subtitle sf-picker-subtitle-stale">
        <span className="sf-picker-stale-pill">Not in catalog</span>
      </span>
    );
  }
  if (busy) {
    return (
      <span className="sf-picker-subtitle sf-picker-subtitle-empty">— running…</span>
    );
  }
  return null;
}

interface SelectionRowProps {
  readonly brand: string;
  readonly model: string;
  readonly variantLabel: string;
  readonly hasProduct: boolean;
}

function SelectionRow({ brand, model, variantLabel, hasProduct }: SelectionRowProps) {
  return (
    <div className="sf-picker-selection-row" role="status" aria-label="Current selection">
      <SelectionSlot label="Brand" value={brand} filled={Boolean(brand)} />
      <SelectionSlot label="Model" value={model} filled={Boolean(model)} />
      <SelectionSlot label="Variant" value={variantLabel} filled={hasProduct && Boolean(variantLabel)} />
    </div>
  );
}

function SelectionSlot({ label, value, filled }: { label: string; value: string; filled: boolean }) {
  return (
    <div className={`sf-picker-slot${filled ? ' sf-picker-slot-filled' : ''}`}>
      <div className="sf-picker-slot-label">{label}</div>
      <div className="sf-picker-slot-value">
        {filled ? value : <span className="sf-picker-slot-placeholder">— not picked —</span>}
      </div>
    </div>
  );
}

function renderActions({
  stale,
  hasSelection,
  onClear,
  onClearStale,
  busy,
}: {
  stale: { isStale: boolean };
  hasSelection: boolean;
  onClear: () => void;
  onClearStale: () => void;
  busy: boolean;
}) {
  if (stale.isStale) {
    return (
      <HeaderActionButton
        intent="delete"
        label="Clear stale"
        onClick={onClearStale}
        width={ACTION_BUTTON_WIDTH.standardHeader}
      />
    );
  }
  if (!hasSelection) return null;
  return (
    <HeaderActionButton
      intent="neutral"
      label="Clear"
      onClick={onClear}
      disabled={busy}
      width={ACTION_BUTTON_WIDTH.standardHeader}
    />
  );
}

interface SearchBarProps {
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly totalMatches: number;
  readonly disabled?: boolean;
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onChange, totalMatches, disabled },
  ref,
) {
  return (
    <div className="sf-picker-search">
      <div className="sf-picker-search-row">
        <span className="sf-picker-search-icon" aria-hidden="true">🔍</span>
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          placeholder="Find a product — brand, model, variant, or product_id"
          className="sf-picker-search-input"
          disabled={disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
        />
        <kbd className="sf-picker-search-kbd" aria-hidden="true">/</kbd>
      </div>
      {value.trim() ? (
        <div className="sf-picker-search-hint" aria-live="polite">
          <b>{totalMatches}</b> {totalMatches === 1 ? 'product matches' : 'products match'}
        </div>
      ) : null}
    </div>
  );
});

function EmptyHero({ hasBrandPicked, hasModelPicked }: { hasBrandPicked: boolean; hasModelPicked: boolean }) {
  const status = !hasBrandPicked ? 'Pick a brand to begin.' : !hasModelPicked ? 'Pick a model next.' : 'Pick a variant to finish.';
  return (
    <div className="sf-picker-empty-hero">
      <div className="sf-picker-empty-icon" aria-hidden="true">◎</div>
      <h4>Pick a product to run indexing</h4>
      <p>Start typing above, or browse the catalog by brand. {status}</p>
    </div>
  );
}

function StaleNotice({ lastKnownId, onClear }: { lastKnownId: string; onClear: () => void }) {
  return (
    <div className="sf-picker-stale-notice">
      <div className="sf-picker-stale-head">Selected product not in catalog</div>
      <div className="sf-picker-stale-body">
        The product <code>{lastKnownId}</code> was picked before but is no longer in the catalog. It may have been renamed, merged, or removed.
      </div>
      <button type="button" className="sf-picker-btn sf-picker-btn-danger" onClick={onClear}>
        Clear stale selection
      </button>
    </div>
  );
}

function RecentsRail({
  entries,
  currentProductId,
  onPick,
  disabled,
}: {
  entries: PickerRecentSelection[];
  currentProductId: string;
  onPick: (entry: PickerRecentSelection) => void;
  disabled?: boolean;
}) {
  return (
    <div className="sf-picker-recents">
      <span className="sf-picker-recents-label">Recent</span>
      {entries.map((entry) => {
        const variantLabel = displayVariant(entry.variant);
        const isCurrent = entry.productId === currentProductId;
        return (
          <button
            key={entry.productId}
            type="button"
            className={`sf-picker-recent-chip${isCurrent ? ' sf-picker-recent-current' : ''}`}
            onClick={() => onPick(entry)}
            disabled={disabled}
            title={entry.productId}
          >
            <span className="sf-picker-recent-brand">{entry.brand}</span>
            <span>{entry.model} · {variantLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

