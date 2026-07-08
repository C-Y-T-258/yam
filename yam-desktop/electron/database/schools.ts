import { getDatabase } from './index';
import type { School, SchoolDetail, FilterParams } from '../../shared/types';

export function getSchools(majorCode: string, filters?: FilterParams): School[] {
  const db = getDatabase();
  
  let query = `
    SELECT 
      s.school_id,
      s.name,
      s.province,
      s.level,
      s.major_code,
      CASE WHEN f.school_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
    FROM schools s
    LEFT JOIN favorites f ON s.school_id = f.school_id AND s.major_code = f.major_code
    WHERE s.major_code = ?
  `;
  
  const params: any[] = [majorCode];
  
  // Apply filters
  if (filters) {
    if (filters.keyword) {
      query += ` AND s.name LIKE ?`;
      params.push(`%${filters.keyword}%`);
    }
    
    if (filters.levels && filters.levels.length > 0) {
      const levelConditions = filters.levels.map(level => {
        if (level === '985') return "s.level LIKE '%985%'";
        if (level === '211') return "s.level LIKE '%211%'";
        if (level === '一流') return "s.level LIKE '%一流%'";
        if (level === '普通') return "s.level IS NULL OR s.level = ''";
        return "1=0";
      });
      query += ` AND (${levelConditions.join(' OR ')})`;
    }
    
    if (filters.provinces && filters.provinces.length > 0) {
      const placeholders = filters.provinces.map(() => '?').join(',');
      query += ` AND s.province IN (${placeholders})`;
      params.push(...filters.provinces);
    }
    
    if (filters.favorites_only) {
      query += ` AND f.school_id IS NOT NULL`;
    }
  }
  
  // Apply sorting
  const sortField = filters?.sort || 'name';
  if (sortField === 'name') {
    query += ` ORDER BY s.name ASC`;
  } else if (sortField === 'province') {
    query += ` ORDER BY s.province ASC, s.name ASC`;
  } else if (sortField === 'level') {
    query += ` ORDER BY s.level DESC, s.name ASC`;
  }
  
  const rows = db.prepare(query).all(...params) as any[];
  
  return rows.map(row => ({
    school_id: row.school_id,
    name: row.name,
    province: row.province,
    level: row.level,
    major_code: row.major_code,
    is_favorite: row.is_favorite === 1,
  }));
}

export function getSchoolDetail(schoolId: string, majorCode: string): SchoolDetail | null {
  const db = getDatabase();
  
  // Get school info
  const school = db.prepare(`
    SELECT 
      s.school_id,
      s.name,
      s.province,
      s.level,
      s.major_code,
      CASE WHEN f.school_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
    FROM schools s
    LEFT JOIN favorites f ON s.school_id = f.school_id AND s.major_code = f.major_code
    WHERE s.school_id = ? AND s.major_code = ?
  `).get(schoolId, majorCode) as any;
  
  if (!school) return null;
  
  // Get departments
  const departments = db.prepare(`
    SELECT * FROM departments
    WHERE school_id = ? AND major_code = ?
    ORDER BY name
  `).all(schoolId, majorCode);
  
  // Get score lines
  const score_lines = db.prepare(`
    SELECT * FROM score_lines
    WHERE school_id = ? AND major_code = ?
    ORDER BY year DESC
  `).all(schoolId, majorCode);
  
  // Get admission plans
  const admission_plans = db.prepare(`
    SELECT * FROM admission_plans
    WHERE school_id = ? AND major_code = ?
    ORDER BY year DESC
  `).all(schoolId, majorCode);
  
  return {
    school: {
      school_id: school.school_id,
      name: school.name,
      province: school.province,
      level: school.level,
      major_code: school.major_code,
      is_favorite: school.is_favorite === 1,
    },
    departments: departments as any[],
    score_lines: score_lines as any[],
    admission_plans: admission_plans as any[],
  };
}

export function getStats(majorCode: string) {
  const db = getDatabase();
  
  const schoolCount = db.prepare(`
    SELECT COUNT(*) as count FROM schools WHERE major_code = ?
  `).get(majorCode) as any;
  
  const favoriteCount = db.prepare(`
    SELECT COUNT(*) as count FROM favorites WHERE major_code = ?
  `).get(majorCode) as any;
  
  const lastUpdate = db.prepare(`
    SELECT MAX(updated_at) as last_update FROM schools WHERE major_code = ?
  `).get(majorCode) as any;
  
  return {
    total_schools: schoolCount?.count || 0,
    favorite_count: favoriteCount?.count || 0,
    last_update: lastUpdate?.last_update || null,
  };
}
