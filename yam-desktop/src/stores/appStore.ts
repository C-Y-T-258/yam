import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Page = 'welcome' | 'major-management' | 'major-select' | 'crawling' | 'data-ready' | 'workspace' | 'favorites' | 'recent' | 'settings';

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
  logs: Array<{ time: string; message: string; level?: 'info' | 'warn' | 'success' | 'error' }>;
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
  /// 新采集完成但用户还没在专业管理/管理显示专业 Modal 中"看过"的专业 major_code 列表。
  /// 由 App.tsx 监听 `crawl-synced` 事件后调用 `markMajorAsNew` 添加；
  /// MajorManagementPage 卸载或 ManageMajorsModal 关闭时调用 `clearAllNewMajors` 清空。
  /// 不持久化：重启后 NEW 标签消失（用户重启应用视为"已看过"）。
  newlyAddedMajors: string[];

  setPage: (page: Page) => void;
  addMajor: (major: CrawledMajor) => void;
  removeMajor: (code: string) => void;
  setCurrentMajor: (code: string | null) => void;
  setCrawlingProgress: (progress: CrawlingProgress | null) => void;
  updateCrawlingProgress: (updates: Partial<CrawlingProgress>) => void;
  addCrawlingLog: (message: string, level?: 'info' | 'warn' | 'success' | 'error') => void;
  setVisibleMajorCodes: (codes: string[]) => void;
  toggleVisibleMajor: (code: string) => void;
  setCrawlTarget: (target: CrawlTarget | null) => void;
  setEnableProfessionalThreeLevelMenu: (enabled: boolean) => void;
  updateMajor: (code: string, updates: Partial<CrawledMajor>) => void;
  markMajorAsNew: (code: string) => void;
  clearNewMajor: (code: string) => void;
  clearAllNewMajors: () => void;
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
      newlyAddedMajors: [],

      setPage: (page) => set({ currentPage: page }),

      addMajor: (major) => set((state) => {
        if (state.crawledMajors.some((m) => m.code === major.code)) {
          return state;
        }
        return {
          crawledMajors: [...state.crawledMajors, major],
          visibleMajorCodes: Array.from(new Set([...state.visibleMajorCodes, major.code])),
        };
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

      addCrawlingLog: (message, level = 'info') => set((state) => {
        if (!state.crawlingProgress) return state;
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        return {
          crawlingProgress: {
            ...state.crawlingProgress,
            logs: [...state.crawlingProgress.logs, { time, message, level }],
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

      updateMajor: (code, updates) => set((state) => ({
        crawledMajors: state.crawledMajors.map((m) =>
          m.code === code ? { ...m, ...updates } : m
        ),
      })),

      markMajorAsNew: (code) => set((state) => {
        if (state.newlyAddedMajors.includes(code)) return state;
        return { newlyAddedMajors: [...state.newlyAddedMajors, code] };
      }),

      clearNewMajor: (code) => set((state) => ({
        newlyAddedMajors: state.newlyAddedMajors.filter((c) => c !== code),
      })),

      clearAllNewMajors: () => set({ newlyAddedMajors: [] }),
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
