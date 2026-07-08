import { ThemeProvider } from './components/ThemeProvider';
import { useTheme } from './lib/theme';
import { useEffect, useState } from 'react';
import { fetchSchools, School } from './lib/db';

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="fixed top-4 right-4 p-2 rounded-lg bg-gray-200 dark:bg-gray-700 transition-colors"
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}

export default function App() {
  const [schools, setSchools] = useState<School[]>([]);

  useEffect(() => {
    fetchSchools('085410').then(setSchools);
  }, []);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
        <ThemeToggle />
        <div className="p-4">
          <h1>共 {schools.length} 所院校</h1>
          {schools.slice(0, 5).map(s => (
            <div key={s.school_id}>{s.name} - {s.province}</div>
          ))}
        </div>
      </div>
    </ThemeProvider>
  );
}
