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

export interface WorkspaceSchool {
  school_id: string;
  major_code: string;
  name: string;
  province: string;
  level: string;
  min_score: number;
  enroll_count: number;
  self_scoring: boolean;
  doctoral_program: boolean;
  double_first_class: boolean;
  school_code: string;
  province_code: string;
  is_985: boolean;
  is_211: boolean;
  display_order: number;
}

export interface WorkspaceYear {
  year: number;
  enroll_count: number;
  min_score: number;
  politics: number;
  english: number;
  math: number;
  specialized: number;
}

export interface WorkspaceDepartment {
  department_id: number;
  school_id: string;
  major_code: string;
  name: string;
  research_direction: string;
  exam_subjects: string[];
  study_mode: string;
  exam_type: string;
  special_plans: string[];
  years: WorkspaceYear[];
}

export interface WorkspaceData {
  schools: WorkspaceSchool[];
  departments: WorkspaceDepartment[];
}

// ISSUE-027 阶段 2：招生计划视图扁平行。每行 = (院校, 专业, 院系, 方向, 考试科目, 最新年份分数线)。
export interface WorkspacePlanRow {
  // 院校级
  school_id: string;
  school_code: string;
  school_name: string;
  province: string;
  level: string;
  is_985: boolean;
  is_211: boolean;
  double_first_class: boolean;
  self_scoring: boolean;
  doctoral_program: boolean;
  display_order: number;
  // 专业级
  major_code: string;
  // 院系级
  department_id: number;
  department_name: string;
  research_direction: string;
  exam_subjects: string[];
  study_mode: string;
  exam_type: string;
  special_plans: string[];
  // 最新年份分数
  latest_year: number;
  latest_min_score: number;
  latest_enroll_count: number;
  // 多年（展开用）
  years: WorkspaceYear[];
}

export interface FilterOptions {
  provinces: string[];
  region_groups: string[];
  levels: string[];
  level_tags: string[];
  study_modes: string[];
  exam_types: string[];
  special_plans: string[];
  foreign_subjects: string[];
  business_one_subjects: string[];
  business_two_subjects: string[];
  has_self_scoring: boolean;
  has_doctoral: boolean;
  has_double_first_class: boolean;
  has_self_scoring_tag: boolean;
  has_research_institute: boolean;
}

export interface AvailableMajor {
  major_code: string;
  school_count: number;
}

export async function fetchAvailableMajors(): Promise<AvailableMajor[]> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('fetch_available_majors');
  }
  return [
    { major_code: '085410', school_count: 217 },
    { major_code: '085400', school_count: 10 },
  ];
}

export interface FavoriteDepartment {
  name: string;
  study_mode: string;
  exam_type: string;
  exam_subjects: string[];
  special_plans: string[];
  years: Array<{
    english: number;
    math: number;
    specialized: number;
  }>;
}

export interface Favorite {
  school_id: string;
  major_code: string;
  major_name: string;
  name: string;
  province: string;
  level: string;
  min_score: number;
  enroll_count: number;
  created_at: number;
  self_scoring: boolean;
  doctoral_program: boolean;
  double_first_class: boolean;
  departments: FavoriteDepartment[];
}

export interface RecentView {
  school_id: string;
  major_code: string;
  major_name: string;
  name: string;
  province: string;
  level: string;
  viewed_at: number;
}

