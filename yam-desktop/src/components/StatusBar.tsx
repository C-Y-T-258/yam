import { motion } from 'framer-motion';

interface StatusBarProps {
  majorCode: string;
  totalSchools: number;
  favoriteCount: number;
  compareCount: number;
}

export function StatusBar({ majorCode, totalSchools, favoriteCount, compareCount }: StatusBarProps) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="h-8 flex items-center justify-between px-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500"
    >
      <div className="flex gap-4">
        <span>专业: {majorCode}</span>
        <span>数据更新于 2026-06-15</span>
      </div>
      <div className="flex gap-4">
        <span>共 {totalSchools} 所院校</span>
        <span>收藏 {favoriteCount} 所</span>
        <span>已选 {compareCount}/3 对比</span>
      </div>
    </motion.div>
  );
}
