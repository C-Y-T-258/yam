import type { WorkspaceDepartment, WorkspacePlanRow, WorkspaceSchool, WorkspaceYear } from './db';

export type ExportCell = string | number;

export type WorkspaceLoadingMode = 'idle' | 'initial' | 'refreshing';

export function getWorkspaceLoadingMode(hasData: boolean, pending: boolean): WorkspaceLoadingMode {
  if (!pending) return 'idle';
  return hasData ? 'refreshing' : 'initial';
}

export function getWorkspaceRefreshError(message: string, hasData: boolean): string {
  return hasData ? `刷新失败，当前仍显示上次结果：${message}` : message;
}

type DirectionLike = Pick<WorkspaceDepartment, 'research_direction' | 'exam_subjects' | 'special_plans'>;

type ScoreScope = NonNullable<WorkspaceYear['score_scope']>;

const SCORE_SCOPE_LABELS: Record<ScoreScope, string> = {
  exact_direction: '方向分数线',
  department: '院系分数线',
  school_major: '院校专业参考线',
  first_level_reference: '一级学科参考线',
  category_reference: '门类参考线',
};

export type DirectionLabelType = 'direction' | 'exam_subject' | 'special_plan' | 'unspecified';

export interface DirectionLabel {
  label: string;
  label_type: DirectionLabelType;
  is_fallback: boolean;
}

export function getDirectionInfo(item: DirectionLike): DirectionLabel {
  const direction = item.research_direction.trim();
  if (direction) return { label: direction, label_type: 'direction', is_fallback: false };
  const subjects = item.exam_subjects.filter(Boolean).join(' / ');
  if (subjects) return { label: subjects, label_type: 'exam_subject', is_fallback: true };
  const plans = item.special_plans.filter(Boolean).join(' / ');
  if (plans) return { label: plans, label_type: 'special_plan', is_fallback: true };
  return { label: '未注明研究方向', label_type: 'unspecified', is_fallback: true };
}

export function getDirectionLabel(item: DirectionLike): string {
  return getDirectionInfo(item).label;
}

export function getScoreScopeLabel(year?: WorkspaceYear): string {
  return year?.score_scope ? SCORE_SCOPE_LABELS[year.score_scope] : '分数参考';
}

export function getLatestScoreYear(plan: Pick<WorkspacePlanRow, 'years'> & Partial<Pick<WorkspacePlanRow, 'latest_score_year'>>): WorkspaceYear | undefined {
  return plan.years.find((year) => year.year === plan.latest_score_year)
    || plan.years.find((year) => year.score_scope !== 'first_level_reference' && year.score_scope !== 'category_reference');
}

export function getSchoolScoreStatus(school: WorkspaceSchool): string {
  if (school.min_score > 0) return `${school.min_score}`;
  if (school.latest_request_status === 'api_error') {
    return `${school.latest_request_year || '最新年份'}专业分数线获取失败`;
  }
  if (school.reference_score > 0) {
    const scope = school.reference_scope === 'category_reference' ? '门类参考线' : '一级学科参考线';
    return `暂无该专业分数线；${school.reference_year}年${scope}${school.reference_score}`;
  }
  if (school.latest_request_status === 'success_empty') {
    return `${school.latest_request_year || '最新年份'}未返回该专业或参考分数线`;
  }
  return '尚未取得该专业分数线';
}

export function getSchoolScoreNote(school: WorkspaceSchool): string {
  const notes: string[] = [];
  if (school.latest_request_status === 'api_error') {
    notes.push(`${school.latest_request_year || '最新年份'}专业分数线获取失败`);
  }
  if (school.reference_score > 0) {
    const scope = school.reference_scope === 'category_reference' ? '门类参考线' : '一级学科参考线';
    notes.push(`${school.reference_year}年${scope}${school.reference_score}`);
  }
  return notes.join('；');
}

export interface TrendScaleDomain {
  minScale: number;
  maxScale: number;
  range: number;
  padding: number;
  isFlat: boolean;
}

export function getTrendScaleDomain(values: number[]): TrendScaleDomain {
  if (values.length === 0) {
    return { minScale: 0, maxScale: 1, range: 1, padding: 0.5, isFlat: true };
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const isFlat = minValue === maxValue;
  const rawSpan = Math.max(1, maxValue - minValue);
  const padding = isFlat ? Math.max(1, Math.abs(minValue) * 0.25) : rawSpan * 0.12;
  const minScale = minValue - padding;
  const maxScale = maxValue + padding;

  return { minScale, maxScale, range: maxScale - minScale, padding, isFlat };
}

export function getPlanExportCells(plan: WorkspacePlanRow, majorName: string): ExportCell[] {
  const latestYear = getLatestScoreYear(plan);
  const direction = getDirectionInfo(plan);
  return [
    plan.school_code, plan.school_name, plan.major_code, majorName,
    plan.province, plan.level, plan.department_name, direction.label,
    direction.label_type, direction.is_fallback ? '是' : '否',
    plan.exam_subjects.join('; '), plan.study_mode, plan.exam_type,
    plan.special_plans.join('; '), plan.school_source, plan.school_updated_at,
    plan.department_source, plan.department_updated_at, plan.latest_plan_year, plan.plan_year_status,
    plan.plan_snapshot_at, plan.latest_score_year,
    plan.latest_min_score, getScoreScopeLabel(latestYear), plan.latest_enroll_count, latestYear?.source || '',
    latestYear?.updated_at || '', latestYear?.match_note || '',
  ];
}