export const isTauri =
  typeof window !== 'undefined' &&
  !!(window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;

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

export interface WorkspaceFilters {
  province?: string;
  provinces?: string[];
  regionGroup?: '一区' | '二区';
  levels?: string[];
  sortBy?: 'min_score' | 'enroll_count' | 'name' | 'default' | 'school_code';
  sortOrder?: 'asc' | 'desc';
  minScoreMin?: number;
  minScoreMax?: number;
  enrollCountMin?: number;
  enrollCountMax?: number;
  departmentName?: string;
  studyModes?: string[];
  examTypes?: string[];
  selfScoring?: boolean;
  doctoralProgram?: boolean;
  doubleFirstClass?: boolean;
  specialPlans?: string[];
  englishMin?: number;
  englishMax?: number;
  businessOneMin?: number;
  businessOneMax?: number;
  businessTwoMin?: number;
  businessTwoMax?: number;
  foreignSubjects?: string[];
  businessOneSubjects?: string[];
  businessTwoSubjects?: string[];
}

export const REGION_ONE_PROVINCES = [
  '北京', '天津', '河北', '山西', '辽宁', '吉林', '黑龙江',
  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南', '广东', '重庆', '四川', '陕西',
];

export const REGION_TWO_PROVINCES = [
  '内蒙古', '广西', '海南', '贵州', '云南', '西藏',
  '甘肃', '青海', '宁夏', '新疆',
];

export function classifyExamSubjects(subjects: string[]) {
  const foreign: string[] = [];
  const businessOne: string[] = [];
  const businessTwo: string[] = [];
  for (const s of subjects) {
    const isPolitics = s.includes('政治') || s.includes('思想');
    const isMath = s.includes('数学');
    const isForeign = !isPolitics && !isMath && (
      s.includes('英语') || s.includes('日语') || s.includes('俄语')
      || s.includes('法语') || s.includes('德语') || s.includes('外语')
    );
    if (isForeign && !foreign.includes(s)) {
      foreign.push(s);
    } else if (isMath && !businessOne.includes(s)) {
      businessOne.push(s);
    } else if (!isPolitics && !isForeign && !isMath && !businessTwo.includes(s)) {
      businessTwo.push(s);
    }
  }
  foreign.sort();
  businessOne.sort();
  businessTwo.sort();
  return { foreign, businessOne, businessTwo };
}

export function extractLevelTags(levels: string[]) {
  const tags: string[] = [];
  for (const level of levels) {
    for (const part of level.split(/[/ 、，]/)) {
      const trimmed = part.trim();
      if (trimmed && !tags.includes(trimmed)) {
        tags.push(trimmed);
      }
    }
  }
  tags.sort();
  return tags;
}

export function isResearchInstitute(name: string) {
  return ['研究院', '研究所', '科学院', '研究生院'].some((pat) => name.includes(pat));
}

export interface FilterableFavorite {
  name: string;
  province: string;
  level: string;
  min_score: number;
  enroll_count: number;
  self_scoring: boolean;
  doctoral_program: boolean;
  double_first_class: boolean;
  departments: FavoriteDepartment[];
}

export function applyWorkspaceFilters<T extends FilterableFavorite>(
  items: T[],
  filters: WorkspaceFilters
): T[] {
  let result = [...items];

  // Province / region
  if (filters.provinces && filters.provinces.length > 0) {
    result = result.filter((item) => filters.provinces!.includes(item.province));
  } else if (filters.regionGroup) {
    const regionProvinces = filters.regionGroup === '一区' ? REGION_ONE_PROVINCES : REGION_TWO_PROVINCES;
    result = result.filter((item) => regionProvinces.includes(item.province));
  } else if (filters.province) {
    result = result.filter((item) => item.province === filters.province);
  }

  if (filters.levels && filters.levels.length > 0) {
    result = result.filter((item) =>
      filters.levels!.some((tag) => {
        if (tag === '自划线') return item.self_scoring;
        if (tag === '科研院所') return isResearchInstitute(item.name);
        if (tag === '博士点') return item.doctoral_program;
        if (tag === '985') return (item as WorkspaceSchool).is_985 === true;
        if (tag === '211') return (item as WorkspaceSchool).is_211 === true;
        if (tag === '双一流') return item.double_first_class;
        return item.level.includes(tag);
      })
    );
  }

  if (filters.minScoreMin !== undefined) {
    result = result.filter((item) => item.min_score >= filters.minScoreMin!);
  }
  if (filters.minScoreMax !== undefined) {
    result = result.filter((item) => item.min_score <= filters.minScoreMax!);
  }
  if (filters.enrollCountMin !== undefined) {
    result = result.filter((item) => item.enroll_count >= filters.enrollCountMin!);
  }
  if (filters.enrollCountMax !== undefined) {
    result = result.filter((item) => item.enroll_count <= filters.enrollCountMax!);
  }

  if (filters.selfScoring) {
    result = result.filter((item) => item.self_scoring);
  }
  if (filters.doctoralProgram) {
    result = result.filter((item) => item.doctoral_program);
  }
  if (filters.doubleFirstClass) {
    result = result.filter((item) => item.double_first_class);
  }

  if (filters.departmentName) {
    const keyword = filters.departmentName.toLowerCase();
    result = result.filter((item) =>
      item.departments.some((d) => d.name.toLowerCase().includes(keyword))
    );
  }

  if (filters.studyModes && filters.studyModes.length > 0) {
    result = result.filter((item) =>
      item.departments.some((d) =>
        filters.studyModes!.some((mode) =>
          (',' + d.study_mode + ',').includes(',' + mode + ',')
        )
      )
    );
  }

  if (filters.examTypes && filters.examTypes.length > 0) {
    result = result.filter((item) =>
      item.departments.some((d) =>
        filters.examTypes!.some((type) =>
          (',' + d.exam_type + ',').includes(',' + type + ',')
        )
      )
    );
  }

  if (filters.specialPlans && filters.specialPlans.length > 0) {
    result = result.filter((item) =>
      item.departments.some((d) =>
        filters.specialPlans!.some((plan) => d.special_plans.includes(plan))
      )
    );
  }

  // Exam subject filters (multi-select)
  if (filters.foreignSubjects && filters.foreignSubjects.length > 0) {
    result = result.filter((item) =>
      item.departments.some((d) =>
        filters.foreignSubjects!.some((subject) => d.exam_subjects.includes(subject))
      )
    );
  }
  if (filters.businessOneSubjects && filters.businessOneSubjects.length > 0) {
    result = result.filter((item) =>
      item.departments.some((d) =>
        filters.businessOneSubjects!.some((subject) => d.exam_subjects.includes(subject))
      )
    );
  }
  if (filters.businessTwoSubjects && filters.businessTwoSubjects.length > 0) {
    result = result.filter((item) =>
      item.departments.some((d) =>
        filters.businessTwoSubjects!.some((subject) => d.exam_subjects.includes(subject))
      )
    );
  }

  const subjectInRange = (
    item: T,
    field: 'english' | 'math' | 'specialized',
    min: number | undefined,
    max: number | undefined
  ) => {
    return item.departments.some((d) =>
      d.years.some((y) => {
        const value = y[field];
        if (min !== undefined && value < min) return false;
        if (max !== undefined && value > max) return false;
        return true;
      })
    );
  };

  if (filters.englishMin !== undefined || filters.englishMax !== undefined) {
    result = result.filter((item) =>
      subjectInRange(item, 'english', filters.englishMin, filters.englishMax)
    );
  }
  if (filters.businessOneMin !== undefined || filters.businessOneMax !== undefined) {
    result = result.filter((item) =>
      subjectInRange(item, 'math', filters.businessOneMin, filters.businessOneMax)
    );
  }
  if (filters.businessTwoMin !== undefined || filters.businessTwoMax !== undefined) {
    result = result.filter((item) =>
      subjectInRange(item, 'specialized', filters.businessTwoMin, filters.businessTwoMax)
    );
  }

  // Sort
  const sortBy = filters.sortBy || 'min_score';
  const sortOrder = filters.sortOrder || 'desc';
  result.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'enroll_count') cmp = a.enroll_count - b.enroll_count;
    else if (sortBy === 'name') cmp = a.name.localeCompare(b.name, 'zh-CN');
    else if (sortBy === 'default') {
      const ao = (a as WorkspaceSchool).display_order ?? 0;
      const bo = (b as WorkspaceSchool).display_order ?? 0;
      cmp = ao - bo;
    } else if (sortBy === 'school_code') {
      const ac = (a as WorkspaceSchool).school_code ?? '';
      const bc = (b as WorkspaceSchool).school_code ?? '';
      cmp = ac.localeCompare(bc, 'en');
    } else cmp = a.min_score - b.min_score;
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  return result;
}

