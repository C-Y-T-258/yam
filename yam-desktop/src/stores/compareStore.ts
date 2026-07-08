import { create } from 'zustand';

interface CompareStore {
  selectedIds: string[];
  toggle: (id: string) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
}

export const useCompareStore = create<CompareStore>((set, get) => ({
  selectedIds: [],
  toggle: (id) => set((state) => ({
    selectedIds: state.selectedIds.includes(id)
      ? state.selectedIds.filter(i => i !== id)
      : state.selectedIds.length < 3
        ? [...state.selectedIds, id]
        : state.selectedIds,
  })),
  clear: () => set({ selectedIds: [] }),
  isSelected: (id) => get().selectedIds.includes(id),
}));