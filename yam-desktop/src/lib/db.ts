import { MOCK_SCHOOLS, getMockScoreLines } from '../data/mock-schools';

const getErrorCause = (error: Error & Partial<AppError>): unknown =>
  'cause' in error ? error.cause : undefined;

export type AppErrorCode =
  | 'LOGIN_REQUIRED'
  | 'UNKNOWN_MAJOR'
  | 'NO_PUBLIC_DATA'
  | 'BROWSER_MISSING'
  | 'BACKEND_MISSING'
  | 'UNREACHABLE'
  | 'TIMEOUT'
  | 'FAILED'
  | 'DB_QUERY_FAILED'
  | 'DB_WRITE_FAILED'
  | 'DB_LOCK_POISONED'
  | 'TASK_RUNNING'
  | 'INVALID_EXPORT_FORMAT'
  | 'UNKNOWN';

export interface AppError {
  code: AppErrorCode;
  message: string;
  impact: string;
  action: string;
  retryable: boolean;
  cause?: unknown;
}

const ERROR_DEFAULTS: Record<AppErrorCode, Pick<AppError, 'impact' | 'action' | 'retryable'>> = {
  LOGIN_REQUIRED: {
    impact: '当前操作尚未开始或已暂停。',
    action: '完成登录后重新执行。',
    retryable: false,
  },
  UNKNOWN_MAJOR: {
    impact: '当前专业无法继续采集。',
    action: '返回专业选择并更新专业目录。',
    retryable: false,
  },
  NO_PUBLIC_DATA: {
    impact: '当前专业没有可写入工作区的公开数据。',
    action: '返回专业管理选择其他专业。',
    retryable: false,
  },
  BROWSER_MISSING: {
    impact: '需要浏览器的采集、登录和专业目录功能暂不可用。',
    action: '安装或更新 Microsoft Edge 后重试。',
    retryable: false,
  },
  BACKEND_MISSING: {
    impact: '采集、登录和专业目录功能暂不可用。',
    action: '重新安装 YAM 后重试。',
    retryable: false,
  },
  UNREACHABLE: {
    impact: '本次操作未完成，已成功处理的数据会保留。',
    action: '检查网络后重试失败项。',
    retryable: true,
  },
  TIMEOUT: {
    impact: '本次操作已停止，已成功处理的数据会保留。',
    action: '网络稳定后重试失败项。',
    retryable: true,
  },
  FAILED: {
    impact: '本次操作未完成，已成功处理的数据会保留。',
    action: '重试失败项；若仍失败，请查看采集日志。',
    retryable: true,
  },
  DB_QUERY_FAILED: {
    impact: '本次查询未完成，现有数据未改变。',
    action: '请重试；若仍失败，请重启应用。',
    retryable: true,
  },
  DB_WRITE_FAILED: {
    impact: '本次写入未完成，原数据未改变。',
    action: '请重试；若仍失败，请重启应用。',
    retryable: true,
  },
  DB_LOCK_POISONED: {
    impact: '本次数据库操作未完成，现有数据保持不变。',
    action: '请重试；若仍失败，请重启应用。',
    retryable: true,
  },
  TASK_RUNNING: {
    impact: '本次操作未启动，当前任务继续运行。',
    action: '请等待当前任务完成后重试。',
    retryable: false,
  },
  INVALID_EXPORT_FORMAT: {
    impact: '本次导出未启动。',
    action: '请选择 CSV、JSON 或 Excel。',
    retryable: false,
  },
  UNKNOWN: {
    impact: '当前操作未完成。',
    action: '请重试；若仍失败，请查看日志。',
    retryable: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function toAppErrorCode(value: unknown): AppErrorCode {
  return typeof value === 'string' && value in ERROR_DEFAULTS
    ? value as AppErrorCode
    : 'UNKNOWN';
}

export function normalizeAppError(error: unknown, fallbackMessage: string): AppError {
  if (typeof error === 'string') {
    const trimmed = error.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return normalizeAppError(JSON.parse(trimmed), fallbackMessage);
      } catch {
        // Fall through and preserve the original rejection text.
      }
    }
    return {
      code: 'UNKNOWN',
      message: trimmed || fallbackMessage,
      ...ERROR_DEFAULTS.UNKNOWN,
      cause: error,
    };
  }

  if (error instanceof Error) {
    const structured = error as Error & Partial<AppError>;
    const normalized = normalizeAppError(
      {
        code: structured.code,
        message: error.message,
        impact: structured.impact,
        action: structured.action,
        retryable: structured.retryable,
        cause: getErrorCause(structured),
      },
      fallbackMessage
    );
    return { ...normalized, cause: getErrorCause(structured) ?? structured.cause ?? error };
  }

  if (isRecord(error)) {
    const code = toAppErrorCode(error.code);
    const defaults = ERROR_DEFAULTS[code];
    const message = typeof error.message === 'string' && error.message.trim()
      ? error.message.trim()
      : fallbackMessage;
    return {
      code,
      message,
      impact: typeof error.impact === 'string' ? error.impact : defaults.impact,
      action: typeof error.action === 'string' ? error.action : defaults.action,
      retryable: typeof error.retryable === 'boolean' ? error.retryable : defaults.retryable,
      ...(error.cause !== undefined ? { cause: error.cause } : { cause: error }),
    };
  }

  return {
    code: 'UNKNOWN',
    message: fallbackMessage,
    ...ERROR_DEFAULTS.UNKNOWN,
    cause: error,
  };
}

