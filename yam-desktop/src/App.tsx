import { useEffect, useState } from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import { AppLayout } from './components/AppLayout';
import { SchoolCard } from './components/SchoolCard';
import { useTheme } from './lib/theme';
import { fetchSchools, fetchScoreLines, School, ScoreLine } from './lib/db';

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

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
        <ThemeToggle />
        <AppLayout majorCode="085410" totalSchools={schools.length}>
          <div className="max-w-4xl">
            {schools.slice(0, 20).map((school, i) => (
              <SchoolCard
                key={school.school_id}
                school={school}
                scoreLines={scoreLines[school.school_id] || []}
                index={i}
              />
            ))}
          </div>
        </AppLayout>
      </div>
    </ThemeProvider>
  );
}
