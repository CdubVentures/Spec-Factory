import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { CellMode, SaveStatus, BrandFilter } from '../../../types/review.ts';

export type SortMode = 'brand' | 'recent' | 'confidence';

interface ActiveCell {
  productId: string;
  field: string;
}

function dedupeBrandTokens(brands: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of brands) {
    const brand = String(token || '').trim();
    if (!brand || seen.has(brand)) continue;
    seen.add(brand);
    result.push(brand);
  }
  return result;
}

function resolveBrandFilterMode(selectedSize: number, availableSize: number): BrandFilter['mode'] {
  if (selectedSize <= 0) return 'none';
  if (availableSize > 0 && selectedSize >= availableSize) return 'all';
  return 'custom';
}

interface ReviewState {
  activeCell: ActiveCell | null;
  drawerOpen: boolean;

  // Cell mode + inline editing
  cellMode: CellMode;
  editingValue: string;
  originalEditingValue: string;
  saveStatus: SaveStatus;

  // Brand filter
  availableBrands: string[];
  brandFilter: BrandFilter;

  // Sort
  sortMode: SortMode;

  // Existing actions
  setActiveCell: (cell: ActiveCell | null) => void;
  openDrawer: (productId: string, field: string) => void;
  closeDrawer: () => void;

  // Cell mode actions
  selectCell: (productId: string, field: string) => void;
  startEditing: (initialValue?: string) => void;
  cancelEditing: () => void;
  setEditingValue: (value: string) => void;
  commitEditing: () => void;
  setSaveStatus: (status: SaveStatus) => void;

  // Brand filter actions
  setAvailableBrands: (brands: string[]) => void;
  setBrandFilterMode: (mode: 'all' | 'none' | 'custom') => void;
  setBrandFilterSelection: (brands: string[]) => void;
  toggleBrand: (brand: string) => void;

  // Sort action
  setSortMode: (mode: SortMode) => void;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  activeCell: null,
  drawerOpen: false,

  cellMode: 'viewing',
  editingValue: '',
  originalEditingValue: '',
  saveStatus: 'idle',

  availableBrands: [],
  brandFilter: { mode: 'all', selected: new Set<string>() },

  sortMode: 'brand',

  setActiveCell: (cell) => set({ activeCell: cell }),
  openDrawer: (productId, field) => {
    set({ activeCell: { productId, field }, drawerOpen: true });
  },
  closeDrawer: () => set({ drawerOpen: false }),

  // Cell mode actions
  selectCell: (productId, field) => {
    set({
      activeCell: { productId, field },
      cellMode: 'selected',
      editingValue: '',
      originalEditingValue: '',
    });
  },
  startEditing: (initialValue = '') => {
    set({
      cellMode: 'editing',
      editingValue: initialValue,
      originalEditingValue: initialValue,
      saveStatus: 'idle',
    });
  },
  cancelEditing: () => {
    set({ cellMode: 'selected', editingValue: '', originalEditingValue: '', saveStatus: 'idle' });
  },
  setEditingValue: (value) => {
    const { originalEditingValue } = get();
    if (value !== originalEditingValue) {
      set({ editingValue: value, saveStatus: 'unsaved' });
      return;
    }
    set({ editingValue: value, saveStatus: 'idle' });
  },
  commitEditing: () => {
    set({ cellMode: 'viewing', saveStatus: 'idle' });
  },
  setSaveStatus: (status) => set({ saveStatus: status }),

