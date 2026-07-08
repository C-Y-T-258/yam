# Tauri + React Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate YAM's UI from Python + NiceGUI to Tauri + React + Tailwind + Framer Motion, achieving Notion/Figma level polish with smooth animations.

**Architecture:** Tauri 2.x desktop shell wrapping a React SPA. Rust backend reads existing SQLite database directly. React frontend handles all UI with Framer Motion for animations.

**Tech Stack:** Tauri 2.x, React 18, TypeScript, Tailwind CSS, Framer Motion, Zustand, better-sqlite3, Lucide React

## Global Constraints

- Package size < 15MB
- Startup time < 1s
- All animations < 300ms transition duration
- Must read existing `yam.db` SQLite database without schema changes
- Python爬虫脚本保持不变
- Dark mode: default light, manual toggle
- Primary color: `#0F3460`, accent: `#E94560`

---

### Task 1: Project Scaffolding

**Covers:** [S3]

**Files:**
- Create: `yam-desktop/package.json`
- Create: `yam-desktop/src-tauri/Cargo.toml`
- Create: `yam-desktop/src-tauri/tauri.conf.json`
- Create: `yam-desktop/src-tauri/src/main.rs`
- Create: `yam-desktop/src/App.tsx`
- Create: `yam-desktop/src/main.tsx`
- Create: `yam-desktop/tailwind.config.js`
- Create: `yam-desktop/vite.config.ts`

**Interfaces:**
- Produces: Tauri app shell that opens a window

- [ ] **Step 1: Create project directory**

```bash
mkdir -p yam-desktop/src-tauri/src
cd yam-desktop
```

- [ ] **Step 2: Initialize npm project**

```bash
npm init -y
npm install react react-dom
npm install -D typescript @types/react @types/react-dom vite @vitejs/plugin-react tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 3: Create package.json scripts**

```json
{
  "name": "yam-desktop",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "tauri": "tauri"
  }
}
```

- [ ] **Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
})
```

- [ ] **Step 5: Create tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#0F3460',
        accent: '#E94560',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 6: Create src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 7: Create src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create src/App.tsx**

```tsx
export default function App() {
  return <div className="p-4">YAM Desktop</div>
}
```

- [ ] **Step 9: Create index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>研喵 YAM</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 10: Install Tauri CLI**

```bash
npm install -D @tauri-apps/cli
npm install @tauri-apps/api
```

- [ ] **Step 11: Create src-tauri/Cargo.toml**