export function getErrorMessage(error: unknown, fallbackMessage = '操作失败'): string {
  return normalizeAppError(error, fallbackMessage).message;
}

export async function invokeApp<T>(
  command: string,
  args?: Record<string, unknown>,
  fallbackMessage = '操作失败'
): Promise<T> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command, args);
  } catch (error) {
    const normalized = normalizeAppError(error, fallbackMessage);
    throw Object.assign(new Error(normalized.message), normalized);
  }
}

export interface DatabaseStatus {
  database_path: string;
  recovered: boolean;
  backup_path: string | null;
  message: string | null;
}

export interface DiagnosticsInfo {
  log_directory: string;
  desktop_log_path: string;
  python_log_path: string;
}

export interface BackendRuntimeStatus {
  mode: 'development' | 'bundled';
  executable_path: string;
  available: boolean;
  browser: 'msedge' | 'missing' | 'unknown';
  message: string;
}

export async function getBackendRuntimeStatus(): Promise<BackendRuntimeStatus> {
  if (isTauri) {
    return invokeApp('get_backend_runtime_status', undefined, '加载后端运行状态失败');
  }
  return {
    mode: 'development',
    executable_path: '浏览器预览不使用本地后端',
    available: false,
    browser: 'unknown',
    message: '浏览器预览不使用本地后端',
  };
}

export interface ExportSettings {
  export_directory?: string;
}

export interface ExportProgress {
  running: boolean;
  done: boolean;
  current: number;
  total: number;
  format: string;
  path: string | null;
  error: string | null;
}

export async function startPlanExport(
  majorCodes: string[],
  filters: WorkspaceFilters,
  format: 'csv' | 'excel' | 'json',
  defaultFilename: string
): Promise<boolean> {
  if (!isTauri) return false;
  return invokeApp('start_plan_export', {
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
    researchDirection: filters.researchDirection ?? null,
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
    searchQuery: filters.searchQuery ?? null,
    format,
    defaultFilename,
  }, '启动计划导出失败');
}

export async function getExportProgress(): Promise<ExportProgress> {
  if (!isTauri) {
    return { running: false, done: false, current: 0, total: 0, format: '', path: null, error: null };
  }
  return invokeApp('get_export_progress', undefined, '获取导出进度失败');
}

export async function cancelExport(): Promise<void> {
  if (isTauri) await invokeApp('cancel_export', undefined, '取消导出失败');
}

export async function getExportSettings(): Promise<ExportSettings> {
  if (!isTauri) return {};
  return invokeApp('get_export_settings', undefined, '加载导出设置失败');
}

export async function chooseExportDirectory(): Promise<ExportSettings> {
  if (!isTauri) throw new Error('浏览器环境不支持选择导出目录');
  return invokeApp('choose_export_directory', undefined, '选择导出目录失败');
}

export async function clearExportDirectory(): Promise<ExportSettings> {
  if (!isTauri) return {};
  return invokeApp('clear_export_directory', undefined, '清除导出目录失败');
}

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  if (isTauri) {
    return invokeApp('get_database_status', undefined, '加载数据库状态失败');
  }
  return {
    database_path: '浏览器预览不使用本地数据库',
    recovered: false,
    backup_path: null,
    message: null,
  };
}

