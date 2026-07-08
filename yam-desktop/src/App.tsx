import { useEffect, useState, useMemo } from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import { AppLayout } from './components/AppLayout';
import { SchoolCard } from './components/SchoolCard';
import { SearchBar } from './components/SearchBar';
import { FilterPanel } from './components/FilterPanel';
import { CompareModal } from './components/CompareModal';
import { useTheme } from './lib/theme';
import { fetchSchools, fetchScoreLines, School, ScoreLine } from './lib/db';
import { useFilterStore } from './stores/filterStore';
import { useCompareStore } from './stores/compareStore';

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="fixed top-4 right-4 p-2 rounded-lg bg-gray-200 dark:bg-gray-700 transition-colors z-50"
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}

export default function App() {
  const [schools, setSchools] = useState<School[]>([]);
  const [scoreLines, setScoreLines] = useState<Record<string, ScoreLine[]>>({});
  const { searchQuery, selectedLevels } = useFilterStore();
  const { selectedIds } = useCompareStore();
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  useEffect(() => {
    fetchSchools('085410').then(async (s) => {
      setSchools(s);
      const scores: Record<string, ScoreLine[]> = {};
      for (const school of s.slice(0, 20)) {
        scores[school.school_id] = await fetchScoreLines(school.school_id, '085410');
      }
      setScoreLines(scores);
    });
  }, []);

  const filteredSchools = useMemo(() => {
    return schools.filter((school) => {
      // Search filter
      const matchesSearch = searchQuery === '' || 
        school.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (school.province && school.province.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // Level filter
      const levelTag = school.level?.includes('985') ? '985'
        : school.level?.includes('211') ? '211'
        : school.level?.includes('一流') ? '双一流'
        : '普通';
      
      const matchesLevel = selectedLevels.length === 0 || selectedLevels.includes(levelTag);
      
      return matchesSearch && matchesLevel;
    });
  }, [schools, searchQuery, selectedLevels]);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
        <ThemeToggle />
        <AppLayout majorCode="085410" totalSchools={filteredSchools.length}>
          <div className="max-w-4xl">
            <div className="mb-6 space-y-4">
              <SearchBar />
              <FilterPanel />
            </div>
            {filteredSchools.map((school, i) => (
              <SchoolCard
                key={school.school_id}
                school={school}
                scoreLines={scoreLines[school.school_id] || []}
                index={i}
              />
            ))}
          </div>
        </AppLayout>
        <CompareModal
          isOpen={isCompareOpen}
          onClose={() => setIsCompareOpen(false)}
          schools={schools.filter(s => selectedIds.includes(s.school_id))}
        />
        {selectedIds.length > 0 && (
          <button
            onClick={() => setIsCompareOpen(true)}
            className="fixed bottom-12 right-4 px-4 py-2 bg-primary text-white rounded-lg shadow-lg hover:opacity-90 transition-opacity z-40"
          >
            对比 ({selectedIds.length})
          </button>
        )}
      </div>
    </ThemeProvider>
  );
}
