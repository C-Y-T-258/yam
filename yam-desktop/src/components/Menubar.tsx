import { Search, Settings, Menu } from 'lucide-react';
import { motion } from 'framer-motion';

interface MenubarProps {
  onToggleSidebar: () => void;
}

export function Menubar({ onToggleSidebar }: MenubarProps) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="h-12 flex items-center justify-between px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
    >
      <div className="flex items-center gap-4">
        <button onClick={onToggleSidebar} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
          <Menu size={20} />
        </button>
        <span className="font-bold text-primary">研喵 YAM</span>
        <nav className="flex gap-3 text-sm text-gray-600 dark:text-gray-400">
          <span className="hover:text-primary cursor-pointer">文件</span>
          <span className="hover:text-primary cursor-pointer">数据</span>
          <span className="hover:text-primary cursor-pointer">视图</span>
          <span className="hover:text-primary cursor-pointer">帮助</span>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <Search size={18} className="text-gray-500 cursor-pointer hover:text-primary" />
        <Settings size={18} className="text-gray-500 cursor-pointer hover:text-primary" />
      </div>
    </motion.div>
  );
}