export async function getDiagnosticsInfo(): Promise<DiagnosticsInfo> {
  if (isTauri) {
    return invokeApp('get_diagnostics_info', undefined, '加载诊断日志信息失败');
  }
  return {
    log_directory: '~/.yam/logs',
    desktop_log_path: '~/.yam/logs/yam-desktop.log',
    python_log_path: '~/.yam/logs/yam-python.log',
  };
}

export async function openDiagnosticsDirectory(): Promise<void> {
  if (!isTauri) throw new Error('浏览器环境不支持打开本地目录');
  await invokeApp('open_diagnostics_directory', undefined, '打开诊断日志目录失败');
}

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
  reference_score: number;
  reference_year: number;
  reference_scope: string;
  latest_request_year: number;
  latest_request_status: string;
  latest_request_error: string;
  enroll_count: number;
  self_scoring: boolean;
  doctoral_program: boolean;
  double_first_class: boolean;
  school_code: string;
  province_code: string;
  is_985: boolean;
  is_211: boolean;
  display_order: number;
  source: string;
  updated_at: string;
}

export interface WorkspaceYear {
  year: number;
  enroll_count: number;
  min_score: number;
  politics: number;
  english: number;
  math: number;
  specialized: number;
  score_scope?: 'exact_direction' | 'department' | 'school_major' | 'first_level_reference' | 'category_reference';
  source?: string;
  updated_at?: string;
  match_note?: string;
}

export interface WorkspaceDepartment {
  department_id: number;
  source_department_id: string;
  plan_key: string;
  school_id: string;
  major_code: string;
  name: string;
  research_direction: string;
  exam_subjects: string[];
  study_mode: string;
  exam_type: string;
  special_plans: string[];
  enrollment_count: number;
  source: string;
  updated_at: string;
  years: WorkspaceYear[];
}

export interface WorkspaceData {
  schools: WorkspaceSchool[];
  departments: WorkspaceDepartment[];
}

export interface WorkspaceSchoolPage {
  items: WorkspaceSchool[];
  total: number;
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
  school_source: string;
  school_updated_at: string;
  // 专业级
  major_code: string;
  // 院系级
  department_id: number;
  source_department_id: string;
  plan_key: string;
  department_name: string;
  research_direction: string;
  exam_subjects: string[];
  study_mode: string;
  exam_type: string;
  special_plans: string[];
  department_source: string;
  department_updated_at: string;
  // 兼容旧字段；计划年份与分数年份明确分离
  latest_year: number;
  latest_plan_year: number;
  plan_year_status: 'provided' | 'unknown';
  plan_snapshot_at: string;
  latest_score_year: number;
  latest_min_score: number;
  latest_enroll_count: number;
  // 多年（展开用）
  years: WorkspaceYear[];
}

export interface WorkspacePlanPage {
  items: WorkspacePlanRow[];
  total: number;
}

export interface PlanFavorite {
  favorite_id: number;
  school_id: string;
  school_name: string;
  major_code: string;
  department_name: string;
  research_direction: string;
  exam_subjects: string[];
  study_mode: string;
  exam_type: string;
  special_plans: string[];
  created_at: number;
}

type PlanFavoriteIdentity = Pick<
  WorkspacePlanRow,
  'school_id' | 'major_code' | 'department_name' | 'research_direction' | 'exam_subjects'
>;

export function planFavoriteKey(plan: PlanFavoriteIdentity): string {
  return JSON.stringify([
    plan.school_id,
    plan.major_code,
    plan.department_name,
    plan.research_direction,
    plan.exam_subjects,
  ]);
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
  sortBy?: 'min_score' | 'enroll_count' | 'name' | 'default' | 'school_code' | 'department_name' | 'research_direction';
  sortOrder?: 'asc' | 'desc';
  minScoreMin?: number;
  minScoreMax?: number;
  enrollCountMin?: number;
  enrollCountMax?: number;
  departmentName?: string;
  researchDirection?: string;
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
  searchQuery?: string;
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
  is_985?: boolean;
  is_211?: boolean;
  display_order?: number;
  school_code?: string;
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
        if (tag === '985') return item.is_985 === true;
        if (tag === '211') return item.is_211 === true;
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
      const ao = a.display_order ?? 0;
      const bo = b.display_order ?? 0;
      cmp = ao - bo;
    } else if (sortBy === 'school_code') {
      const ac = a.school_code ?? '';
      const bc = b.school_code ?? '';
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
      researchDirection: filters.researchDirection ?? null,
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
      searchQuery: filters.searchQuery ?? null,
    });
  }
  // Mock data for browser testing
  const data = getMockWorkspaceData(filters);
  return {
    ...data,
    schools: data.schools.filter((school) => majorCodes.includes(school.major_code)),
  };
}

