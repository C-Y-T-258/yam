import { useState, useEffect } from 'react';
import { useAppStore, type Page } from './stores/appStore';
import { fetchAvailableMajors } from './lib/db';
import {
  ACADEMIC_CATEGORIES,
  PROFESSIONAL_DEGREE_CATEGORIES,
} from './data/majors';

// Pages
import { WelcomePage } from './pages/WelcomePage';
import { MajorManagementPage } from './pages/MajorManagementPage';
import { MajorSelectPage } from './pages/MajorSelectPage';
import { CrawlingPage } from './pages/CrawlingPage';
import { DataReadyPage } from './pages/DataReadyPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { FavoritesPage, RecentPage } from './pages/Modals';
import { ManageMajorsModal, CompareModal } from './pages/Modals';

function findMajorName(code: string): string {
  // 1. 学术学位：精确匹配 4 位一级学科或 6 位专业代码
  for (const cat of ACADEMIC_CATEGORIES) {
    for (const disc of cat.disciplines) {
      if (disc.code === code) return disc.name;
      for (const m of disc.majors) {
        if (m.code === code) return m.name;
      }
    }
  }
  // 2. 专业学位：精确匹配 4 位 category code
  for (const cat of PROFESSIONAL_DEGREE_CATEGORIES) {
    if (cat.code === code) return cat.name;
  }
  // 3. 专业学位 6 位代码：前 4 位匹配 category，后 2 位映射 subField
  if (code.length === 6) {
    const catCode = code.slice(0, 4);
    const subIdx = parseInt(code.slice(4), 10) - 1;
    for (const cat of PROFESSIONAL_DEGREE_CATEGORIES) {
      if (cat.code === catCode && cat.subFields && subIdx >= 0 && subIdx < cat.subFields.length) {
        return `${cat.name}（${cat.subFields[subIdx]}）`;
      }
    }
  }
  return code;
}

// Mock compare data
const MOCK_COMPARE_SCHOOLS = [
  { id: '1', name: '清华大学', region: '北京', level: '985 / 211 / 双一流', tuition: 8000, duration: 3, enrollCount: 28, minScore: 681, politics: 70, english: 70, math: 110, specialized: 120 },
  { id: '2', name: '浙江大学', region: '浙江', level: '985 / 211 / 双一流', tuition: 8000, duration: 3, enrollCount: 32, minScore: 672, politics: 68, english: 68, math: 105, specialized: 115 },
  { id: '3', name: '北京航空航天大学', region: '北京', level: '985 / 211 / 双一流', tuition: 8000, duration: 3, enrollCount: 24, minScore: 663, politics: 67, english: 67, math: 105, specialized: 114 },
];

export default function App() {
  const { currentPage, setPage, crawledMajors, currentMajor, addMajor, setCurrentMajor } = useAppStore();
  const [isManageMajorsOpen, setIsManageMajorsOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [workspaceRefreshNonce, setWorkspaceRefreshNonce] = useState(0);

  // On desktop, auto-detect majors already synced to Tauri DB.
  useEffect(() => {
    if (initialized && crawledMajors.length > 0) return;
    const isTauri = typeof window !== 'undefined' && (window as unknown as { isTauri?: boolean }).isTauri === true;
    if (!isTauri) {
      setInitialized(true);
      return;
    }
    fetchAvailableMajors()
      .then((majors) => {
        if (majors.length > 0) {
          const existingCodes = new Set(crawledMajors.map((m) => m.code));
          majors.forEach((m) => {
            if (existingCodes.has(m.major_code)) return;
            addMajor({
              code: m.major_code,
              name: findMajorName(m.major_code),
              dataVersion: '2026',
              lastUpdated: '已同步',
              schoolCount: m.school_count,
              dbSize: '-',
            });
          });
          if (!currentMajor) {
            setCurrentMajor(majors[0].major_code);
          }
        }
      })
      .catch((err) => console.error('加载已同步专业失败:', err))
      .finally(() => setInitialized(true));
  }, [initialized, crawledMajors, currentMajor, addMajor, setCurrentMajor]);

  // URL hash navigation for testing
  useEffect(() => {
    const hash = window.location.hash.slice(1) as Page;
    if (hash && ['welcome', 'major-management', 'major-select', 'crawling', 'data-ready', 'workspace', 'favorites', 'recent'].includes(hash)) {
      setPage(hash);
    }
  }, [setPage]);

  // Check if we have data to determine initial page
  const hasData = crawledMajors.length > 0;
  const effectivePage = hasData && currentPage === 'welcome' ? 'workspace' : currentPage;

  const renderNonWorkspacePage = () => {
    switch (effectivePage) {
      case 'welcome':
        return <WelcomePage />;
      case 'major-management':
        return <MajorManagementPage />;
      case 'major-select':
        return <MajorSelectPage />;
      case 'crawling':
        return <CrawlingPage />;
      case 'data-ready':
        return <DataReadyPage />;
      case 'favorites':
        return <FavoritesPage />;
      case 'recent':
        return <RecentPage />;
      default:
        return <WelcomePage />;
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Always keep WorkspacePage mounted so its state survives page switches */}
      <div className={effectivePage === 'workspace' ? '' : 'hidden'}>
        <WorkspacePage
          onOpenCompare={() => setIsCompareOpen(true)}
          onOpenManageMajors={() => setIsManageMajorsOpen(true)}
          refreshNonce={workspaceRefreshNonce}
        />
      </div>

      {effectivePage !== 'workspace' && renderNonWorkspacePage()}

      {/* Modals */}
      <ManageMajorsModal
        isOpen={isManageMajorsOpen}
        onClose={() => setIsManageMajorsOpen(false)}
        onConfirm={() => setWorkspaceRefreshNonce((n) => n + 1)}
      />

      <CompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        schools={MOCK_COMPARE_SCHOOLS}
      />
    </div>
  );
}
