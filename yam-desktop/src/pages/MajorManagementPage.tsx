import { motion } from 'framer-motion';
import { RefreshCw, Trash2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAppStore, type CrawledMajor } from '../stores/appStore';
import { TopNav } from '../components/TopNav';
import { syncWorkspaceData } from '../lib/db';

const MOCK_MAJORS: CrawledMajor[] = [
  { code: '085410', name: '人工智能', dataVersion: '2026', lastUpdated: '2025-05-20 昨天', schoolCount: 287, dbSize: '1.24 GB' },
  { code: '081200', name: '计算机科学与技术', dataVersion: '2026', lastUpdated: '2025-05-19 2天前', schoolCount: 312, dbSize: '1.36 GB' },
  { code: '085405', name: '软件工程', dataVersion: '2026', lastUpdated: '2025-05-18 3天前', schoolCount: 265, dbSize: '1.08 GB' },
  { code: '085404', name: '数据科学与大数据技术', dataVersion: '2026', lastUpdated: '2025-05-16 5天前', schoolCount: 190, dbSize: '862 MB' },
  { code: '085401', name: '电子信息工程', dataVersion: '2026', lastUpdated: '2025-05-15 6天前', schoolCount: 238, dbSize: '1.02 GB' },
  { code: '085402', name: '通信工程', dataVersion: '2026', lastUpdated: '2025-05-14 7天前', schoolCount: 215, dbSize: '936 MB' },
  { code: '081104', name: '控制科学与工程', dataVersion: '2026', lastUpdated: '2025-05-12 9天前', schoolCount: 184, dbSize: '768 MB' },
];

function getMajorCategory(code: string): string {
  return code.startsWith('085') ? '专' : '本';
}

export function MajorManagementPage() {
  const { setPage, crawledMajors, removeMajor } = useAppStore();
  const [updatingCode, setUpdatingCode] = useState<string | null>(null);

  const majorsToShow = crawledMajors.length > 0 ? crawledMajors : MOCK_MAJORS;

  const handleUpdate = async (code: string) => {
    setUpdatingCode(code);
    try {
      await syncWorkspaceData(code);
    } catch (err) {
      console.error(`同步专业 ${code} 失败:`, err);
    } finally {
      setUpdatingCode(null);
    }
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
          {majorsToShow.map((major, index) => {
            const category = getMajorCategory(major.code);
            return (
              <motion.div
                key={major.code}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
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
                    disabled={updatingCode === major.code}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-[#1e3a5f] border border-gray-200 rounded-md hover:border-[#1e3a5f] transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={14} className={updatingCode === major.code ? 'animate-spin' : ''} />
                    {updatingCode === major.code ? '同步中' : '更新'}
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
          })}
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