export async function fetchWorkspaceSchoolsPage(
  majorCodes: string[],
  filters: WorkspaceFilters,
  page: number,
  pageSize: number
): Promise<WorkspaceSchoolPage> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('fetch_workspace_schools_page', {
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
      researchDirection: filters.researchDirection ?? null,
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
      searchQuery: filters.searchQuery ?? null,
      page,
      pageSize,
    });
  }

  const all = getMockWorkspaceData(filters).schools.filter((school) =>
    majorCodes.includes(school.major_code)
  );
  const groups = new Map<string, WorkspaceSchool[]>();
  all.forEach((school) => {
    const group = groups.get(school.school_id) ?? [];
    group.push(school);
    groups.set(school.school_id, group);
  });
  const grouped = Array.from(groups.values());
  grouped.forEach((rows) => rows.sort((left, right) =>
    left.major_code.localeCompare(right.major_code, 'en')
  ));
  const sortBy = filters.sortBy ?? 'min_score';
  const descending = (filters.sortOrder ?? 'desc') === 'desc';
  grouped.sort((left, right) => {
    const aggregate = (rows: WorkspaceSchool[]) => {
      if (sortBy === 'enroll_count') return rows.reduce((sum, row) => sum + row.enroll_count, 0);
      if (sortBy === 'default') return Math.min(...rows.map((row) => row.display_order));
      if (sortBy === 'min_score') return Math.min(...rows.map((row) => row.min_score));
      return 0;
    };
    let cmp = sortBy === 'name'
      ? left[0].name.localeCompare(right[0].name, 'zh-CN')
      : sortBy === 'school_code'
        ? left[0].school_code.localeCompare(right[0].school_code, 'en')
        : aggregate(left) - aggregate(right);
    if (descending) cmp = -cmp;
    return cmp || left[0].school_id.localeCompare(right[0].school_id, 'en');
  });
  const normalizedPage = Math.max(1, Math.min(100, page));
  const normalizedPageSize = Math.max(1, Math.min(100, pageSize));
  const selected = grouped.slice(
    (normalizedPage - 1) * normalizedPageSize,
    normalizedPage * normalizedPageSize
  );
  return { items: selected.flat(), total: grouped.length };
}

export async function fetchWorkspaceDepartments(
  schoolId: string,
  majorCodes: string[]
): Promise<WorkspaceDepartment[]> {
  if (isTauri) {
    return invokeApp(
      'fetch_workspace_departments',
      { schoolId, majorCodes },
      '加载院系详情失败'
    );
  }
  return getMockWorkspaceData({}).departments.filter(
    (department) =>
      department.school_id === schoolId && majorCodes.includes(department.major_code)
  );
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
      researchDirection: filters.researchDirection ?? null,
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
      searchQuery: filters.searchQuery ?? null,
    });
  }
  return filterMockWorkspacePlans(getMockWorkspacePlans(), filters);
}

export async function fetchWorkspacePlansPage(
  majorCodes: string[],
  filters: WorkspaceFilters,
  page: number,
  pageSize: number
): Promise<WorkspacePlanPage> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('fetch_workspace_plans_page', {
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
      researchDirection: filters.researchDirection ?? null,
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
      searchQuery: filters.searchQuery ?? null,
      page,
      pageSize,
    });
  }
  const all = await fetchWorkspacePlans(majorCodes, filters);
  const normalizedPage = Math.max(1, page);
  const normalizedPageSize = Math.max(1, Math.min(100, pageSize));
  const offset = (normalizedPage - 1) * normalizedPageSize;
  return { items: all.slice(offset, offset + normalizedPageSize), total: all.length };
}