export async function fetchWorkspaceData(
  schoolId: string,
  majorCodes: string[],
  filters: WorkspaceFilters = {}
): Promise<WorkspaceData> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('fetch_workspace_data', {
      schoolId,
      majorCodes,
      province: filters.province ?? null,
      provinces: filters.provinces ?? null,
      regionGroup: filters.regionGroup ?? null,
      levels: filters.levels ?? null,
      sortBy: filters.sortBy ?? null,
      sortOrder: filters.sortOrder ?? null,
      minScoreMin: filters.minScoreMin ?? null,
      minScoreMax: filters.minScoreMax ?? null,
      enrollCountMin: filters.enrollCountMin ?? null,
      enrollCountMax: filters.enrollCountMax ?? null,
      departmentName: filters.departmentName ?? null,
      studyModes: filters.studyModes ?? null,
      examTypes: filters.examTypes ?? null,
      selfScoring: filters.selfScoring ?? null,
      doctoralProgram: filters.doctoralProgram ?? null,
      doubleFirstClass: filters.doubleFirstClass ?? null,
      specialPlans: filters.specialPlans ?? null,
      englishMin: filters.englishMin ?? null,
      englishMax: filters.englishMax ?? null,
      businessOneMin: filters.businessOneMin ?? null,
      businessOneMax: filters.businessOneMax ?? null,
      businessTwoMin: filters.businessTwoMin ?? null,
      businessTwoMax: filters.businessTwoMax ?? null,
      foreignSubjects: filters.foreignSubjects ?? null,
      businessOneSubjects: filters.businessOneSubjects ?? null,
      businessTwoSubjects: filters.businessTwoSubjects ?? null,
    });
  }
  // Mock data for browser testing
  return getMockWorkspaceData(filters);
}

export async function fetchWorkspaceFilterOptions(
  majorCodes: string[]
): Promise<FilterOptions> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('fetch_workspace_filter_options', { majorCodes });
  }
  // Mock options for browser testing
  return getMockFilterOptions();
}