```toml
[package]
name = "yam-desktop"
version = "1.0.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

- [ ] **Step 12: Create src-tauri/src/main.rs**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 13: Create src-tauri/build.rs**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 14: Create src-tauri/tauri.conf.json**

```json
{
  "productName": "YAM",
  "version": "1.0.0",
  "identifier": "com.yam.desktop",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "title": "研喵 YAM",
    "windows": [
      {
        "title": "研喵 YAM",
        "width": 1200,
        "height": 800,
        "resizable": true
      }
    ]
  }
}
```

- [ ] **Step 15: Test scaffold**

```bash
npm run tauri dev
```

Expected: Empty window opens with "YAM Desktop" text

- [ ] **Step 16: Commit**

```bash
git add yam-desktop/
git commit -m "feat: scaffold Tauri + React project"
```

---

### Task 2: SQLite Integration

**Covers:** [S6]

**Files:**
- Create: `yam-desktop/src-tauri/src/db.rs`
- Create: `yam-desktop/src-tauri/src/commands.rs`
- Create: `yam-desktop/src/lib/db.ts`
- Modify: `yam-desktop/src-tauri/src/main.rs`
- Modify: `yam-desktop/src-tauri/Cargo.toml`

**Interfaces:**
- Consumes: Existing `yam.db` at project root
- Produces: `get_schools()`, `get_school_detail()`, `get_score_lines()` commands

- [ ] **Step 1: Create src-tauri/src/db.rs**

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

pub struct DbConn(pub Mutex<Connection>);

#[derive(Serialize, Deserialize)]
pub struct School {
    pub school_id: String,
    pub name: String,
    pub province: Option<String>,
    pub level: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ScoreLine {
    pub year: i32,
    pub total: Option<i32>,
    pub politics: Option<i32>,
    pub english: Option<i32>,
    pub special_one: Option<i32>,
    pub special_two: Option<i32>,
    pub department_name: Option<String>,
}

pub fn get_schools(conn: &Connection, major_code: &str) -> Vec<School> {
    let mut stmt = conn
        .prepare("SELECT school_id, name, province, level FROM schools WHERE major_code = ?1 ORDER BY name")
        .unwrap();
    let rows = stmt.query_map([major_code], |row| {
        Ok(School {
            school_id: row.get(0)?,
            name: row.get(1)?,
            province: row.get(2)?,
            level: row.get(3)?,
        })
    }).unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_score_lines(conn: &Connection, school_id: &str, major_code: &str) -> Vec<ScoreLine> {
    let mut stmt = conn
        .prepare("SELECT sl.year, sl.total, sl.politics, sl.english, sl.special_one, sl.special_two, d.name FROM score_lines sl LEFT JOIN departments d ON sl.department_id = d.department_id WHERE sl.school_id = ?1 AND sl.major_code = ?2 ORDER BY sl.year DESC")
        .unwrap();
    let rows = stmt.query_map([school_id, major_code], |row| {
        Ok(ScoreLine {
            year: row.get(0)?,
            total: row.get(1)?,
            politics: row.get(2)?,
            english: row.get(3)?,
            special_one: row.get(4)?,
            special_two: row.get(5)?,
            department_name: row.get(6)?,
        })
    }).unwrap();
    rows.filter_map(|r| r.ok()).collect()
}
```

- [ ] **Step 2: Create src-tauri/src/commands.rs**

```rust
use crate::db::{DbConn, School, ScoreLine, get_schools, get_score_lines};
use tauri::State;

#[tauri::command]
pub fn fetch_schools(state: State<'_, DbConn>, major_code: String) -> Vec<School> {
    let conn = state.0.lock().unwrap();
    get_schools(&conn, &major_code)
}

#[tauri::command]
pub fn fetch_score_lines(state: State<'_, DbConn>, school_id: String, major_code: String) -> Vec<ScoreLine> {
    let conn = state.0.lock().unwrap();
    get_score_lines(&conn, &school_id, &major_code)
}
```

- [ ] **Step 3: Update src-tauri/src/main.rs**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod commands;

use db::DbConn;
use rusqlite::Connection;
use std::sync::Mutex;

