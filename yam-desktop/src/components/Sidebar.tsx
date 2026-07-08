import { motion, AnimatePresence } from 'framer-motion';
import { Star, Filter } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 260, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="h-full border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden"
        >
          <div className="p-4 w-[260px]">
            <h2 className="font-bold text-primary mb-4 flex items-center gap-2">
              <Filter size={18} /> 筛选
            </h2>

            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input type="checkbox" className="rounded" />
              <Star size={16} />
              <span className="text-sm">只显示收藏</span>
            </label>

            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">学校层次</h3>
              {['985', '211', '双一流', '普通本科'].map(level => (
                <label key={level} className="flex items-center gap-2 mb-1 cursor-pointer">
                  <input type="checkbox" className="rounded" />
                  <span className="text-sm">{level}</span>
                </label>
              ))}
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">所在地区</h3>
              <select className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm">
                <option>全部省份</option>
              </select>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
