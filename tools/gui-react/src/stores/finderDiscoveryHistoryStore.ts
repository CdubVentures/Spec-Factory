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
  /** Optional single variant_id to pre-select in the drawer's variant filter
   *  dropdown. Used by the per-variant "Hist" button in the RDF/SKU panels to
   *  open the drawer scoped to one variant. */
  variantIdFilter: string | null;
  openDrawer: (args: {
    finderId: string;
    productId: string;
    category: string;
    fieldKeyFilter?: ReadonlyArray<string> | null;
    variantIdFilter?: string | null;
  }) => void;
  setFieldKeyFilter: (filter: ReadonlyArray<string> | null) => void;
  setVariantIdFilter: (variantId: string | null) => void;
  closeDrawer: () => void;
}

export const useFinderDiscoveryHistoryStore = create<DiscoveryHistoryStoreState>((set) => ({
  open: false,
  finderId: null,
  productId: null,
  category: null,
  fieldKeyFilter: null,
  variantIdFilter: null,
  openDrawer: ({ finderId, productId, category, fieldKeyFilter = null, variantIdFilter = null }) =>
    set({ open: true, finderId, productId, category, fieldKeyFilter, variantIdFilter }),
  setFieldKeyFilter: (fieldKeyFilter) => set({ fieldKeyFilter }),
  setVariantIdFilter: (variantIdFilter) => set({ variantIdFilter }),
  closeDrawer: () => set({ open: false, fieldKeyFilter: null, variantIdFilter: null }),
}));
