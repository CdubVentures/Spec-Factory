import { useReviewStore } from '../../stores/reviewStore';
import type { ProductReviewPayload } from '../../types/review';

interface BrandFilterBarProps {
  brands: string[];
  products: ProductReviewPayload[];
}

export function BrandFilterBar({ brands, products }: BrandFilterBarProps) {
  const { brandFilter, setBrandFilterMode, toggleBrand } = useReviewStore();

  // Count products per brand
  const brandCounts = new Map<string, number>();
  for (const p of products) {
    const b = (p.identity?.brand || '').trim();
    if (b) brandCounts.set(b, (brandCounts.get(b) || 0) + 1);
  }

  const isAllSelected = brandFilter.mode === 'all';
  const isNoneSelected = brandFilter.mode === 'none';

  return (
    <div className="sf-review-brand-filter-bar flex items-center gap-1.5 py-1 px-1 rounded overflow-x-auto">
      <button
        onClick={() => setBrandFilterMode('all')}
        className={`sf-review-brand-filter-toggle shrink-0 px-2 py-0.5 text-[10px] rounded border ${
          isAllSelected
            ? 'sf-review-brand-filter-toggle-active'
            : 'sf-review-brand-filter-toggle-inactive'
        }`}
      >
        All
      </button>
      <button
        onClick={() => setBrandFilterMode('none')}
        className={`sf-review-brand-filter-toggle shrink-0 px-2 py-0.5 text-[10px] rounded border ${
          isNoneSelected
            ? 'sf-review-brand-filter-toggle-active'
            : 'sf-review-brand-filter-toggle-inactive'
        }`}
      >
        None
      </button>
      <div className="sf-review-brand-filter-separator w-px h-4 shrink-0" />
      {brands.map((brand) => {
        const active = brandFilter.mode === 'all' || brandFilter.selected.has(brand);
        const count = brandCounts.get(brand) || 0;
        return (
          <button
            key={brand}
            onClick={() => toggleBrand(brand)}
            className={`sf-review-brand-filter-brand shrink-0 px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
              active
                ? 'sf-review-brand-filter-brand-active'
                : 'sf-review-brand-filter-brand-inactive'
            }`}
          >
            {brand} <span className="opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