// ISSUE-027 阶段 2：招生计划视图。返回扁平行 (院校, 专业, 院系, 方向, 考试科目, 最新年份分数线)。
// 筛选参数同 fetchWorkspaceData，但不需要 schoolId（返回全量 plan 行）。
export async function fetchWorkspacePlans(
  majorCodes: string[],
  filters: WorkspaceFilters = {}
): Promise<WorkspacePlanRow[]> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('fetch_workspace_plans', {
      majorCodes,
      province: filters.province ?? null,
      provinces: filters.provinces ?? null,
      regionGroup: filters.regionGroup ?? null,
      levels: filters.levels ?? null,
      sortBy: filters.sortBy ?? null,
      sortOrder: filters.sortOrder ?? null,
      minScoreMin: filters.minScoreMin ?? null,
      minScoreMax: filters.minScoreMax ?? null,
      enrollCountMin: filters.enrollCountMin ?? null,
      enrollCountMax: filters.enrollCountMax ?? null,
      departmentName: filters.departmentName ?? null,
      studyModes: filters.studyModes ?? null,
      examTypes: filters.examTypes ?? null,
      selfScoring: filters.selfScoring ?? null,
      doctoralProgram: filters.doctoralProgram ?? null,
      doubleFirstClass: filters.doubleFirstClass ?? null,
      specialPlans: filters.specialPlans ?? null,
      englishMin: filters.englishMin ?? null,
      englishMax: filters.englishMax ?? null,
      businessOneMin: filters.businessOneMin ?? null,
      businessOneMax: filters.businessOneMax ?? null,
      businessTwoMin: filters.businessTwoMin ?? null,
      businessTwoMax: filters.businessTwoMax ?? null,
      foreignSubjects: filters.foreignSubjects ?? null,
      businessOneSubjects: filters.businessOneSubjects ?? null,
      businessTwoSubjects: filters.businessTwoSubjects ?? null,
    });
  }
  // Mock data for browser testing
  return getMockWorkspacePlans();
}

