import { create } from 'zustand';

// WHY: selectedBrand, selectedModel, selectedVariant are display-label caches, not canonical state.
// They travel with selectedProductId so the Sidebar can restore its brand/base-model/variant
// dropdowns without re-querying the catalog. This is intentional UI cache.
interface ProductState {
  selectedProductId: string;
  selectedBrand: string;
  selectedModel: string;
  selectedVariant: string;
  setSelectedProduct: (productId: string, brand?: string, model?: string, variant?: string) => void;
}

export const useProductStore = create<ProductState>((set) => ({
  selectedProductId: '',
  selectedBrand: '',
  selectedModel: '',
  selectedVariant: '',
  setSelectedProduct: (productId, brand = '', model = '', variant = '') =>
    set({ selectedProductId: productId, selectedBrand: brand, selectedModel: model, selectedVariant: variant }),
}));
