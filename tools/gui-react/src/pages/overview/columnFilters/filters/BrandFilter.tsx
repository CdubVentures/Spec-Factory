import { useMemo } from 'react';
import type { CatalogRow } from '../../../../types/product.ts';
import {
  useColumnFilterStore,
  selectFilterState,
} from '../columnFilterStore.ts';
import './FilterControls.css';

export interface BrandFilterProps {
  readonly category: string;
  readonly catalog: readonly CatalogRow[];
}

export function BrandFilter({ category, catalog }: BrandFilterProps) {
  const filterState = useColumnFilterStore(selectFilterState(category));
  const patch = useColumnFilterStore((s) => s.patch);
  const selected = filterState.brand;

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const r of catalog) if (r.brand) set.add(r.brand);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  const toggleBrand = (brand: string) => {
    const next = selected.includes(brand)
      ? selected.filter((b) => b !== brand)
      : [...selected, brand];
    patch(category, 'brand', next);
  };

  const selectAll = () => patch(category, 'brand', brands);
  const selectNone = () => patch(category, 'brand', []);

  if (brands.length === 0) {
    return <div className="sf-fc-empty">No brands in catalog.</div>;
  }

  return (
    <div className="sf-fc-section">
      <div className="sf-fc-row sf-fc-row--gap">
        <button type="button" className="sf-fc-link" onClick={selectAll}>
          Select all
        </button>
        <button type="button" className="sf-fc-link" onClick={selectNone}>
          Select none
        </button>
      </div>
      <div className="sf-fc-checklist">
        {brands.map((brand) => (
          <label key={brand} className="sf-fc-check-row">
            <input
              type="checkbox"
              checked={selected.includes(brand)}
              onChange={() => toggleBrand(brand)}
            />
            <span>{brand}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
