import { create } from 'zustand';

// WHY: selectedBrand and selectedModel are display-label caches, not canonical state.
// They travel with selectedProductId so the Sidebar can restore its brand/model
// dropdowns without re-querying the catalog. This is intentional UI cache.
interface ProductState {
  selectedProductId: string;
  selectedBrand: string;
  selectedModel: string;
  setSelectedProduct: (productId: string, brand?: string, model?: string) => void;
}

export const useProductStore = create<ProductState>((set) => ({
  selectedProductId: '',
  selectedBrand: '',
  selectedModel: '',
  setSelectedProduct: (productId, brand = '', model = '') =>
    set({ selectedProductId: productId, selectedBrand: brand, selectedModel: model }),
}));