function getMockWorkspacePlans(): WorkspacePlanRow[] {
  return [
    {
      school_id: '1', school_code: '10003', school_name: '清华大学', province: '北京',
      level: '985 / 211 / 双一流', is_985: true, is_211: true, double_first_class: true,
      self_scoring: true, doctoral_program: true, display_order: 0,
      major_code: '081200', department_id: 1, department_name: '计算机科学与技术（学术学位）',
      research_direction: '机器学习与智能系统、计算机视觉与模式识别、自然语言处理、数据挖掘与推荐系统等。',
      exam_subjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制', exam_type: '统考', special_plans: [],
      latest_year: 2026, latest_min_score: 681, latest_enroll_count: 28,
      years: [
        { year: 2026, enroll_count: 28, min_score: 681, politics: 70, english: 70, math: 110, specialized: 120 },
        { year: 2025, enroll_count: 26, min_score: 672, politics: 68, english: 68, math: 105, specialized: 115 },
      ],
    },
    {
      school_id: '1', school_code: '10003', school_name: '清华大学', province: '北京',
      level: '985 / 211 / 双一流', is_985: true, is_211: true, double_first_class: true,
      self_scoring: true, doctoral_program: true, display_order: 0,
      major_code: '081200', department_id: 2, department_name: '人工智能（专业学位）',
      research_direction: '机器学习、深度学习、计算机视觉、自然语言处理等。',
      exam_subjects: ['① 101 思想政治理论', '② 204 英语（二）', '③ 302 数学（二）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制', exam_type: '统考', special_plans: [],
      latest_year: 2026, latest_min_score: 670, latest_enroll_count: 45,
      years: [
        { year: 2026, enroll_count: 45, min_score: 670, politics: 68, english: 68, math: 105, specialized: 115 },
      ],
    },
    {
      school_id: '2', school_code: '10001', school_name: '北京大学', province: '北京',
      level: '985 / 211 / 双一流', is_985: true, is_211: true, double_first_class: true,
      self_scoring: true, doctoral_program: true, display_order: 1,
      major_code: '081200', department_id: 3, department_name: '计算机科学与技术（学术学位）',
      research_direction: '计算机系统结构、计算机网络、软件工程等。',
      exam_subjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制', exam_type: '统考', special_plans: [],
      latest_year: 2026, latest_min_score: 675, latest_enroll_count: 30,
      years: [
        { year: 2026, enroll_count: 30, min_score: 675, politics: 70, english: 70, math: 110, specialized: 118 },
      ],
    },
  ];
}

function getMockWorkspaceData(filters: WorkspaceFilters = {}): WorkspaceData {
  let schools: WorkspaceSchool[] = [
    { school_id: '1', major_code: '085400', name: '清华大学', province: '北京', level: '985 / 211 / 双一流', min_score: 672, enroll_count: 45, self_scoring: true, doctoral_program: true, double_first_class: true, school_code: '10003', province_code: '11', is_985: true, is_211: true, display_order: 0 },
    { school_id: '1', major_code: '081200', name: '清华大学', province: '北京', level: '985 / 211 / 双一流', min_score: 665, enroll_count: 30, self_scoring: true, doctoral_program: true, double_first_class: true, school_code: '10003', province_code: '11', is_985: true, is_211: true, display_order: 0 },
    { school_id: '2', major_code: '085400', name: '北京大学', province: '北京', level: '985 / 211 / 双一流', min_score: 669, enroll_count: 40, self_scoring: true, doctoral_program: true, double_first_class: true, school_code: '10001', province_code: '11', is_985: true, is_211: true, display_order: 1 },
    { school_id: '3', major_code: '085400', name: '上海交通大学', province: '上海', level: '985 / 211 / 双一流', min_score: 660, enroll_count: 50, self_scoring: true, doctoral_program: true, double_first_class: true, school_code: '10248', province_code: '31', is_985: true, is_211: true, display_order: 2 },
    { school_id: '4', major_code: '085400', name: '浙江大学', province: '浙江', level: '985 / 211 / 双一流', min_score: 657, enroll_count: 48, self_scoring: true, doctoral_program: true, double_first_class: true, school_code: '10335', province_code: '33', is_985: true, is_211: true, display_order: 3 },
    { school_id: '5', major_code: '085400', name: '南京大学', province: '江苏', level: '985 / 211 / 双一流', min_score: 650, enroll_count: 42, self_scoring: true, doctoral_program: true, double_first_class: true, school_code: '10284', province_code: '32', is_985: true, is_211: true, display_order: 4 },
    { school_id: '6', major_code: '085400', name: '中国科学技术大学', province: '安徽', level: '985 / 211 / 双一流', min_score: 645, enroll_count: 35, self_scoring: true, doctoral_program: true, double_first_class: true, school_code: '10358', province_code: '34', is_985: true, is_211: true, display_order: 5 },
    { school_id: '7', major_code: '085400', name: '哈尔滨工业大学', province: '黑龙江', level: '985 / 211 / 双一流', min_score: 642, enroll_count: 60, self_scoring: false, doctoral_program: true, double_first_class: true, school_code: '10213', province_code: '23', is_985: true, is_211: true, display_order: 6 },
    { school_id: '8', major_code: '085400', name: '北京航空航天大学', province: '北京', level: '985 / 211 / 双一流', min_score: 641, enroll_count: 55, self_scoring: true, doctoral_program: true, double_first_class: true, school_code: '10006', province_code: '11', is_985: true, is_211: true, display_order: 7 },
    { school_id: '9', major_code: '085400', name: '同济大学', province: '上海', level: '985 / 211 / 双一流', min_score: 637, enroll_count: 45, self_scoring: true, doctoral_program: true, double_first_class: true, school_code: '10247', province_code: '31', is_985: true, is_211: true, display_order: 8 },
    { school_id: '10', major_code: '085400', name: '华中科技大学', province: '湖北', level: '985 / 211 / 双一流', min_score: 635, enroll_count: 50, self_scoring: false, doctoral_program: true, double_first_class: true, school_code: '10487', province_code: '42', is_985: true, is_211: true, display_order: 9 },
  ];

  if (filters.provinces && filters.provinces.length > 0) {
    schools = schools.filter((s) => filters.provinces!.includes(s.province));
  } else if (filters.province) {
    schools = schools.filter((s) => s.province === filters.province);
  } else if (filters.regionGroup) {
    const regionProvinces = filters.regionGroup === '一区'
      ? ['北京', '天津', '河北', '山西', '辽宁', '吉林', '黑龙江', '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '重庆', '四川', '陕西']
      : ['内蒙古', '广西', '海南', '贵州', '云南', '西藏', '甘肃', '青海', '宁夏', '新疆'];
    schools = schools.filter((s) => regionProvinces.includes(s.province));
  }
  if (filters.levels && filters.levels.length > 0) {
    schools = schools.filter((s) =>
      filters.levels!.some((tag) => s.level.includes(tag))
    );
  }
  if (filters.minScoreMin !== undefined) {
    schools = schools.filter((s) => s.min_score >= filters.minScoreMin!);
  }
  if (filters.minScoreMax !== undefined) {
    schools = schools.filter((s) => s.min_score <= filters.minScoreMax!);
  }
  if (filters.enrollCountMin !== undefined) {
    schools = schools.filter((s) => s.enroll_count >= filters.enrollCountMin!);
  }
  if (filters.enrollCountMax !== undefined) {
    schools = schools.filter((s) => s.enroll_count <= filters.enrollCountMax!);
  }
  if (filters.selfScoring) {
    schools = schools.filter((s) => s.self_scoring);
  }
  if (filters.doctoralProgram) {
    schools = schools.filter((s) => s.doctoral_program);
  }
  if (filters.doubleFirstClass) {
    schools = schools.filter((s) => s.double_first_class);
  }

  const sortBy = filters.sortBy || 'min_score';
  const sortOrder = filters.sortOrder || 'desc';
  schools.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'enroll_count') cmp = a.enroll_count - b.enroll_count;
    else if (sortBy === 'name') cmp = a.name.localeCompare(b.name, 'zh-CN');
    else if (sortBy === 'default') cmp = a.display_order - b.display_order;
    else if (sortBy === 'school_code') cmp = a.school_code.localeCompare(b.school_code, 'en');
    else cmp = a.min_score - b.min_score;
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  const departments: WorkspaceDepartment[] = [
    {
      department_id: 1,
      school_id: '1',
      major_code: '085400',
      name: '计算机科学与技术（学术学位）',
      research_direction: '机器学习与智能系统、计算机视觉与模式识别、自然语言处理、数据挖掘与推荐系统等。',
      exam_subjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制',
      exam_type: '统考',
      special_plans: [],
      years: [
        { year: 2026, enroll_count: 28, min_score: 681, politics: 70, english: 70, math: 110, specialized: 120 },
        { year: 2025, enroll_count: 26, min_score: 672, politics: 68, english: 68, math: 105, specialized: 115 },
        { year: 2024, enroll_count: 24, min_score: 663, politics: 67, english: 67, math: 105, specialized: 114 },
        { year: 2023, enroll_count: 26, min_score: 654, politics: 65, english: 65, math: 100, specialized: 110 },
      ],
    },
    {
      department_id: 2,
      school_id: '1',
      major_code: '085400',
      name: '人工智能（专业学位）',
      research_direction: '机器学习、深度学习、计算机视觉、自然语言处理等。',
      exam_subjects: ['① 101 思想政治理论', '② 204 英语（二）', '③ 302 数学（二）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制',
      exam_type: '统考',
      special_plans: [],
      years: [
        { year: 2026, enroll_count: 45, min_score: 670, politics: 68, english: 68, math: 105, specialized: 115 },
      ],
    },
    {
      department_id: 3,
      school_id: '1',
      major_code: '085400',
      name: '软件工程（专业学位）',
      research_direction: '软件工程理论与方法、软件工程技术、软件项目管理等。',
      exam_subjects: ['① 101 思想政治理论', '② 204 英语（二）', '③ 302 数学（二）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制',
      exam_type: '统考',
      special_plans: ['退役大学生士兵'],
      years: [
        { year: 2026, enroll_count: 35, min_score: 665, politics: 66, english: 66, math: 102, specialized: 112 },
      ],
    },
    {
      department_id: 4,
      school_id: '1',
      major_code: '085400',
      name: '控制科学与工程（学术学位）',
      research_direction: '控制理论与控制工程、模式识别与智能系统、导航制导与控制等。',
      exam_subjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制',
      exam_type: '统考',
      special_plans: [],
      years: [
        { year: 2026, enroll_count: 22, min_score: 658, politics: 65, english: 65, math: 102, specialized: 112 },
      ],
    },
  ];

  return { schools, departments };
}

function getMockFilterOptions(): FilterOptions {
  return {
    provinces: ['北京', '上海', '浙江', '江苏', '安徽', '黑龙江', '湖北'],
    region_groups: ['一区', '二区'],
    levels: ['985 / 211 / 双一流'],
    level_tags: ['985', '211', '双一流'],
    study_modes: ['全日制', '非全日制'],
    exam_types: ['统考'],
    special_plans: ['退役大学生士兵'],
    foreign_subjects: ['② 201 英语（一）', '② 204 英语（二）', '② 203 日语'],
    business_one_subjects: ['③ 301 数学（一）', '③ 302 数学（二）'],
    business_two_subjects: ['④ 408 计算机学科专业基础'],
    has_self_scoring: true,
    has_doctoral: true,
    has_double_first_class: true,
    has_self_scoring_tag: true,
    has_research_institute: false,
  };
}

export async function fetchFavorites(majorCode?: string): Promise<Favorite[]> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('fetch_favorites', { majorCode: majorCode ?? null });
  }
  // Mock data for browser testing
  return getMockFavorites();
}

export async function toggleFavorite(
  schoolId: string,
  majorCode: string,
  majorName: string
): Promise<boolean> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('toggle_favorite', { schoolId, majorCode, majorName });
  }
  // Browser: no-op, just return true
  return true;
}

