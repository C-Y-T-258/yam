import { useEffect, useState } from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import { AppLayout } from './components/AppLayout';
import { useTheme } from './lib/theme';
import { fetchSchools, School } from './lib/db';

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

  useEffect(() => {
    fetchSchools('085410').then(setSchools);
  }, []);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
        <ThemeToggle />
        <AppLayout majorCode="085410" totalSchools={schools.length}>
          <div>School list will go here</div>
        </AppLayout>
      </div>
    </ThemeProvider>
  );
}
