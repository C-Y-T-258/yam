import { motion } from 'framer-motion';

interface ScoreTrendProps {
  scores: { year: number; total: number | null }[];
}

export function ScoreTrend({ scores }: ScoreTrendProps) {
  const sorted = [...scores].sort((a, b) => a.year - b.year);

  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-gray-500">分数线:</span>
      {sorted.map((s, i) => (
        <motion.span
          key={s.year}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="font-medium"
        >
          {i > 0 && <span className="text-gray-400 mx-1">→</span>}
          <span className={s.total && s.total >= 300 ? 'text-red-500' : 'text-green-600'}>
            {String(s.year).slice(-2)}: {s.total ?? '-'}
          </span>
        </motion.span>
      ))}
    </div>
  );
}
