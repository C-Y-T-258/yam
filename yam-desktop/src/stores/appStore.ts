import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Page = 'welcome' | 'major-management' | 'major-select' | 'crawling' | 'data-ready' | 'workspace' | 'favorites' | 'recent';

export interface CrawledMajor {
  code: string;
  name: string;
  dataVersion?: string;
  lastUpdated?: string;
  schoolCount?: number;
  dbSize?: string;
}

export interface CrawlingProgress {
  major: string;
  school: string;
  department: string;
  year: number;
  percent: number;
  logs: Array<{ time: string; message: string }>;
  isPaused: boolean;
}

export interface CrawlTarget {
  code: string;
  name: string;
}

interface AppState {
  currentPage: Page;
  crawledMajors: CrawledMajor[];
  currentMajor: string | null;
  crawlingProgress: CrawlingProgress | null;
  visibleMajorCodes: string[];
  crawlTarget: CrawlTarget | null;
  enableProfessionalThreeLevelMenu: boolean;

  setPage: (page: Page) => void;
  addMajor: (major: CrawledMajor) => void;
  removeMajor: (code: string) => void;
  setCurrentMajor: (code: string | null) => void;
  setCrawlingProgress: (progress: CrawlingProgress | null) => void;
  updateCrawlingProgress: (updates: Partial<CrawlingProgress>) => void;
  addCrawlingLog: (message: string) => void;
  setVisibleMajorCodes: (codes: string[]) => void;
  toggleVisibleMajor: (code: string) => void;
  setCrawlTarget: (target: CrawlTarget | null) => void;
  setEnableProfessionalThreeLevelMenu: (enabled: boolean) => void;
}

function isClient(): boolean {
  return typeof window !== 'undefined';
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentPage: 'welcome',
      crawledMajors: [],
      currentMajor: null,
      crawlingProgress: null,
      visibleMajorCodes: [],
      crawlTarget: null,
      enableProfessionalThreeLevelMenu: false,

      setPage: (page) => set({ currentPage: page }),

      addMajor: (major) => set((state) => {
        if (state.crawledMajors.some((m) => m.code === major.code)) {
          return state;
        }
        return { crawledMajors: [...state.crawledMajors, major] };
      }),

      removeMajor: (code) => set((state) => ({
        crawledMajors: state.crawledMajors.filter((m) => m.code !== code),
        visibleMajorCodes: state.visibleMajorCodes.filter((c) => c !== code),
      })),

      setCurrentMajor: (code) => set({ currentMajor: code }),

      setCrawlingProgress: (progress) => set({ crawlingProgress: progress }),

      updateCrawlingProgress: (updates) => set((state) => ({
        crawlingProgress: state.crawlingProgress
          ? { ...state.crawlingProgress, ...updates }
          : null,
      })),

      addCrawlingLog: (message) => set((state) => {
        if (!state.crawlingProgress) return state;
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        return {
          crawlingProgress: {
            ...state.crawlingProgress,
            logs: [...state.crawlingProgress.logs, { time, message }],
          },
        };
      }),

      setVisibleMajorCodes: (codes) => set((state) => ({
        visibleMajorCodes: Array.from(new Set(codes.filter((c) => state.crawledMajors.some((m) => m.code === c)))),
      })),

      toggleVisibleMajor: (code) => set((state) => {
        const next = state.visibleMajorCodes.includes(code)
          ? state.visibleMajorCodes.filter((c) => c !== code)
          : [...state.visibleMajorCodes, code];
        return { visibleMajorCodes: next };
      }),

      setCrawlTarget: (target) => set({ crawlTarget: target }),
      setEnableProfessionalThreeLevelMenu: (enabled) => set({ enableProfessionalThreeLevelMenu: enabled }),
    }),
    {
      name: 'yam-app-store',
      partialize: (state) => ({
        visibleMajorCodes: state.visibleMajorCodes,
        enableProfessionalThreeLevelMenu: state.enableProfessionalThreeLevelMenu,
      }),
      storage: isClient()
        ? {
            getItem: (name) => {
              const value = window.localStorage.getItem(name);
              return value ? JSON.parse(value) : null;
            },
            setItem: (name, value) => {
              window.localStorage.setItem(name, JSON.stringify(value));
            },
            removeItem: (name) => {
              window.localStorage.removeItem(name);
            },
          }
        : undefined,
    }
  )
);