export async function fetchRecentViews(limit: number = 20): Promise<RecentView[]> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('fetch_recent_views', { limit });
  }
  // Mock data for browser testing
  return getMockRecentViews();
}

export async function addRecentView(
  schoolId: string,
  majorCode: string,
  majorName: string
): Promise<void> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('add_recent_view_command', { schoolId, majorCode, majorName });
  }
}

export async function syncWorkspaceData(majorCode: string): Promise<string> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('sync_workspace_data', { majorCode });
  }
  return 'mock sync skipped';
}

export interface CrawlProgress {
  running: boolean;
  major_code: string;
  current: number;
  total: number;
  current_name: string;
  done: boolean;
  success: number;
  failed: number;
  skipped: number;
  error: string | null;
}

export async function runCrawl(majorCode: string): Promise<void> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('run_crawl', { majorCode });
    return;
  }
  throw new Error('浏览器环境不支持直接采集');
}

export async function getCrawlProgress(): Promise<CrawlProgress> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('get_crawl_progress');
  }
  return {
    running: false,
    major_code: '',
    current: 0,
    total: 0,
    current_name: '',
    done: false,
    success: 0,
    failed: 0,
    skipped: 0,
    error: null,
  };
}

export async function cancelCrawl(): Promise<void> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('cancel_crawl');
    return;
  }
  // 浏览器环境无需操作
}

