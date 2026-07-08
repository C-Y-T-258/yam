import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { setupIPC } from './ipc/handlers';
import { closeDatabase } from './database';

// The built directory structure
// ├─┬─┬ dist
// │ └─ index.html
// │ └─┬ dist-electron
// │   ├─ main.js
// │   └─ preload.js
process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let win: BrowserWindow | null;
// const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

const preload = path.join(__dirname, 'preload.js');

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, 'electron-vite.svg'),
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration is security risk
      // nodeIntegration: true,
      // contextIsolation: false,
    },
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '研喵 YAM - 考研择校',
    // Frame: false, // Uncomment for custom title bar
  });

  // Setup IPC handlers
  setupIPC();

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }

  // HMR for renderer based on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST!, 'index.html'));
  }
}

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  closeDatabase();
});

app.whenReady().then(createWindow);
