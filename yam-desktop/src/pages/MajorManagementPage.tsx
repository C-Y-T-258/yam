import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Trash2, Plus, FolderOpen } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { TopNav } from '../components/TopNav';
import { resetCrawl } from '../lib/db';

function getMajorCategory(code: string): string {
  return code.startsWith('085') ? '专' : '本';
}

export function MajorManagementPage() {
  const { setPage, crawledMajors, removeMajor, setCrawlTarget, newlyAddedMajors, clearAllNewMajors } = useAppStore();

  // 卸载页面时清除所有 NEW 标签：用户切出后再切回不应再显示 NEW
  useEffect(() => {
    return () => {
      clearAllNewMajors();
    };
  }, [clearAllNewMajors]);

  // NEW 专业置顶，NEW 之间保持原相对顺序（stable sort）
  const sortedMajors = useMemo(() => {
    return [...crawledMajors].sort((a, b) => {
      const aIsNew = newlyAddedMajors.includes(a.code) ? 0 : 1;
      const bIsNew = newlyAddedMajors.includes(b.code) ? 0 : 1;
      return aIsNew - bIsNew;
    });
  }, [crawledMajors, newlyAddedMajors]);

  const handleUpdate = async (code: string) => {
    const major = crawledMajors.find((m) => m.code === code);
    if (!major) return;
    // 仅允许清理已结束的状态；运行中的任务会由后端拒绝重置，不会被更新请求终止。
    try {
      await resetCrawl();
    } catch (e) {
      console.warn('reset crawl rejected:', e);
    }
    setCrawlTarget({ code: major.code, name: major.name, force: true });
    setPage('crawling');
  };

  const handleDelete = (code: string) => {
    removeMajor(code);
  };

  const handleAddMajor = () => {
    setPage('major-select');
  };

  return (
    <div className="min-h-screen bg-white">
      <TopNav activeTab="major-management" />

      {/* Content */}
      <div className="px-8 pb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">专业管理</h1>
        <p className="text-gray-500 mb-6">管理本地专业数据库。</p>

        {/* Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1fr_140px] gap-4 px-6 py-3.5 bg-gray-50 text-sm text-gray-500 font-medium border-b border-gray-200">
            <div>专业名称</div>
            <div className="text-center">数据版本</div>
            <div className="text-center">更新时间 ↓</div>
            <div className="text-center">学校数量</div>
            <div className="text-center">数据库大小</div>
            <div className="text-center">操作</div>
          </div>

          {/* Table Body */}
          {crawledMajors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <FolderOpen size={40} className="text-gray-300 mb-3" />
              <p className="text-gray-500 mb-1">暂无专业数据</p>
              <p className="text-sm text-gray-400">点击下方"添加专业"开始采集</p>
            </div>
          ) : (
            sortedMajors.map((major, index) => {
            const category = getMajorCategory(major.code);
            const isNew = newlyAddedMajors.includes(major.code);
            return (
              <motion.div
                key={major.code}
                layout  // 让位置变化也动画化，新行插入时旧行平滑下移
                initial={isNew
                  ? { opacity: 0, y: -50, scale: 0.92 }
                  : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={isNew
                  ? { type: 'spring', stiffness: 320, damping: 24 }
                  : { delay: index * 0.03 }}
                className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1fr_140px] gap-4 px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors items-center last:border-b-0"
              >
                {/* Major Name */}
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 truncate">{major.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                        category === '专'
                          ? 'bg-blue-50 text-blue-600 border border-blue-200'
                          : 'bg-green-50 text-green-600 border border-green-200'
                      }`}>
                        {category}
                      </span>
                      {isNew && (
                        <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 bg-emerald-100 text-emerald-700 border border-emerald-300 font-semibold tracking-wide animate-pulse">
                          NEW
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 font-mono">{major.code}</span>
                  </div>
                </div>

                {/* Data Version */}
                <div className="text-center text-gray-600">{major.dataVersion}</div>

                {/* Last Updated */}
                <div className="text-center text-gray-500 text-sm">{major.lastUpdated}</div>

                {/* School Count */}
                <div className="text-center text-gray-600">{major.schoolCount} 所</div>

                {/* DB Size */}
                <div className="text-center text-gray-500 text-sm">{major.dbSize}</div>

                {/* Actions */}
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => handleUpdate(major.code)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-[#1e3a5f] border border-gray-200 rounded-md hover:border-[#1e3a5f] transition-colors whitespace-nowrap"
                  >
                    <RefreshCw size={14} />
                    更新
                  </button>
                  <button
                    onClick={() => handleDelete(major.code)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 hover:text-red-600 border border-red-200 rounded-md hover:border-red-300 transition-colors whitespace-nowrap"
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              </motion.div>
            );
          })
          )}
        </div>

        {/* Add Major Button */}
        <div className="mt-6 flex justify-center">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleAddMajor}
            className="inline-flex items-center gap-2 px-10 py-3 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#162d4a] transition-colors"
          >
            <Plus size={18} />
            添加专业
          </motion.button>
        </div>
      </div>
    </div>
  );
}
