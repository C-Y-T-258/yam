import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ChevronDown, AlertTriangle } from 'lucide-react';
import { School, ScoreLine } from '../lib/db';
import { ScoreTrend } from './ScoreTrend';

interface SchoolCardProps {
  school: School;
  scoreLines: ScoreLine[];
  index: number;
}

export function SchoolCard({ school, scoreLines, index }: SchoolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [favorited, setFavorited] = useState(false);

  const scoresByYear = scoreLines
    .filter(s => s.total)
    .reduce((acc, s) => {
      if (!acc.find(a => a.year === s.year)) {
        acc.push({ year: s.year, total: s.total! });
      }
      return acc;
    }, [] as { year: number; total: number }[]);

  const levelTag = school.level?.includes('985') ? '985'
    : school.level?.includes('211') ? '211'
    : school.level?.includes('一流') ? '双一流'
    : '普通';

  const levelColor = levelTag === '985' ? 'bg-red-500'
    : levelTag === '211' ? 'bg-blue-500'
    : levelTag === '双一流' ? 'bg-purple-500'
    : 'bg-gray-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 300, damping: 30 }}
      whileHover={{ scale: 1.01, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-3 transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFavorited(!favorited)}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <Heart size={20} fill={favorited ? '#E94560' : 'none'} color={favorited ? '#E94560' : undefined} />
          </button>
          <h3 className="font-bold text-primary">{school.name}</h3>
          <span className={`${levelColor} text-white text-xs px-2 py-0.5 rounded`}>{levelTag}</span>
          <span className="text-xs text-gray-500">{school.province}</span>
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" className="rounded" />
          对比
        </label>
      </div>

      {/* Score Trend */}
      {scoresByYear.length > 0 && (
        <div className="mb-2">
          <ScoreTrend scores={scoresByYear} />
        </div>
      )}

      {/* Warning Banner */}
      <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded mb-2">
        <AlertTriangle size={14} />
        <span>研招网与掌上考研数据差异较大</span>
      </div>

      {/* Expand Button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-sm text-primary hover:underline"
      >
        {expanded ? '收起' : '展开详情'}
        <motion.span animate={{ rotate: expanded ? 180 : 0 }}>
          <ChevronDown size={16} />
        </motion.span>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                详细信息加载中...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
