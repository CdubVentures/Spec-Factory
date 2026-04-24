import { create } from 'zustand';

interface SelectionState {
  readonly byCategory: Readonly<Record<string, ReadonlySet<string>>>;
  toggle(category: string, productId: string): void;
  setMany(category: string, ids: Iterable<string>): void;
  addMany(category: string, ids: Iterable<string>): void;
  clear(category: string): void;
}

const EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>()) as ReadonlySet<string>;

function nextCategoryMap(
  prev: Readonly<Record<string, ReadonlySet<string>>>,
  category: string,
  next: Set<string>,
): Readonly<Record<string, ReadonlySet<string>>> {
  if (next.size === 0) {
    if (!prev[category] || prev[category].size === 0) return prev;
    const { [category]: _drop, ...rest } = prev;
    return rest;
  }
  return { ...prev, [category]: next };
}

export const useOverviewSelectionStore = create<SelectionState>((set) => ({
  byCategory: {},
  toggle: (category, productId) =>
    set((state) => {
      const current = state.byCategory[category] ?? EMPTY_SET;
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return { byCategory: nextCategoryMap(state.byCategory, category, next) };
    }),
  setMany: (category, ids) =>
    set((state) => {
      const next = new Set<string>();
      for (const id of ids) next.add(id);
      return { byCategory: nextCategoryMap(state.byCategory, category, next) };
    }),
  addMany: (category, ids) =>
    set((state) => {
      const current = state.byCategory[category] ?? EMPTY_SET;
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return { byCategory: nextCategoryMap(state.byCategory, category, next) };
    }),
  clear: (category) =>
    set((state) => ({
      byCategory: nextCategoryMap(state.byCategory, category, new Set()),
    })),
}));

export function useSelectedSet(category: string): ReadonlySet<string> {
  return useOverviewSelectionStore((s) => s.byCategory[category] ?? EMPTY_SET);
}

export function useIsSelected(category: string, productId: string): boolean {
  return useOverviewSelectionStore((s) => (s.byCategory[category] ?? EMPTY_SET).has(productId));
}

export function useSelectionSize(category: string): number {
  return useOverviewSelectionStore((s) => (s.byCategory[category] ?? EMPTY_SET).size);
}
