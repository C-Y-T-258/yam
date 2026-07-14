import { motion } from 'framer-motion';
import { useAppStore } from '../stores/appStore';

export function WelcomePage() {
  const { setPage } = useAppStore();

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          欢迎使用研喵
        </h1>
        <p className="text-gray-500 mb-8">
          当前暂无任何专业数据，请先添加需要采集的专业。
        </p>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setPage('major-select')}
          className="px-8 py-3 bg-[#1e3a5f] text-white rounded-lg font-medium text-lg hover:bg-[#162d4a] transition-colors"
        >
          添加专业
        </motion.button>
        <p className="mt-6">
          <button className="text-sm text-gray-500 hover:text-gray-700 underline">
            了解软件工作流程
          </button>
        </p>
      </motion.div>
    </div>
  );
}