function filterMockWorkspacePlans(plans: WorkspacePlanRow[], filters: WorkspaceFilters): WorkspacePlanRow[] {
  let result = plans.filter((plan) => {
    if (filters.provinces?.length && !filters.provinces.includes(plan.province)) return false;
    if (!filters.provinces?.length && filters.province && plan.province !== filters.province) return false;
    if (filters.departmentName && !plan.department_name.includes(filters.departmentName)) return false;
    if (filters.researchDirection && !plan.research_direction.includes(filters.researchDirection)) return false;
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      if (![plan.school_name, plan.school_code, plan.department_name, plan.research_direction]
        .some((value) => value.toLowerCase().includes(query))) return false;
    }
    return true;
  });
  const direction = filters.sortOrder === 'asc' ? 1 : -1;
  result = result.sort((a, b) => {
    const sortBy = filters.sortBy ?? 'min_score';
    let comparison = 0;
    if (sortBy === 'enroll_count') comparison = a.latest_enroll_count - b.latest_enroll_count;
    else if (sortBy === 'name') comparison = a.school_name.localeCompare(b.school_name, 'zh-CN');
    else if (sortBy === 'department_name') comparison = a.department_name.localeCompare(b.department_name, 'zh-CN');
    else if (sortBy === 'research_direction') comparison = a.research_direction.localeCompare(b.research_direction, 'zh-CN');
    else if (sortBy === 'school_code') comparison = a.school_code.localeCompare(b.school_code);
    else if (sortBy === 'default') comparison = a.display_order - b.display_order;
    else comparison = a.latest_min_score - b.latest_min_score;
    return comparison * direction || a.plan_key.localeCompare(b.plan_key);
  });
  return result;
}

