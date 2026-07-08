import { RotateCcw } from 'lucide-react';
import { useFilterStore } from '../stores/filterStore';

const LEVELS = [
  { id: '985', label: '985', color: 'bg-red-500 hover:bg-red-600' },
  { id: '211', label: '211', color: 'bg-blue-500 hover:bg-blue-600' },
  { id: '双一流', label: '双一流', color: 'bg-purple-500 hover:bg-purple-600' },
  { id: '普通', label: '普通', color: 'bg-gray-500 hover:bg-gray-600' },
];

export function FilterPanel() {
  const { selectedLevels, toggleLevel, resetFilters } = useFilterStore();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-gray-500 dark:text-gray-400 mr-1">层级:</span>
      {LEVELS.map((level) => {
        const isSelected = selectedLevels.includes(level.id);
        return (
          <button
            key={level.id}
            onClick={() => toggleLevel(level.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              isSelected
                ? `${level.color} text-white shadow-md`
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {level.label}
          </button>
        );
      })}
      {(selectedLevels.length > 0) && (
        <button
          onClick={resetFilters}
          className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
        >
          <RotateCcw size={12} />
          重置
        </button>
      )}
    </div>
  );
}