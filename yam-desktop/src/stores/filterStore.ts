import { create } from 'zustand';

interface FilterState {
  searchQuery: string;
  selectedLevels: string[];
  setSearchQuery: (query: string) => void;
  toggleLevel: (level: string) => void;
  resetFilters: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  searchQuery: '',
  selectedLevels: [],
  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleLevel: (level) => set((state) => {
    const isSelected = state.selectedLevels.includes(level);
    return {
      selectedLevels: isSelected
        ? state.selectedLevels.filter((l) => l !== level)
        : [...state.selectedLevels, level],
    };
  }),
  resetFilters: () => set({ searchQuery: '', selectedLevels: [] }),
}));