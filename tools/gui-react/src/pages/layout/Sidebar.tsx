import { useEffect, useMemo } from 'react';
import { useUiStore } from '../../stores/uiStore.ts';
import { useProductStore } from '../../stores/productStore.ts';
import { useRuntimeStore } from '../../stores/runtimeStore.ts';
import { usePersistedTab } from '../../stores/tabStore.ts';
import { useCatalogQuery } from '../../hooks/useCatalogQuery.ts';
import { Spinner } from '../../shared/ui/feedback/Spinner.tsx';
const VARIANT_PLACEHOLDERS = new Set(['unk', 'unknown', 'na', 'n/a', 'none', 'null', '']);
function cleanVariant(v: string): string {
  const s = (v ?? '').trim();
  return VARIANT_PLACEHOLDERS.has(s.toLowerCase()) ? '' : s;
}

const selectCls = 'w-full px-2 py-1.5 text-sm border rounded sf-sidebar-control text-slate-900 dark:text-slate-100';
const labelCls = 'text-xs font-medium text-slate-600 dark:text-slate-300/90';

export function Sidebar() {
  const category = useUiStore((s) => s.category);
  const categories = useUiStore((s) => s.categories);
  const setCategory = useUiStore((s) => s.setCategory);
  const selectedProductId = useProductStore((s) => s.selectedProductId);
  const setSelectedProduct = useProductStore((s) => s.setSelectedProduct);
  const processStatus = useRuntimeStore((s) => s.processStatus);


  const { data: catalog = [], isLoading: catalogLoading } = useCatalogQuery({
    category,
    refetchIntervalMs: 10_000,
  });

  // Derive unique brands (prefer inActive products first via sort)
  const brands = useMemo(() => {
    const brandSet = new Set<string>();
    // Add inActive brands first so they appear in the list
    for (const r of catalog) {
      if (r.brand) brandSet.add(r.brand);
    }
    return [...brandSet].sort();
  }, [catalog]);
  const [selectedBrand, setSelectedBrand] = usePersistedTab<string>(
    `sidebar:product:brand:${category}`,
    '',
    { validValues: brands },
  );

  // Models filtered by selected brand
  const models = useMemo(() => {
    if (!selectedBrand) return [];
    const modelSet = new Set<string>();
    for (const r of catalog) {
      if (r.brand === selectedBrand && r.base_model) modelSet.add(r.base_model);
    }
    return [...modelSet].sort();
  }, [catalog, selectedBrand]);
  const [selectedModel, setSelectedModel] = usePersistedTab<string>(
    `sidebar:product:model:${category}`,
    '',
    { validValues: models },
  );

  // Variants filtered by selected brand + model
  const variants = useMemo(() => {
    if (!selectedBrand || !selectedModel) return [];
    const varSet = new Set<string>();
    for (const r of catalog) {
      if (r.brand === selectedBrand && r.base_model === selectedModel) {
        const v = cleanVariant(r.variant);
        if (v) varSet.add(v);
      }
    }
    return [...varSet].sort();
  }, [catalog, selectedBrand, selectedModel]);
  const [selectedVariant, setSelectedVariant] = usePersistedTab<string>(
    `sidebar:product:variant:${category}`,
    '',
    { validValues: variants },
  );

  // WHY: Persist productId directly so selection survives identity renames.
  // Brand/model/variant dropdowns are navigation UI; productId is the stable anchor.
  const [persistedPid, setPersistedPid] = usePersistedTab<string>(
    `sidebar:product:pid:${category}`,
    '',
  );

  // Auto-select productId when brand+model are chosen, or restore from persisted pid
  useEffect(() => {
    // WHY: ProductId is the stable anchor. Always check it first, regardless of
    // brand/model state. If the product exists in the catalog, sync dropdowns from it.
    if (persistedPid) {
      const entry = catalog.find((r) => r.productId === persistedPid);
      if (entry) {
        if (entry.brand !== selectedBrand) setSelectedBrand(entry.brand);
        if (entry.base_model !== selectedModel) setSelectedModel(entry.base_model);
        const ev = cleanVariant(entry.variant);
        if (ev && ev !== selectedVariant) setSelectedVariant(ev);
        setSelectedProduct(entry.productId, entry.brand, entry.base_model, cleanVariant(entry.variant));
        return;
      }
    }
    if (!selectedBrand || !selectedModel) {
      if (selectedProductId) setSelectedProduct('');
      return;
    }
    const match = catalog.find((r) =>
      r.brand === selectedBrand &&
      r.base_model === selectedModel &&
      (variants.length === 0 || !selectedVariant || cleanVariant(r.variant) === selectedVariant)
    );
    if (match) {
      setSelectedProduct(match.productId, match.brand, match.base_model, cleanVariant(match.variant));
      setPersistedPid(match.productId);
    } else if (selectedProductId) {
      setSelectedProduct('');
    }
  }, [selectedBrand, selectedModel, selectedVariant, catalog, variants.length]);

  // Sync store → local when Overview row click updates productStore
  const storeBrand = useProductStore((s) => s.selectedBrand);
  const storeModel = useProductStore((s) => s.selectedModel);
  const storeVariant = useProductStore((s) => s.selectedVariant);

  useEffect(() => {
    if (storeBrand && brands.includes(storeBrand) && storeBrand !== selectedBrand) {
      setSelectedBrand(storeBrand);
    }
    if (storeModel && models.includes(storeModel) && storeModel !== selectedModel) {
      setSelectedModel(storeModel);
    }
    if (storeVariant && variants.includes(storeVariant) && storeVariant !== selectedVariant) {
      setSelectedVariant(storeVariant);
    }
  }, [storeBrand, storeModel, storeVariant, brands, models, variants, selectedBrand, selectedModel, selectedVariant, setSelectedBrand, setSelectedModel, setSelectedVariant]);

  // Reset model when brand changes
  function handleBrandChange(brand: string) {
    setSelectedBrand(brand);
    setSelectedModel('');
    setSelectedVariant('');
  }

  // Reset variant when model changes
  function handleModelChange(model: string) {
    setSelectedModel(model);
    setSelectedVariant('');
  }

  return (
    <aside className="sf-sidebar w-64 flex-shrink-0 p-4 space-y-4 overflow-y-auto">
      {/* Category */}
      <div>
        <h2 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Category</h2>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={selectCls}
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Cascading Product Selectors */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Product</h2>

        {catalogLoading ? (
          <Spinner className="h-4 w-4" />
        ) : (
          <>
            {/* Brand */}
            <div>
              <label className={labelCls}>Brand</label>
              <select
                value={selectedBrand}
                onChange={(e) => handleBrandChange(e.target.value)}
                className={selectCls}
              >
                <option value="">-- select brand --</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Base Model (filtered by brand) */}
            <div>
              <label className={labelCls}>Base Model</label>
              <select
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                className={selectCls}
                disabled={!selectedBrand}
              >
                <option value="">{selectedBrand ? '-- select model --' : '-- select brand first --'}</option>
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Variant (shown when variants exist for brand+model) */}
            {variants.length > 0 && (
              <div>
                <label className={labelCls}>Variant</label>
                <select
                  value={selectedVariant}
                  onChange={(e) => setSelectedVariant(e.target.value)}
                  className={selectCls}
                >
                  <option value="">-- any --</option>
                  {variants.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </div>


      <div className="border-t border-white/10 pt-3">
        {processStatus.running && (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">PID {processStatus.pid} running</p>
        )}
        {processStatus.command && !processStatus.running && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate" title={processStatus.command}>
            Last: {processStatus.command}
          </p>
        )}
      </div>
    </aside>
  );
}


