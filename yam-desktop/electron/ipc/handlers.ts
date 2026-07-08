import { ipcMain } from 'electron';
import { getSchools, getSchoolDetail, getStats } from '../database/schools';
import { addFavorite, removeFavorite, getFavorites, isFavorite } from '../database/favorites';
import type { FilterParams } from '../../shared/types';

export function setupIPC(): void {
  // Schools
  ipcMain.handle('get-schools', async (_event, majorCode: string, filters?: FilterParams) => {
    return getSchools(majorCode, filters);
  });

  ipcMain.handle('get-school-detail', async (_event, schoolId: string, majorCode: string) => {
    return getSchoolDetail(schoolId, majorCode);
  });

  // Favorites
  ipcMain.handle('add-favorite', async (_event, schoolId: string, majorCode: string) => {
    addFavorite(schoolId, majorCode);
  });

  ipcMain.handle('remove-favorite', async (_event, schoolId: string, majorCode: string) => {
    removeFavorite(schoolId, majorCode);
  });

  ipcMain.handle('get-favorites', async (_event, majorCode: string) => {
    return getFavorites(majorCode);
  });

  ipcMain.handle('is-favorite', async (_event, schoolId: string, majorCode: string) => {
    return isFavorite(schoolId, majorCode);
  });

  // Stats
  ipcMain.handle('get-stats', async (_event, majorCode: string) => {
    return getStats(majorCode);
  });

  // Theme
  ipcMain.handle('get-theme', async () => {
    // TODO: Implement theme persistence
    return 'light';
  });

  ipcMain.handle('set-theme', async (_event, theme: string) => {
    // TODO: Implement theme persistence
    console.log('Theme set to:', theme);
  });
}
