import { MOCK_SCHOOLS, getMockScoreLines } from '../data/mock-schools';

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

// Check if running in Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

export async function fetchSchools(majorCode: string): Promise<School[]> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('fetch_schools', { majorCode });
  }
  // Mock data for browser testing
  return MOCK_SCHOOLS;
}

export async function fetchScoreLines(
  schoolId: string,
  majorCode: string
): Promise<ScoreLine[]> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('fetch_score_lines', { schoolId, majorCode });
  }
  // Mock data for browser testing
  return getMockScoreLines(schoolId);
}
