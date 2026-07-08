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

export async function fetchScoreLines(
  schoolId: string,
  majorCode: string
): Promise<ScoreLine[]> {
  return invoke('fetch_score_lines', { schoolId, majorCode });
}
