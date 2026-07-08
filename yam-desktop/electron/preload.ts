import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// Custom APIs for renderer
const api = {
  // Schools
  getSchools: (majorCode: string, filters?: any) =>
    ipcRenderer.invoke('get-schools', majorCode, filters),
  getSchoolDetail: (schoolId: string, majorCode: string) =>
    ipcRenderer.invoke('get-school-detail', schoolId, majorCode),

  // Favorites
  addFavorite: (schoolId: string, majorCode: string) =>
    ipcRenderer.invoke('add-favorite', schoolId, majorCode),
  removeFavorite: (schoolId: string, majorCode: string) =>
    ipcRenderer.invoke('remove-favorite', schoolId, majorCode),
  getFavorites: (majorCode: string) =>
    ipcRenderer.invoke('get-favorites', majorCode),
  isFavorite: (schoolId: string, majorCode: string) =>
    ipcRenderer.invoke('is-favorite', schoolId, majorCode),

  // Stats
  getStats: (majorCode: string) =>
    ipcRenderer.invoke('get-stats', majorCode),

  // Theme
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme: string) => ipcRenderer.invoke('set-theme', theme),
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