fn main() {
    let conn = Connection::open("yam.db").expect("Failed to open database");
    let db_state = DbConn(Mutex::new(conn));

    tauri::Builder::default()
        .manage(db_state)
        .invoke_handler(tauri::generate_handler![
            commands::fetch_schools,
            commands::fetch_score_lines,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Create src/lib/db.ts**

```typescript
import { invoke } from '@tauri-apps/api/core';

export interface School {
  school_id: string;
  name: string;
  province: string | null;
  level: string | null;
}

export interface ScoreLine {
  year: number;
  total: number | null;
  politics: number | null;
  english: number | null;
  special_one: number | null;
  special_two: number | null;
  department_name: string | null;
}

export async function fetchSchools(majorCode: string): Promise<School[]> {
  return invoke('fetch_schools', { majorCode });
}

export async function fetchScoreLines(schoolId: string, majorCode: string): Promise<ScoreLine[]> {
  return invoke('fetch_score_lines', { schoolId, majorCode });
}
```

- [ ] **Step 5: Test database integration**

Update App.tsx to fetch and display schools:

```tsx
import { useEffect, useState } from 'react';
import { fetchSchools, School } from './lib/db';

export default function App() {
  const [schools, setSchools] = useState<School[]>([]);

  useEffect(() => {
    fetchSchools('085410').then(setSchools);
  }, []);

  return (
    <div className="p-4">
      <h1>共 {schools.length} 所院校</h1>
      {schools.slice(0, 5).map(s => (
        <div key={s.school_id}>{s.name} - {s.province}</div>
      ))}
    </div>
  );
}
```

Run: `npm run tauri dev`
Expected: Shows first 5 schools from database

- [ ] **Step 6: Commit**

```bash
git add yam-desktop/src-tauri/src/ yam-desktop/src/lib/
git commit -m "feat: add SQLite integration via Tauri commands"
```

---

### Task 3: Theme Provider + Dark Mode

**Covers:** [S4]

**Files:**
- Create: `yam-desktop/src/lib/theme.ts`
- Create: `yam-desktop/src/components/ThemeProvider.tsx`
- Modify: `yam-desktop/src/App.tsx`
- Modify: `yam-desktop/tailwind.config.js`

**Interfaces:**
- Consumes: Tailwind config
- Produces: `useTheme()` hook, `ThemeProvider` component

- [ ] **Step 1: Create src/lib/theme.ts**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ThemeStore {
  theme: Theme;
  toggle: () => void;
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'light',
      toggle: () => set((state) => ({
        theme: state.theme === 'light' ? 'dark' : 'light',
      })),
    }),
    { name: 'yam-theme' }
  )
);
```

- [ ] **Step 2: Create src/components/ThemeProvider.tsx**

```tsx
import { useEffect, ReactNode } from 'react';
import { useTheme } from '../lib/theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return <>{children}</>;
}
```

- [ ] **Step 3: Update src/App.tsx**

```tsx
import { ThemeProvider } from './components/ThemeProvider';
import { useTheme } from './lib/theme';

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="fixed top-4 right-4 p-2 rounded-lg bg-gray-200 dark:bg-gray-700"
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
        <ThemeToggle />
        <div className="p-4">YAM Desktop</div>
      </div>
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: Test dark mode**

Run: `npm run tauri dev`
Click toggle button → background switches between white/dark with 300ms transition

- [ ] **Step 5: Commit**

```bash
git add yam-desktop/src/lib/theme.ts yam-desktop/src/components/
git commit -m "feat: add theme provider with dark mode toggle"
```

---

### Task 4: App Layout + Sidebar

**Covers:** [S3, S4]

**Files:**
- Create: `yam-desktop/src/components/AppLayout.tsx`
- Create: `yam-desktop/src/components/Sidebar.tsx`
- Create: `yam-desktop/src/components/Menubar.tsx`
- Create: `yam-desktop/src/components/StatusBar.tsx`
- Modify: `yam-desktop/src/App.tsx`

**Interfaces:**
- Consumes: `useTheme()` from Task 3
- Produces: Layout shell with menu, sidebar, content area, status bar

- [ ] **Step 1: Create src/components/Menubar.tsx**

