// WHY: Reusable drawer toggle for Discovery History across all finder modules.
// One instance per app — panels trigger openDrawer({ finderId, productId, ...})
// and the shared <DiscoveryHistoryDrawer /> subscribes.

import { create } from 'zustand';

interface DiscoveryHistoryStoreState {
  open: boolean;
  finderId: string | null;
  productId: string | null;
  category: string | null;
  openDrawer: (args: { finderId: string; productId: string; category: string }) => void;
  closeDrawer: () => void;
}

export const useFinderDiscoveryHistoryStore = create<DiscoveryHistoryStoreState>((set) => ({
  open: false,
  finderId: null,
  productId: null,
  category: null,
  openDrawer: ({ finderId, productId, category }) =>
    set({ open: true, finderId, productId, category }),
  closeDrawer: () => set({ open: false }),
}));
