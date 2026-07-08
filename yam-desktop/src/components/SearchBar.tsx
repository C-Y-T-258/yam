import { Search, X } from 'lucide-react';
import { useFilterStore } from '../stores/filterStore';

export function SearchBar() {
  const { searchQuery, setSearchQuery } = useFilterStore();

  return (
    <div className="relative w-full max-w-md">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search size={18} className="text-gray-400" />
      </div>
      <input
        type="text"
        placeholder="搜索学校名称、省份..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full pl-10 pr-10 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery('')}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}