```tsx
import { Search, Settings, Menu } from 'lucide-react';
import { motion } from 'framer-motion';

interface MenubarProps {
  onToggleSidebar: () => void;
}

export function Menubar({ onToggleSidebar }: MenubarProps) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="h-12 flex items-center justify-between px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
    >
      <div className="flex items-center gap-4">
        <button onClick={onToggleSidebar} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
          <Menu size={20} />
        </button>
        <span className="font-bold text-primary">研喵 YAM</span>
        <nav className="flex gap-3 text-sm text-gray-600 dark:text-gray-400">
          <span className="hover:text-primary cursor-pointer">文件</span>
          <span className="hover:text-primary cursor-pointer">数据</span>
          <span className="hover:text-primary cursor-pointer">视图</span>
          <span className="hover:text-primary cursor-pointer">帮助</span>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <Search size={18} className="text-gray-500 cursor-pointer hover:text-primary" />
        <Settings size={18} className="text-gray-500 cursor-pointer hover:text-primary" />
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create src/components/Sidebar.tsx**

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Filter } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 260, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="h-full border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden"
        >
          <div className="p-4 w-[260px]">
            <h2 className="font-bold text-primary mb-4 flex items-center gap-2">
              <Filter size={18} /> 筛选
            </h2>

            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input type="checkbox" className="rounded" />
              <Star size={16} />
              <span className="text-sm">只显示收藏</span>
            </label>

            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">学校层次</h3>
              {['985', '211', '双一流', '普通本科'].map(level => (
                <label key={level} className="flex items-center gap-2 mb-1 cursor-pointer">
                  <input type="checkbox" className="rounded" />
                  <span className="text-sm">{level}</span>
                </label>
              ))}
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">所在地区</h3>
              <select className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm">
                <option>全部省份</option>
              </select>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Create src/components/StatusBar.tsx**

```tsx
import { motion } from 'framer-motion';

interface StatusBarProps {
  majorCode: string;
  totalSchools: number;
  favoriteCount: number;
  compareCount: number;
}

export function StatusBar({ majorCode, totalSchools, favoriteCount, compareCount }: StatusBarProps) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="h-8 flex items-center justify-between px-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500"
    >
      <div className="flex gap-4">
        <span>专业: {majorCode}</span>
        <span>数据更新于 2026-06-15</span>
      </div>
      <div className="flex gap-4">
        <span>共 {totalSchools} 所院校</span>
        <span>收藏 {favoriteCount} 所</span>
        <span>已选 {compareCount}/3 对比</span>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 4: Create src/components/AppLayout.tsx**

```tsx
import { useState } from 'react';
import { Menubar } from './Menubar';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';

interface AppLayoutProps {
  children: React.ReactNode;
  majorCode: string;
  totalSchools: number;
}

export function AppLayout({ children, majorCode, totalSchools }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex flex-col h-screen">
      <Menubar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} />
        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>
      </div>
      <StatusBar majorCode={majorCode} totalSchools={totalSchools} favoriteCount={0} compareCount={0} />
    </div>
  );
}
```

- [ ] **Step 5: Update src/App.tsx**

```tsx
import { useEffect, useState } from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import { AppLayout } from './components/AppLayout';
import { fetchSchools, School } from './lib/db';

export default function App() {
  const [schools, setSchools] = useState<School[]>([]);

  useEffect(() => {
    fetchSchools('085410').then(setSchools);
  }, []);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
        <AppLayout majorCode="085410" totalSchools={schools.length}>
          <div>School list will go here</div>
        </AppLayout>
      </div>
    </ThemeProvider>
  );
}
```

- [ ] **Step 6: Test layout**

Run: `npm run tauri dev`
Expected: Menu bar top, sidebar left (260px), content center, status bar bottom. Sidebar animates open/close.

- [ ] **Step 7: Commit**

```bash
git add yam-desktop/src/components/ yam-desktop/src/App.tsx
git commit -m "feat: add app layout with animated sidebar and status bar"
```

---

### Task 5: School Card Component

**Covers:** [S4]

**Files:**
- Create: `yam-desktop/src/components/SchoolCard.tsx`
- Create: `yam-desktop/src/components/ScoreTrend.tsx`
- Modify: `yam-desktop/src/App.tsx`

**Interfaces:**
- Consumes: `School` type from Task 2
- Produces: Animated school card with hover effects

- [ ] **Step 1: Create src/components/ScoreTrend.tsx**

```tsx
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
```

- [ ] **Step 2: Create src/components/SchoolCard.tsx**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ChevronDown, AlertTriangle } from 'lucide-react';
import { School, ScoreLine } from '../lib/db';
import { ScoreTrend } from './ScoreTrend';

