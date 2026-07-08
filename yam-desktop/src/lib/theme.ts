import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ThemeStore {
  theme: Theme;
  toggle: () => void;
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'light',
      toggle: () => set((state) => ({
        theme: state.theme === 'light' ? 'dark' : 'light',
      })),
    }),
    { name: 'yam-theme' }
  )
);
