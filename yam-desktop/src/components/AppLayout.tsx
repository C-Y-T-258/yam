import { useState } from 'react';
import { Menubar } from './Menubar';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { useCompareStore } from '../stores/compareStore';

interface AppLayoutProps {
  children: React.ReactNode;
  majorCode: string;
  totalSchools: number;
}

export function AppLayout({ children, majorCode, totalSchools }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { selectedIds } = useCompareStore();

  return (
    <div className="flex flex-col h-screen">
      <Menubar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} />
        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>
      </div>
      <StatusBar majorCode={majorCode} totalSchools={totalSchools} favoriteCount={0} compareCount={selectedIds.length} />
    </div>
  );
}
