import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CATEGORY_TREE = {
  '工学': {
    '计算机科学与技术': [
      { code: '085410', name: '人工智能' },
      { code: '085401', name: '计算机技术' },
      { code: '085404', name: '软件工程' },
    ],
    '电子科学与技术': [
      { code: '085405', name: '控制工程' },
    ],
  },
  '理学': {
    '数学': [
      { code: '070101', name: '基础数学' },
    ],
  },
};

interface SplashScreenProps {
  onSelect: (majorCode: string) => void;
}

export function SplashScreen({ onSelect }: SplashScreenProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const categories = Object.keys(CATEGORY_TREE);
  const subjects = selectedCategory ? Object.keys(CATEGORY_TREE[selectedCategory as keyof typeof CATEGORY_TREE]) : [];
  const majors = selectedCategory && selectedSubject
    ? CATEGORY_TREE[selectedCategory as keyof typeof CATEGORY_TREE][selectedSubject as keyof typeof CATEGORY_TREE[string]]
    : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5"
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 w-[800px]"
      >
        <h1 className="text-3xl font-bold text-center text-primary mb-2">研喵 YAM</h1>
        <p className="text-center text-gray-500 mb-6">本地优先的考研择校数据工具</p>

        <div className="relative mb-6">
          <input
            type="text"
            placeholder="搜索专业名称或代码..."
            className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Column 1: 学科门类 */}
          <div className="border rounded-lg p-3 h-64 overflow-auto">
            <h3 className="text-sm font-medium text-gray-500 mb-2">学科门类</h3>
            {categories.map(cat => (
              <motion.button
                key={cat}
                whileHover={{ x: 4 }}
                onClick={() => { setSelectedCategory(cat); setSelectedSubject(null); }}
                className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                  selectedCategory === cat ? 'bg-primary text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {cat}
              </motion.button>
            ))}
          </div>

          {/* Column 2: 一级学科 */}
          <div className="border rounded-lg p-3 h-64 overflow-auto">
            <h3 className="text-sm font-medium text-gray-500 mb-2">一级学科</h3>
            <AnimatePresence mode="wait">
              {subjects.map(sub => (
                <motion.button
                  key={sub}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  whileHover={{ x: 4 }}
                  onClick={() => setSelectedSubject(sub)}
                  className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                    selectedSubject === sub ? 'bg-primary text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {sub}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>

          {/* Column 3: 专业 */}
          <div className="border rounded-lg p-3 h-64 overflow-auto">
            <h3 className="text-sm font-medium text-gray-500 mb-2">专业</h3>
            <AnimatePresence mode="wait">
              {majors?.map((m: any) => (
                <motion.button
                  key={m.code}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  whileHover={{ x: 4 }}
                  onClick={() => onSelect(m.code)}
                  className="w-full text-left px-3 py-2 rounded text-sm mb-1 hover:bg-primary/10 transition-colors"
                >
                  <span className="text-gray-500 mr-2">{m.code}</span>
                  {m.name}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}