// Shared types for YAM Desktop Application

export interface School {
  school_id: string;
  name: string;
  province: string | null;
  level: string | null;
  major_code: string;
  is_favorite?: boolean;
}

export interface Department {
  id: number;
  department_id: string;
  school_id: string;
  major_code: string;
  name: string;
  research_direction: string | null;
  enrollment_count: number | null;
  enrollment_text: string | null;
  exam_subjects: string | null;
  exam_type: string | null;
  advisor: string | null;
  source: string | null;
  updated_at: string | null;
}

export interface ScoreLine {
  school_id: string;
  department_id: string;
  major_code: string;
  year: number;
  total: number | null;
  politics: number | null;
  english: number | null;
  special_one: number | null;
  special_two: number | null;
  note: string | null;
  source: string | null;
  updated_at: string | null;
}

export interface AdmissionPlan {
  id: number;
  school_id: string;
  department_id: string;
  major_code: string;
  year: number;
  plan_id: string | null;
  spe_id: string | null;
  department_name: string | null;
  research_direction: string | null;
  exam_subjects: string | null;
  reference_books: string | null;
  enrollment_count: number | null;
  note: string | null;
  source: string | null;
  updated_at: string | null;
}

export interface SchoolDetail {
  school: School;
  departments: Department[];
  score_lines: ScoreLine[];
  admission_plans: AdmissionPlan[];
}

export interface FilterParams {
  keyword?: string;
  levels?: string[];
  provinces?: string[];
  min_plan?: number;
  max_plan?: number;
  sort?: 'name' | 'province' | 'level';
  favorites_only?: boolean;
}

export interface DashboardStats {
  total_schools: number;
  favorite_count: number;
  last_update: string | null;
}

export interface Major {
  code: string;
  name: string;
  category_code: string;
  category_name: string;
  enabled: boolean;
}

// IPC API interface
export interface ElectronAPI {
  // Schools
  getSchools: (majorCode: string, filters?: FilterParams) => Promise<School[]>;
  getSchoolDetail: (schoolId: string, majorCode: string) => Promise<SchoolDetail>;
  
  // Favorites
  addFavorite: (schoolId: string, majorCode: string) => Promise<void>;
  removeFavorite: (schoolId: string, majorCode: string) => Promise<void>;
  getFavorites: (majorCode: string) => Promise<string[]>;
  isFavorite: (schoolId: string, majorCode: string) => Promise<boolean>;
  
  // Stats
  getStats: (majorCode: string) => Promise<DashboardStats>;
  
  // Majors
  getMajors: () => Promise<Major[]>;
  
  // Theme
  getTheme: () => Promise<'light' | 'dark' | 'system'>;
  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