  // Brand filter actions
  setAvailableBrands: (brands) => {
    const deduped = dedupeBrandTokens(brands);
    const availableSet = new Set(deduped);
    const { brandFilter } = get();

    if (brandFilter.mode === 'all') {
      set({
        availableBrands: deduped,
        brandFilter: { mode: 'all', selected: new Set(deduped) },
      });
      return;
    }
    if (brandFilter.mode === 'none') {
      set({
        availableBrands: deduped,
        brandFilter: { mode: 'none', selected: new Set<string>() },
      });
      return;
    }

    const nextSelected = new Set(
      Array.from(brandFilter.selected).filter((brand) => availableSet.has(brand)),
    );
    const mode = resolveBrandFilterMode(nextSelected.size, deduped.length);
    set({
      availableBrands: deduped,
      brandFilter: {
        mode,
        selected: mode === 'all' ? new Set(deduped) : nextSelected,
      },
    });
  },
  setBrandFilterMode: (mode) => {
    const { availableBrands } = get();
    if (mode === 'all') {
      set({ brandFilter: { mode: 'all', selected: new Set(availableBrands) } });
      return;
    }
    if (mode === 'none') {
      set({ brandFilter: { mode: 'none', selected: new Set<string>() } });
      return;
    }
    set((state) => ({ brandFilter: { ...state.brandFilter, mode: 'custom' } }));
  },
  setBrandFilterSelection: (brands) => {
    const deduped = dedupeBrandTokens(brands);
    const { availableBrands } = get();
    if (availableBrands.length === 0) {
      const nextSelected = new Set(deduped);
      const mode = nextSelected.size === 0 ? 'none' : 'custom';
      set({ brandFilter: { mode, selected: nextSelected } });
      return;
    }
    const availableSet = new Set(availableBrands);
    const nextSelected = new Set(deduped.filter((brand) => availableSet.has(brand)));
    const mode = resolveBrandFilterMode(nextSelected.size, availableBrands.length);
    set({
      brandFilter: {
        mode,
        selected: mode === 'all' ? new Set(availableBrands) : nextSelected,
      },
    });
  },
  toggleBrand: (brand) => {
    const { brandFilter, availableBrands } = get();
    const next = new Set(brandFilter.selected);
    if (next.has(brand)) {
      next.delete(brand);
    } else {
      next.add(brand);
    }
    const mode = resolveBrandFilterMode(next.size, availableBrands.length);
    set({
      brandFilter: {
        mode,
        selected: mode === 'all' ? new Set(availableBrands) : next,
      },
    });
  },

  // Sort action
  setSortMode: (mode) => set({ sortMode: mode }),
}));

// WHY: selectedField and selectedProductId are derived from activeCell, not stored.
export function selectSelectedField(state: ReviewState): string {
  return state.activeCell?.field ?? '';
}
export function selectSelectedProductId(state: ReviewState): string {
  return state.activeCell?.productId ?? '';
}

// ── Focused state selectors (each subscribes to ONE field) ──
export const useActiveCell = () => useReviewStore((s) => s.activeCell);
export const useDrawerOpen = () => useReviewStore((s) => s.drawerOpen);
export const useCellMode = () => useReviewStore((s) => s.cellMode);
export const useEditingValue = () => useReviewStore((s) => s.editingValue);
export const useOriginalEditingValue = () => useReviewStore((s) => s.originalEditingValue);
export const useSaveStatus = () => useReviewStore((s) => s.saveStatus);
export const useBrandFilter = () => useReviewStore((s) => s.brandFilter);
export const useSortMode = () => useReviewStore((s) => s.sortMode);

// ── Actions (stable refs, grouped with useShallow to prevent object identity re-renders) ──
export const useReviewActions = () => useReviewStore(useShallow((s) => ({
  openDrawer: s.openDrawer,
  closeDrawer: s.closeDrawer,
  selectCell: s.selectCell,
  startEditing: s.startEditing,
  cancelEditing: s.cancelEditing,
  setEditingValue: s.setEditingValue,
  commitEditing: s.commitEditing,
  setSaveStatus: s.setSaveStatus,
  setAvailableBrands: s.setAvailableBrands,
  setBrandFilterMode: s.setBrandFilterMode,
  setBrandFilterSelection: s.setBrandFilterSelection,
  setSortMode: s.setSortMode,
  toggleBrand: s.toggleBrand,
})));
