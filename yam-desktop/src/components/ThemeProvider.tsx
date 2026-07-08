import { useEffect, ReactNode } from 'react';
import { useTheme } from '../lib/theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return <>{children}</>;
}
