import { getDatabase } from './index';

export function addFavorite(schoolId: string, majorCode: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT OR REPLACE INTO favorites (school_id, major_code, created_at)
    VALUES (?, ?, ?)
  `).run(schoolId, majorCode, now);
}

export function removeFavorite(schoolId: string, majorCode: string): void {
  const db = getDatabase();
  
  db.prepare(`
    DELETE FROM favorites WHERE school_id = ? AND major_code = ?
  `).run(schoolId, majorCode);
}

export function getFavorites(majorCode: string): string[] {
  const db = getDatabase();
  
  const rows = db.prepare(`
    SELECT school_id FROM favorites
    WHERE major_code = ?
    ORDER BY created_at DESC
  `).all(majorCode) as any[];
  
  return rows.map(row => row.school_id);
}

export function isFavorite(schoolId: string, majorCode: string): boolean {
  const db = getDatabase();
  
  const row = db.prepare(`
    SELECT 1 FROM favorites WHERE school_id = ? AND major_code = ?
  `).get(schoolId, majorCode);
  
  return row !== undefined;
}
