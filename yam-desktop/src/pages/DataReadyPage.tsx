import { motion } from 'framer-motion';
import { ArrowRight, Plus, ChevronRight, FolderOpen } from 'lucide-react';
import { useAppStore, type CrawledMajor } from '../stores/appStore';

const MAJOR_ICONS: Record<string, string> = {
  '085410': '🧠',
  '085404': '</>',
  '085401': '🔧',
  '081104': '⚙️',
  '085402': '📡',
};

export function DataReadyPage() {
  const { setPage, crawledMajors, setCurrentMajor } = useAppStore();

  const handleEnterWorkspace = (code?: string) => {
    if (code) {
      setCurrentMajor(code);
    } else if (crawledMajors.length > 0) {
      setCurrentMajor(crawledMajors[0].code);
    }
    setPage('workspace');
  };

  const handleContinueAdd = () => {
    setPage('major-management');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1e3a5f] rounded-lg flex items-center justify-center text-white font-bold text-sm">
            研
          </div>
          <span className="font-medium text-gray-900">研喵 (YAM)</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-3xl"
        >
          {/* Title */}
          <h1 className="text-4xl font-bold text-gray-900 text-center mb-3">
            数据已就绪
          </h1>
          <p className="text-gray-500 text-center mb-10">
            以下专业已准备完成，可立即进入工作区。
          </p>

          {/* Majors Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-10">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-3 bg-gray-50 text-sm text-gray-500 font-medium border-b border-gray-200">
              <div>专业名称</div>
              <div className="w-28 text-center">学校数量</div>
              <div className="w-20 text-center">数据版本</div>
              <div className="w-28 text-center">更新时间</div>
              <div className="w-8"></div>
            </div>

            {/* Table Body */}
            {crawledMajors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <FolderOpen size={40} className="text-gray-300 mb-3" />
                <p className="text-gray-500 mb-1">暂无专业数据</p>
                <p className="text-sm text-gray-400">请先添加专业并采集数据</p>
              </div>
            ) : (
              crawledMajors.map((major, index) => (
              <motion.div
                key={major.code}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleEnterWorkspace(major.code)}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors items-center cursor-pointer"
              >
                {/* Major Name */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
                    {MAJOR_ICONS[major.code] || '📚'}
                  </div>
                  <span className="font-medium text-gray-900">{major.name}</span>
                </div>

                {/* School Count */}
                <div className="w-28 text-center text-gray-600">{major.schoolCount}所学校</div>

                {/* Data Version */}
                <div className="w-20 text-center text-gray-600">{major.dataVersion}</div>

                {/* Last Updated */}
                <div className="w-28 text-center text-gray-600">{major.lastUpdated}</div>

                {/* Arrow */}
                <div className="w-8 flex justify-center">
                  <ChevronRight size={18} className="text-gray-400" />
                </div>
              </motion.div>
              ))
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleEnterWorkspace()}
              disabled={crawledMajors.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#162d4a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRight size={18} />
              进入工作区
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleContinueAdd}
              className="flex items-center gap-2 px-6 py-3 text-gray-600 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              <Plus size={18} />
              继续新增专业
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