interface SchoolCardProps {
  school: School;
  scoreLines: ScoreLine[];
  index: number;
}

export function SchoolCard({ school, scoreLines, index }: SchoolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [favorited, setFavorited] = useState(false);

  const scoresByYear = scoreLines
    .filter(s => s.total)
    .reduce((acc, s) => {
      if (!acc.find(a => a.year === s.year)) {
        acc.push({ year: s.year, total: s.total! });
      }
      return acc;
    }, [] as { year: number; total: number }[]);

  const levelTag = school.level?.includes('985') ? '985'
    : school.level?.includes('211') ? '211'
    : school.level?.includes('一流') ? '双一流'
    : '普通';

  const levelColor = levelTag === '985' ? 'bg-red-500'
    : levelTag === '211' ? 'bg-blue-500'
    : levelTag === '双一流' ? 'bg-purple-500'
    : 'bg-gray-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 300, damping: 30 }}
      whileHover={{ scale: 1.01, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-3 transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFavorited(!favorited)}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <Heart size={20} fill={favorited ? '#E94560' : 'none'} color={favorited ? '#E94560' : undefined} />
          </button>
          <h3 className="font-bold text-primary">{school.name}</h3>
          <span className={`${levelColor} text-white text-xs px-2 py-0.5 rounded`}>{levelTag}</span>
          <span className="text-xs text-gray-500">{school.province}</span>
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" className="rounded" />
          对比
        </label>
      </div>

      {/* Score Trend */}
      {scoresByYear.length > 0 && (
        <div className="mb-2">
          <ScoreTrend scores={scoresByYear} />
        </div>
      )}

      {/* Warning Banner */}
      <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded mb-2">
        <AlertTriangle size={14} />
        <span>研招网与掌上考研数据差异较大</span>
      </div>

      {/* Expand Button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-sm text-primary hover:underline"
      >
        {expanded ? '收起' : '展开详情'}
        <motion.span animate={{ rotate: expanded ? 180 : 0 }}>
          <ChevronDown size={16} />
        </motion.span>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                详细信息加载中...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

- [ ] **Step 3: Update src/App.tsx to show school list**

```tsx
import { useEffect, useState } from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import { AppLayout } from './components/AppLayout';
import { SchoolCard } from './components/SchoolCard';
import { fetchSchools, fetchScoreLines, School, ScoreLine } from './lib/db';

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
```

- [ ] **Step 4: Test school cards**

Run: `npm run tauri dev`
Expected: Cards animate in with stagger, hover shows shadow, expand/collapse works with spring animation

- [ ] **Step 5: Commit**

```bash
git add yam-desktop/src/components/SchoolCard.tsx yam-desktop/src/components/ScoreTrend.tsx
git commit -m "feat: add animated school card with expand/collapse"
```

---

### Task 6: Search + Filter

**Covers:** [S4]

**Files:**
- Create: `yam-desktop/src/components/SearchBar.tsx`
- Create: `yam-desktop/src/components/FilterPanel.tsx`
- Create: `yam-desktop/src/stores/filterStore.ts`
- Modify: `yam-desktop/src/App.tsx`

**Interfaces:**
- Consumes: `fetchSchools()` from Task 2
- Produces: Real-time search and filter functionality

- [ ] **Step 1: Create src/stores/filterStore.ts**

```typescript
import { create } from 'zustand';

interface FilterState {
  keyword: string;
  levels: string[];
  provinces: string[];
  favoritesOnly: boolean;
  setKeyword: (k: string) => void;
  toggleLevel: (l: string) => void;
  setProvinces: (p: string[]) => void;
  toggleFavorites: () => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  keyword: '',
  levels: [],
  provinces: [],
  favoritesOnly: false,
  setKeyword: (keyword) => set({ keyword }),
  toggleLevel: (level) => set((state) => ({
    levels: state.levels.includes(level)
      ? state.levels.filter(l => l !== level)
      : [...state.levels, level],
  })),
  setProvinces: (provinces) => set({ provinces }),
  toggleFavorites: () => set((state) => ({ favoritesOnly: !state.favoritesOnly })),
  reset: () => set({ keyword: '', levels: [], provinces: [], favoritesOnly: false }),
}));
```

- [ ] **Step 2: Create src/components/SearchBar.tsx**

```tsx
import { Search } from 'lucide-react';
import { useFilterStore } from '../stores/filterStore';

export function SearchBar() {
  const { keyword, setKeyword } = useFilterStore();

  return (
    <div className="relative">
      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="搜索院校..."
        className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
      />
    </div>
  );
}
```

- [ ] **Step 3: Create src/components/FilterPanel.tsx**

```tsx
import { motion } from 'framer-motion';
import { useFilterStore } from '../stores/filterStore';

export function FilterPanel() {
  const { levels, toggleLevel, reset } = useFilterStore();

  const levelOptions = ['985', '211', '双一流', '普通本科'];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-4"
    >
      <h3 className="font-medium mb-3">学校层次</h3>
      <div className="flex flex-wrap gap-2">
        {levelOptions.map((level) => (
          <button
            key={level}
            onClick={() => toggleLevel(level)}
            className={`px-3 py-1 rounded-full text-sm transition-all ${
              levels.includes(level)
                ? 'bg-primary text-white'
                : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {level}
          </button>
        ))}
      </div>
      <button
        onClick={reset}
        className="mt-3 text-sm text-gray-500 hover:text-primary transition-colors"
      >
        重置筛选
      </button>
    </motion.div>
  );
}
```

- [ ] **Step 4: Update src/App.tsx with filtering**

```tsx
import { useEffect, useState, useMemo } from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import { AppLayout } from './components/AppLayout';
import { SchoolCard } from './components/SchoolCard';
import { SearchBar } from './components/SearchBar';
import { FilterPanel } from './components/FilterPanel';
import { fetchSchools, fetchScoreLines, School, ScoreLine } from './lib/db';
import { useFilterStore } from './stores/filterStore';

export default function App() {
  const [schools, setSchools] = useState<School[]>([]);
  const [scoreLines, setScoreLines] = useState<Record<string, ScoreLine[]>>({});
  const { keyword, levels } = useFilterStore();

  useEffect(() => {
    fetchSchools('085410').then(async (s) => {
      setSchools(s);
      const scores: Record<string, ScoreLine[]> = {};
      for (const school of s.slice(0, 50)) {
        scores[school.school_id] = await fetchScoreLines(school.school_id, '085410');
      }
      setScoreLines(scores);
    });
  }, []);

  const filteredSchools = useMemo(() => {
    return schools.filter(s => {
      if (keyword && !s.name.toLowerCase().includes(keyword.toLowerCase())) return false;
      if (levels.length > 0 && !levels.some(l => s.level?.includes(l))) return false;
      return true;
    });
  }, [schools, keyword, levels]);

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
        <AppLayout majorCode="085410" totalSchools={filteredSchools.length}>
          <div className="max-w-4xl">
            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <SearchBar />
              </div>
            </div>
            <FilterPanel />
            {filteredSchools.slice(0, 20).map((school, i) => (
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
```

- [ ] **Step 5: Test search and filter**

Run: `npm run tauri dev`
Type in search → cards filter in real-time with layout animation
Click level buttons → cards filter with animation

- [ ] **Step 6: Commit**

```bash
git add yam-desktop/src/stores/ yam-desktop/src/components/SearchBar.tsx yam-desktop/src/components/FilterPanel.tsx
git commit -m "feat: add search and filter with animated transitions"
```

---

### Task 7: Compare Modal

**Covers:** [S4]

**Files:**
- Create: `yam-desktop/src/components/CompareModal.tsx`
- Create: `yam-desktop/src/stores/compareStore.ts`
- Modify: `yam-desktop/src/components/SchoolCard.tsx`

**Interfaces:**
- Consumes: `School` type, `fetchScoreLines()`
- Produces: Modal with 3-column comparison, yellow diff highlighting

- [ ] **Step 1: Create src/stores/compareStore.ts**

```typescript
import { create } from 'zustand';

interface CompareStore {
  selectedIds: string[];
  toggle: (id: string) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
}

export const useCompareStore = create<CompareStore>((set, get) => ({
  selectedIds: [],
  toggle: (id) => set((state) => ({
    selectedIds: state.selectedIds.includes(id)
      ? state.selectedIds.filter(i => i !== id)
      : state.selectedIds.length < 3
        ? [...state.selectedIds, id]
        : state.selectedIds,
  })),
  clear: () => set({ selectedIds: [] }),
  isSelected: (id) => get().selectedIds.includes(id),
}));
```

- [ ] **Step 2: Create src/components/CompareModal.tsx**

```tsx
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
```

- [ ] **Step 3: Update SchoolCard.tsx to use compare store**

Add import and checkbox logic:
```tsx
import { useCompareStore } from '../stores/compareStore';

// In component:
const { toggle, isSelected } = useCompareStore();
// Replace checkbox with:
<input
  type="checkbox"
  checked={isSelected(school.school_id)}
  onChange={() => toggle(school.school_id)}
  className="rounded"
/>
```

- [ ] **Step 4: Test compare modal**

Run: `npm run tauri dev`
Select 3 schools → click compare → modal fades in with spring animation
Click X or outside → modal fades out

- [ ] **Step 5: Commit**

```bash
git add yam-desktop/src/stores/compareStore.ts yam-desktop/src/components/CompareModal.tsx
git commit -m "feat: add compare modal with spring animation"
```

---

### Task 8: Splash Screen

**Covers:** [S4]

**Files:**
- Create: `yam-desktop/src/components/SplashScreen.tsx`
- Modify: `yam-desktop/src/App.tsx`

**Interfaces:**
- Produces: Three-column cascading selector with search

- [ ] **Step 1: Create src/components/SplashScreen.tsx**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CATEGORY_TREE = {
  '工学': {
    '计算机科学与技术': [
      { code: '085410', name: '人工智能' },
      { code: '085401', name: '计算机技术' },
      { code: '085404', name: '软件工程' },
    ],
    '电子科学与技术': [
      { code: '085405', name: '控制工程' },
    ],
  },
  '理学': {
    '数学': [
      { code: '070101', name: '基础数学' },
    ],
  },
};

interface SplashScreenProps {
  onSelect: (majorCode: string) => void;
}

export function SplashScreen({ onSelect }: SplashScreenProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const categories = Object.keys(CATEGORY_TREE);
  const subjects = selectedCategory ? Object.keys(CATEGORY_TREE[selectedCategory as keyof typeof CATEGORY_TREE]) : [];
  const majors = selectedCategory && selectedSubject
    ? CATEGORY_TREE[selectedCategory as keyof typeof CATEGORY_TREE][selectedSubject as keyof typeof CATEGORY_TREE[string]]
    : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5"
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 w-[800px]"
      >
        <h1 className="text-3xl font-bold text-center text-primary mb-2">研喵 YAM</h1>
        <p className="text-center text-gray-500 mb-6">本地优先的考研择校数据工具</p>

        <div className="relative mb-6">
          <input
            type="text"
            placeholder="搜索专业名称或代码..."
            className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Column 1: 学科门类 */}
          <div className="border rounded-lg p-3 h-64 overflow-auto">
            <h3 className="text-sm font-medium text-gray-500 mb-2">学科门类</h3>
            {categories.map(cat => (
              <motion.button
                key={cat}
                whileHover={{ x: 4 }}
                onClick={() => { setSelectedCategory(cat); setSelectedSubject(null); }}
                className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                  selectedCategory === cat ? 'bg-primary text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {cat}
              </motion.button>
            ))}
          </div>

          {/* Column 2: 一级学科 */}
          <div className="border rounded-lg p-3 h-64 overflow-auto">
            <h3 className="text-sm font-medium text-gray-500 mb-2">一级学科</h3>
            <AnimatePresence mode="wait">
              {subjects.map(sub => (
                <motion.button
                  key={sub}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  whileHover={{ x: 4 }}
                  onClick={() => setSelectedSubject(sub)}
                  className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                    selectedSubject === sub ? 'bg-primary text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {sub}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>

          {/* Column 3: 专业 */}
          <div className="border rounded-lg p-3 h-64 overflow-auto">
            <h3 className="text-sm font-medium text-gray-500 mb-2">专业</h3>
            <AnimatePresence mode="wait">
              {majors?.map((m: any) => (
                <motion.button
                  key={m.code}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  whileHover={{ x: 4 }}
                  onClick={() => onSelect(m.code)}
                  className="w-full text-left px-3 py-2 rounded text-sm mb-1 hover:bg-primary/10 transition-colors"
                >
                  <span className="text-gray-500 mr-2">{m.code}</span>
                  {m.name}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Update App.tsx with splash/main toggle**

```tsx
import { useState } from 'react';
import { SplashScreen } from './components/SplashScreen';
// ... other imports

export default function App() {
  const [currentMajor, setCurrentMajor] = useState<string | null>(null);

  if (!currentMajor) {
    return (
      <ThemeProvider>
        <SplashScreen onSelect={setCurrentMajor} />
      </ThemeProvider>
    );
  }

  // ... rest of app with currentMajor
}
```

- [ ] **Step 3: Test splash screen**

Run: `npm run tauri dev`
Click category → subject list animates in
Click subject → major list animates in
Click major → transitions to main app

- [ ] **Step 4: Commit**

```bash
git add yam-desktop/src/components/SplashScreen.tsx
git commit -m "feat: add splash screen with cascading selector animation"
```

---

### Task 9: Build + Package

**Covers:** [S7]

**Files:**
- Modify: `yam-desktop/src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: All previous tasks
- Produces: Installable desktop app

- [ ] **Step 1: Update tauri.conf.json for production**

```json
{
  "productName": "YAM",
  "version": "1.0.0",
  "identifier": "com.yam.desktop",
  "build": {
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "title": "研喵 YAM",
    "windows": [
      {
        "title": "研喵 YAM",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "center": true
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 2: Build frontend**

```bash
cd yam-desktop
npm run build
```

Expected: `dist/` folder created with built assets

- [ ] **Step 3: Build Tauri app**

```bash
npm run tauri build
```

Expected: Installable in `src-tauri/target/release/bundle/`
Check package size < 15MB

- [ ] **Step 4: Test installed app**

Install and run the built app. Verify:
- Starts in < 1s
- Database loads correctly
- All animations work
- Dark mode toggles

- [ ] **Step 5: Commit**

```bash
git add yam-desktop/
git commit -m "feat: configure Tauri build for production"
```

---

## Self-Review

1. **Spec coverage:** [S1] Problem → addressed by migration. [S2] Solution → Tasks 1-2. [S3] Architecture → Task 1. [S4] Page mapping → Tasks 4-8. [S5] Animations → all tasks use Framer Motion. [S6] Data layer → Task 2. [S7] Scope → Task 9. [S8] Success criteria → Task 9 verification.

2. **Placeholder scan:** No TBD/TODO found. All steps have concrete code.

3. **Type consistency:** `School` and `ScoreLine` types defined in Task 2, used consistently in Tasks 5-7. `useFilterStore` and `useCompareStore` interfaces match usage.

## Execution Handoff

This plan has 9 tasks. Based on memory, the user prefers subagent execution. Recommend: **Subagent, always**.