export async function resetCrawl(): Promise<void> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('reset_crawl');
    return;
  }
  // 浏览器环境无需操作
}

export interface LoginStatus {
  logged_in: boolean;
  expires_at: string | null;
}

export interface LoginResult {
  success: boolean;
  school_count: number;
  error: string | null;
}

export async function checkLoginStatus(): Promise<LoginStatus> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('check_login_status');
  }
  return { logged_in: false, expires_at: null };
}

export async function loginYanzhao(majorCode: string): Promise<LoginResult> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('login_yanzhao', { majorCode });
  }
  return { success: false, school_count: 0, error: '浏览器环境不支持登录' };
}

// ISSUE-024：登录状态管理三件套（SettingsPage 登录状态卡片使用）

export interface RefreshLoginResult {
  success: boolean;
  error: string | null;
}

export interface ClearLoginResult {
  success: boolean;
  cookie_existed: boolean;
  error: string | null;
}

/** 刷新登录态：打开可见浏览器让用户登录研招网，不抓取种子 */
export async function refreshLogin(): Promise<RefreshLoginResult> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('refresh_login');
  }
  return { success: false, error: '浏览器环境不支持登录' };
}

/** 清除登录态：删除本地研招网 cookie 文件 */
export async function clearLogin(): Promise<ClearLoginResult> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('clear_login');
  }
  return { success: false, cookie_existed: false, error: '浏览器环境不支持操作本地文件' };
}

export interface SearchedMajor {
  zydm: string;
  zymc: string;
  yjxkdm: string;
  yjxkmc: string;
  mldm: string;
  mlmc: string;
  xwlx: string;
}

export interface SearchMajorsResult {
  majors: SearchedMajor[];
  total_count: number;
  fetched_count: number;
  need_login: boolean;
  yjxkdm: string;
  yjxkmc: string;
  error: string | null;
}

/** 按一级学科代码实时查询研招网 zys.do 接口拿全专业（含 J/Z 自设交叉学科）.
 * 耗时约 30-60 秒，前端通过 loading state 处理。
 */
export async function searchMajorsByYjxkdm(yjxkdm: string): Promise<SearchMajorsResult> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('search_majors', { yjxkdm });
  }
  return {
    majors: [],
    total_count: 0,
    fetched_count: 0,
    need_login: false,
    yjxkdm,
    yjxkmc: '',
    error: '浏览器环境不支持实时查询',
  };
}

/** 按专业名称关键词实时查询研招网 zys.do 接口.
 * 适合已知名称反查代码， totalCount 通常 ≤ 10 可一次拿全。
 */
export async function searchMajorsByName(name: string): Promise<SearchMajorsResult> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('search_majors', { name });
  }
  return {
    majors: [],
    total_count: 0,
    fetched_count: 0,
    need_login: false,
    yjxkdm: '',
    yjxkmc: '',
    error: '浏览器环境不支持实时查询',
  };
}

// ============================================================================
// 整个专业目录更新（写入 data/majors_realtime.json）
// ============================================================================

export interface BatchItem {
  yjxkdm: string;
  yjxkmc: string;
  /** pending / running / done / failed */
  status: string;
  detail: string;
}

