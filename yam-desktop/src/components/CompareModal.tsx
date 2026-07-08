import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { School } from '../lib/db';

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  schools: School[];
}

export function CompareModal({ isOpen, onClose, schools }: CompareModalProps) {
  if (!isOpen || schools.length === 0) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[900px] max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold">院校对比 ({schools.length}/3)</h2>
              <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X size={20} />
              </button>
            </div>

            {/* Table */}
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700">
                    <th className="p-3 text-left text-sm font-medium">对比项</th>
                    {schools.map(s => (
                      <th key={s.school_id} className="p-3 text-left text-sm font-medium">
                        {s.name}
                        <br />
                        <span className="text-xs text-gray-500">[{s.level}] {s.province}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-200 dark:border-gray-700">
                    <td className="p-3 text-sm">学校层次</td>
                    {schools.map(s => (
                      <td key={s.school_id} className="p-3 text-sm">{s.level || '-'}</td>
                    ))}
                  </tr>
                  <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <td className="p-3 text-sm">所在地</td>
                    {schools.map(s => (
                      <td key={s.school_id} className="p-3 text-sm">{s.province || '-'}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:opacity-90 transition-opacity">
                导出对比结果
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}