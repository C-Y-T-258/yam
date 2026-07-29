import type { WorkspaceDepartment, WorkspacePlanRow, WorkspaceYear } from './db';

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

export function getDirectionLabel(item: DirectionLike): string {
  return item.research_direction.trim()
    || item.exam_subjects.filter(Boolean).join(' / ')
    || item.special_plans.filter(Boolean).join(' / ')
    || '未注明研究方向';
}

export function getScoreScopeLabel(year?: WorkspaceYear): string {
  return year?.score_scope ? SCORE_SCOPE_LABELS[year.score_scope] : '分数参考';
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
  const latestYear = plan.years[0];
  return [
    plan.school_code, plan.school_name, plan.major_code, majorName,
    plan.province, plan.level, plan.department_name, getDirectionLabel(plan),
    plan.exam_subjects.join('; '), plan.study_mode, plan.exam_type,
    plan.special_plans.join('; '), plan.school_source, plan.school_updated_at,
    plan.department_source, plan.department_updated_at, plan.latest_year, plan.latest_min_score,
    getScoreScopeLabel(latestYear), plan.latest_enroll_count, latestYear?.source || '',
    latestYear?.updated_at || '', latestYear?.match_note || '',
  ];
}
