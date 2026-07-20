import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useAppStore, type Page } from '../stores/appStore';

type NavTab = 'major-management' | 'crawling' | 'workspace' | 'settings' | 'help';

interface TopNavProps {
  activeTab?: NavTab;
}

const WORKSPACE_MENU_ITEMS: { key: Page; label: string }[] = [
  { key: 'workspace', label: '工作区' },
  { key: 'favorites', label: '收藏' },
  { key: 'recent', label: '最近查看' },
];

export function TopNav({ activeTab = 'workspace' }: TopNavProps) {
  const { setPage } = useAppStore();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);

  const handleTabClick = (tab: NavTab) => {
    if (tab === 'major-management') {
      setPage('major-management');
    } else if (tab === 'crawling') {
      setPage('crawling');
    } else if (tab === 'workspace') {
      setPage('workspace');
    } else if (tab === 'settings') {
      setPage('settings');
    }
  };

  const handleWorkspaceMenuClick = (page: Page) => {
    setPage(page);
    setIsWorkspaceMenuOpen(false);
  };

  return (
    <div className="border-b border-gray-200 px-6">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3 py-3">
          <div className="w-8 h-8 bg-[#1e3a5f] rounded-lg flex items-center justify-center text-white font-bold text-sm">
            研
          </div>
          <span className="font-medium text-gray-900">研喵 (YAM)</span>
        </div>
        <nav className="flex items-center gap-1">
          {(['major-management', 'crawling'] as NavTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabClick(tab)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'major-management' && '专业管理'}
              {tab === 'crawling' && '数据采集'}
            </button>
          ))}

          {/* Workspace dropdown */}
          <div
            className="relative"
            onMouseEnter={() => setIsWorkspaceMenuOpen(true)}
            onMouseLeave={() => setIsWorkspaceMenuOpen(false)}
          >
            <button
              onClick={() => handleTabClick('workspace')}
              className={`flex items-center gap-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'workspace'
                  ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              工作区
              <motion.span
                animate={{ rotate: isWorkspaceMenuOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="inline-block"
              >
                <ChevronDown size={14} />
              </motion.span>
            </button>

            <AnimatePresence>
              {isWorkspaceMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
                >
                  {WORKSPACE_MENU_ITEMS.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleWorkspaceMenuClick(item.key)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#1e3a5f] transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {(['settings', 'help'] as NavTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabClick(tab)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'settings' && '设置'}
              {tab === 'help' && '帮助'}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
