// WHY: Reusable drawer toggle for Discovery History across all finder modules.
// One instance per app — panels trigger openDrawer({ finderId, productId, ...})
// and the shared <DiscoveryHistoryDrawer /> subscribes.

import { create } from 'zustand';

interface DiscoveryHistoryStoreState {
  open: boolean;
  finderId: string | null;
  productId: string | null;
  category: string | null;
  /** Optional allow-list restricting `byFieldKey` buckets (used by keyFinder
   *  group-history to narrow the drawer to one group's keys). Null/undefined
   *  means "show everything". Mutable after open — panels call setFieldKeyFilter
   *  when the group's membership changes so the drawer stays live. */
  fieldKeyFilter: ReadonlyArray<string> | null;
  openDrawer: (args: {
    finderId: string;
    productId: string;
    category: string;
    fieldKeyFilter?: ReadonlyArray<string> | null;
  }) => void;
  setFieldKeyFilter: (filter: ReadonlyArray<string> | null) => void;
  closeDrawer: () => void;
}

export const useFinderDiscoveryHistoryStore = create<DiscoveryHistoryStoreState>((set) => ({
  open: false,
  finderId: null,
  productId: null,
  category: null,
  fieldKeyFilter: null,
  openDrawer: ({ finderId, productId, category, fieldKeyFilter = null }) =>
    set({ open: true, finderId, productId, category, fieldKeyFilter }),
  setFieldKeyFilter: (fieldKeyFilter) => set({ fieldKeyFilter }),
  closeDrawer: () => set({ open: false, fieldKeyFilter: null }),
}));