function getMockWorkspacePlans(): WorkspacePlanRow[] {
  return [
    {
      school_id: '1', school_code: '10003', school_name: '清华大学', province: '北京',
      level: '985 / 211 / 双一流', is_985: true, is_211: true, double_first_class: true,
      self_scoring: true, doctoral_program: true, display_order: 0,
      school_source: 'yanzhao', school_updated_at: '2026-07-28',
      major_code: '081200', department_id: 1, source_department_id: 'mock-1', plan_key: 'mock-plan-1', department_name: '计算机科学与技术（学术学位）',
      research_direction: '机器学习与智能系统、计算机视觉与模式识别、自然语言处理、数据挖掘与推荐系统等。',
      exam_subjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制', exam_type: '统考', special_plans: [],
      department_source: 'yanzhao', department_updated_at: '2026-07-28',
      latest_year: 2026, latest_plan_year: 2026, plan_year_status: 'provided', plan_snapshot_at: '2026-07-28', latest_score_year: 2026, latest_min_score: 681, latest_enroll_count: 28,
      years: [
        { year: 2026, enroll_count: 28, min_score: 681, politics: 70, english: 70, math: 110, specialized: 120 },
        { year: 2025, enroll_count: 26, min_score: 672, politics: 68, english: 68, math: 105, specialized: 115 },
      ],
    },
    {
      school_id: '1', school_code: '10003', school_name: '清华大学', province: '北京',
      level: '985 / 211 / 双一流', is_985: true, is_211: true, double_first_class: true,
      self_scoring: true, doctoral_program: true, display_order: 0,
      school_source: 'yanzhao', school_updated_at: '2026-07-28',
      major_code: '081200', department_id: 2, source_department_id: 'mock-2', plan_key: 'mock-plan-2', department_name: '人工智能（专业学位）',
      research_direction: '机器学习、深度学习、计算机视觉、自然语言处理等。',
      exam_subjects: ['① 101 思想政治理论', '② 204 英语（二）', '③ 302 数学（二）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制', exam_type: '统考', special_plans: [],
      department_source: 'yanzhao', department_updated_at: '2026-07-28',
      latest_year: 2026, latest_plan_year: 2026, plan_year_status: 'provided', plan_snapshot_at: '2026-07-28', latest_score_year: 2026, latest_min_score: 670, latest_enroll_count: 45,
      years: [
        { year: 2026, enroll_count: 45, min_score: 670, politics: 68, english: 68, math: 105, specialized: 115 },
      ],
    },
    {
      school_id: '2', school_code: '10001', school_name: '北京大学', province: '北京',
      level: '985 / 211 / 双一流', is_985: true, is_211: true, double_first_class: true,
      self_scoring: true, doctoral_program: true, display_order: 1,
      school_source: 'yanzhao', school_updated_at: '2026-07-28',
      major_code: '081200', department_id: 3, source_department_id: 'mock-3', plan_key: 'mock-plan-3', department_name: '计算机科学与技术（学术学位）',
      research_direction: '计算机系统结构、计算机网络、软件工程等。',
      exam_subjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制', exam_type: '统考', special_plans: [],
      department_source: 'yanzhao', department_updated_at: '2026-07-28',
      latest_year: 2026, latest_plan_year: 2026, plan_year_status: 'provided', plan_snapshot_at: '2026-07-28', latest_score_year: 2026, latest_min_score: 675, latest_enroll_count: 30,
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
  ].map((school) => ({
    ...school,
    reference_score: 0,
    reference_year: 0,
    reference_scope: '',
    latest_request_year: 2026,
    latest_request_status: 'success_with_data',
    latest_request_error: '',
    source: 'yanzhao',
    updated_at: '2026-07-28',
  }));

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
  if (filters.searchQuery?.trim()) {
    const query = filters.searchQuery.trim().toLowerCase();
    schools = schools.filter((s) =>
      [s.name, s.school_code, s.school_id].some((value) => value.toLowerCase().includes(query))
    );
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
      source_department_id: 'mock-1',
      plan_key: 'mock-plan-1',
      school_id: '1',
      major_code: '085400',
      name: '计算机科学与技术（学术学位）',
      research_direction: '机器学习与智能系统、计算机视觉与模式识别、自然语言处理、数据挖掘与推荐系统等。',
      exam_subjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制',
      exam_type: '统考',
      special_plans: [],
      enrollment_count: 28,
      source: 'yanzhao',
      updated_at: '2026-07-28',
      years: [
        { year: 2026, enroll_count: 28, min_score: 681, politics: 70, english: 70, math: 110, specialized: 120 },
        { year: 2025, enroll_count: 26, min_score: 672, politics: 68, english: 68, math: 105, specialized: 115 },
        { year: 2024, enroll_count: 24, min_score: 663, politics: 67, english: 67, math: 105, specialized: 114 },
        { year: 2023, enroll_count: 26, min_score: 654, politics: 65, english: 65, math: 100, specialized: 110 },
      ],
    },
    {
      department_id: 2,
      source_department_id: 'mock-2',
      plan_key: 'mock-plan-2',
      school_id: '1',
      major_code: '085400',
      name: '人工智能（专业学位）',
      research_direction: '机器学习、深度学习、计算机视觉、自然语言处理等。',
      exam_subjects: ['① 101 思想政治理论', '② 204 英语（二）', '③ 302 数学（二）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制',
      exam_type: '统考',
      special_plans: [],
      enrollment_count: 45,
      source: 'yanzhao',
      updated_at: '2026-07-28',
      years: [
        { year: 2026, enroll_count: 45, min_score: 670, politics: 68, english: 68, math: 105, specialized: 115 },
      ],
    },
    {
      department_id: 3,
      source_department_id: 'mock-3',
      plan_key: 'mock-plan-3',
      school_id: '1',
      major_code: '085400',
      name: '软件工程（专业学位）',
      research_direction: '软件工程理论与方法、软件工程技术、软件项目管理等。',
      exam_subjects: ['① 101 思想政治理论', '② 204 英语（二）', '③ 302 数学（二）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制',
      exam_type: '统考',
      special_plans: ['退役大学生士兵'],
      enrollment_count: 35,
      source: 'yanzhao',
      updated_at: '2026-07-28',
      years: [
        { year: 2026, enroll_count: 35, min_score: 665, politics: 66, english: 66, math: 102, specialized: 112 },
      ],
    },
    {
      department_id: 4,
      source_department_id: 'mock-4',
      plan_key: 'mock-plan-4',
      school_id: '1',
      major_code: '085400',
      name: '控制科学与工程（学术学位）',
      research_direction: '控制理论与控制工程、模式识别与智能系统、导航制导与控制等。',
      exam_subjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
      study_mode: '全日制',
      exam_type: '统考',
      special_plans: [],
      enrollment_count: 22,
      source: 'yanzhao',
      updated_at: '2026-07-28',
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

const PLAN_FAVORITES_STORAGE_KEY = 'yam-plan-favorites';
let browserPlanFavorites: PlanFavorite[] = [];

function readBrowserPlanFavorites(): PlanFavorite[] {
  if (typeof window === 'undefined') return browserPlanFavorites;
  try {
    const stored = window.localStorage.getItem(PLAN_FAVORITES_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    if (Array.isArray(parsed)) {
      browserPlanFavorites = parsed.filter(
        (item): item is PlanFavorite => item !== null && typeof item === 'object'
      );
    }
  } catch {
    // Keep the in-memory fallback when storage is unavailable or malformed.
  }
  return browserPlanFavorites;
}

function writeBrowserPlanFavorites(favorites: PlanFavorite[]): void {
  browserPlanFavorites = favorites;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PLAN_FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // The in-memory copy remains usable when localStorage is unavailable.
  }
}

export async function fetchPlanFavorites(): Promise<PlanFavorite[]> {
  if (isTauri) {
    return invokeApp('fetch_plan_favorites', undefined, '加载计划收藏失败');
  }
  return [...readBrowserPlanFavorites()];
}

export async function removePlanFavorite(plan: PlanFavorite): Promise<void> {
  if (isTauri) {
    await invokeApp('remove_plan_favorite', {
      schoolId: plan.school_id,
      majorCode: plan.major_code,
      departmentName: plan.department_name,
      researchDirection: plan.research_direction,
      examSubjects: plan.exam_subjects,
    }, '移除计划收藏失败');
    return;
  }

  const key = planFavoriteKey(plan);
  writeBrowserPlanFavorites(
    readBrowserPlanFavorites().filter((favorite) => planFavoriteKey(favorite) !== key)
  );
}

export async function togglePlanFavorite(plan: WorkspacePlanRow): Promise<boolean> {
  if (isTauri) {
    return invokeApp('toggle_plan_favorite', {
      schoolId: plan.school_id,
      schoolName: plan.school_name,
      majorCode: plan.major_code,
      departmentName: plan.department_name,
      researchDirection: plan.research_direction,
      examSubjects: plan.exam_subjects,
      studyMode: plan.study_mode,
      examType: plan.exam_type,
      specialPlans: plan.special_plans,
    }, '更新计划收藏失败');
  }

  const favorites = readBrowserPlanFavorites();
  const key = planFavoriteKey(plan);
  const existingIndex = favorites.findIndex((favorite) => planFavoriteKey(favorite) === key);
  if (existingIndex >= 0) {
    writeBrowserPlanFavorites(favorites.filter((_, index) => index !== existingIndex));
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  writeBrowserPlanFavorites([
    {
      favorite_id: now,
      school_id: plan.school_id,
      school_name: plan.school_name,
      major_code: plan.major_code,
      department_name: plan.department_name,
      research_direction: plan.research_direction,
      exam_subjects: [...plan.exam_subjects],
      study_mode: plan.study_mode,
      exam_type: plan.exam_type,
      special_plans: [...plan.special_plans],
      created_at: now,
    },
    ...favorites,
  ]);
  return true;
}

export async function fetchFavorites(majorCode?: string): Promise<Favorite[]> {
  if (isTauri) {
    return invokeApp('fetch_favorites', { majorCode: majorCode ?? null }, '加载学校收藏失败');
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
    return invokeApp('toggle_favorite', { schoolId, majorCode, majorName }, '更新学校收藏失败');
  }
  // Browser: no-op, just return true
  return true;
}

export async function fetchRecentViews(limit: number = 20): Promise<RecentView[]> {
  if (isTauri) {
    return invokeApp('fetch_recent_views', { limit }, '加载最近查看失败');
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
    await invokeApp('add_recent_view_command', { schoolId, majorCode, majorName }, '记录最近查看失败');
  }
}

export async function syncWorkspaceData(majorCode: string): Promise<string> {
  if (isTauri) {
    return invokeApp('sync_workspace_data', { majorCode }, '同步工作区数据失败');
  }
  return 'mock sync skipped';
}

export type CrawlTaskStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
export type CrawlErrorAction = 'login' | 'retry' | 'major-select' | 'major-management' | 'settings';

export interface CrawlErrorPresentation {
  title: string;
  impact: string;
  action: string;
  actionLabel: string;
  actionType: CrawlErrorAction;
  retryable: boolean;
  tone: 'warning' | 'error' | 'info';
}

export function getCrawlErrorPresentation(
  errorCode: string | null,
  status: CrawlTaskStatus,
  message: string | null
): CrawlErrorPresentation {
  const legacyLoginError = !errorCode && !!message
    && (message.includes('登录') || message.toLowerCase().includes('loginrequired'));

  if (status === 'cancelled') {
    return {
      title: '采集已取消',
      impact: '本次采集已停止，取消前成功记录的数据会保留。',
      action: '可以从上次成功位置继续采集。',
      actionLabel: '重试失败项',
      actionType: 'retry',
      retryable: true,
      tone: 'warning',
    };
  }
  if (errorCode === 'LOGIN_REQUIRED' || legacyLoginError) {
    return {
      title: '需要登录',
      impact: '采集尚未开始或已暂停，现有数据不会受影响。',
      action: '完成研招网登录后，系统会继续采集。',
      actionLabel: '立即登录',
      actionType: 'login',
      retryable: false,
      tone: 'warning',
    };
  }
  if (errorCode === 'UNKNOWN_MAJOR') {
    return {
      title: '专业目录需更新',
      impact: '当前专业不在本地目录中，本次采集无法开始。',
      action: '返回专业选择，更新目录后重新选择专业。',
      actionLabel: '返回专业选择',
      actionType: 'major-select',
      retryable: false,
      tone: 'warning',
    };
  }
  if (errorCode === 'NO_PUBLIC_DATA') {
    return {
      title: '暂无公开数据',
      impact: '当前专业没有可采集的公开院校数据，这不是程序故障。',
      action: '返回专业管理，选择其他专业或稍后再查看。',
      actionLabel: '返回专业管理',
      actionType: 'major-management',
      retryable: false,
      tone: 'info',
    };
  }
  if (errorCode === 'BROWSER_MISSING' || errorCode === 'BACKEND_MISSING') {
    return {
      title: errorCode === 'BROWSER_MISSING' ? 'Microsoft Edge 不可用' : '内置后端不可用',
      impact: '本次采集未启动，现有数据不会受影响。',
      action: errorCode === 'BROWSER_MISSING'
        ? '安装或更新 Microsoft Edge 后重试。'
        : '重新安装 YAM 后重试。',
      actionLabel: '查看本地诊断',
      actionType: 'settings',
      retryable: false,
      tone: 'warning',
    };
  }
  const isTransientFailure = errorCode === 'UNREACHABLE'
    || errorCode === 'TIMEOUT'
    || errorCode === 'FAILED';
  return {
    title: errorCode === 'TIMEOUT' ? '采集超时' : errorCode === 'UNREACHABLE' ? '暂时无法连接数据源' : '采集失败',
    impact: isTransientFailure
      ? '本次采集未全部完成，已成功记录的数据会保留。'
      : '本次采集未完成，已成功记录的数据会保留。',
    action: errorCode === 'UNREACHABLE'
      ? '检查网络连接后重试失败项。'
      : errorCode === 'TIMEOUT'
        ? '网络稳定后重试失败项。'
        : '重试失败项；若仍失败，请查看采集日志。',
    actionLabel: '重试失败项',
    actionType: 'retry',
    retryable: true,
    tone: 'error',
  };
}

export interface CrawlProgress {
  status: CrawlTaskStatus;
  running: boolean;
  major_code: string;
  current: number;
  total: number;
  current_name: string;
  done: boolean;
  success: number;
  failed: number;
  skipped: number;
  error_code: string | null;
  error: string | null;
}

export async function runCrawl(majorCode: string, force = false): Promise<void> {
  if (isTauri) {
    await invokeApp('run_crawl', { majorCode, force }, '启动采集失败');
    return;
  }
  throw normalizeAppError('浏览器环境不支持直接采集', '启动采集失败');
}

export async function getCrawlProgress(): Promise<CrawlProgress> {
  if (isTauri) {
    return invokeApp('get_crawl_progress', undefined, '获取采集进度失败');
  }
  return {
    status: 'idle',
    running: false,
    major_code: '',
    current: 0,
    total: 0,
    current_name: '',
    done: false,
    success: 0,
    failed: 0,
    skipped: 0,
    error_code: null,
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