export interface UpdateCatalogProgress {
  running: boolean;
  current: number;
  total: number;
  current_yjxkdm: string;
  current_yjxkmc: string;
  done: boolean;
  success_count: number;
  failed_count: number;
  error: string | null;
  /** ISSUE-023：当前批次号（1-based） */
  batch_num: number;
  /** ISSUE-023：总批次数 */
  total_batches: number;
  /** ISSUE-023：当前批次内的并发项列表 */
  batch_items: BatchItem[];
}

/** 启动整个专业目录更新任务（耗时 1-2 小时，219 个一级学科 × 单学科查询）.
 * 任务在后台运行，前端通过 listen('catalog-update-progress', ...) 监听进度，
 * listen('catalog-update-done', ...) 监听完成事件。
 */
export async function updateMajorsCatalog(login = false): Promise<void> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('update_majors_catalog', { login });
    return;
  }
  throw new Error('浏览器环境不支持更新专业目录');
}

export async function cancelCatalogUpdate(): Promise<void> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('cancel_catalog_update');
  }
}

export async function resetCatalogUpdate(): Promise<void> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('reset_catalog_update');
  }
}

export async function getCatalogUpdateProgress(): Promise<UpdateCatalogProgress> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('get_catalog_update_progress');
  }
  return {
    running: false,
    current: 0,
    total: 0,
    current_yjxkdm: '',
    current_yjxkmc: '',
    done: false,
    success_count: 0,
    failed_count: 0,
    error: null,
    batch_num: 0,
    total_batches: 0,
    batch_items: [],
  };
}

/** 读取本地 majors_realtime.json 内容.
 * 返回 null 表示文件不存在（应回退到本地静态 majors.ts）。
 * 返回字符串时由调用方 JSON.parse 解析。
 */
export async function readMajorsCatalog(): Promise<string | null> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('read_majors_catalog');
  }
  return null;
}

export async function clearRecentViews(): Promise<void> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('clear_recent_views_command');
  }
}

export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}天前`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}周前`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}个月前`;
  return `${Math.floor(seconds / 31536000)}年前`;
}

function getMockFavorites(): Favorite[] {
  return [
    {
      school_id: '1', major_code: '085400', major_name: '人工智能（专）', name: '清华大学',
      province: '北京', level: '985 / 211 / 双一流', min_score: 681, enroll_count: 28,
      created_at: Date.now() / 1000 - 3600,
      self_scoring: true, doctoral_program: true, double_first_class: true,
      departments: [
        {
          name: '计算机科学与技术（学术学位）', study_mode: '全日制', exam_type: '统考', special_plans: [],
          exam_subjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
          years: [
            { english: 70, math: 110, specialized: 120 },
          ],
        },
      ],
    },
    {
      school_id: '4', major_code: '085400', major_name: '人工智能（专）', name: '浙江大学',
      province: '浙江', level: '985 / 211 / 双一流', min_score: 672, enroll_count: 32,
      created_at: Date.now() / 1000 - 7200,
      self_scoring: true, doctoral_program: true, double_first_class: true,
      departments: [
        { name: '人工智能（专业学位）', study_mode: '全日制', exam_type: '统考', special_plans: [], exam_subjects: ['② 204 英语（二）', '③ 302 数学（二）', '④ 408 计算机学科专业基础'], years: [{ english: 68, math: 105, specialized: 115 }] },
      ],
    },
    {
      school_id: '8', major_code: '085400', major_name: '人工智能（专）', name: '北京航空航天大学',
      province: '北京', level: '985 / 211 / 双一流', min_score: 663, enroll_count: 24,
      created_at: Date.now() / 1000 - 10800,
      self_scoring: true, doctoral_program: true, double_first_class: true,
      departments: [
        { name: '人工智能（专业学位）', study_mode: '全日制', exam_type: '统考', special_plans: [], exam_subjects: ['② 204 英语（二）', '③ 302 数学（二）', '④ 408 计算机学科专业基础'], years: [{ english: 67, math: 105, specialized: 114 }] },
      ],
    },
  ];
}

function getMockRecentViews(): RecentView[] {
  const now = Date.now() / 1000;
  return [
    { school_id: '1', major_code: '085400', major_name: '人工智能（专）', name: '清华大学', province: '北京', level: '985 / 211 / 双一流', viewed_at: now - 300 },
    { school_id: '4', major_code: '081200', major_name: '计算机科学与技术（学）', name: '浙江大学', province: '浙江', level: '985 / 211 / 双一流', viewed_at: now - 86400 },
    { school_id: '8', major_code: '085400', major_name: '人工智能（专）', name: '北京航空航天大学', province: '北京', level: '985 / 211 / 双一流', viewed_at: now - 172800 },
  ];
}
