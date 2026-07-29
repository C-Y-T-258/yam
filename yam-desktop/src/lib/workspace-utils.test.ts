import { describe, expect, it } from 'vitest';
import type { WorkspacePlanRow, WorkspaceYear } from './db';
import {
  getDirectionLabel,
  getPlanExportCells,
  getScoreScopeLabel,
  getTrendScaleDomain,
  getWorkspaceLoadingMode,
  getWorkspaceRefreshError,
} from './workspace-utils';

const baseYear: WorkspaceYear = {
  year: 2025,
  enroll_count: 24,
  min_score: 338,
  politics: 45,
  english: 50,
  math: 75,
  specialized: 90,
  score_scope: 'exact_direction',
  source: 'score-source',
  updated_at: '2026-07-01T08:00:00Z',
  match_note: '按方向精确匹配',
};

const basePlan: WorkspacePlanRow = {
  school_id: 'school-1',
  school_code: '10001',
  school_name: '测试大学',
  province: '北京',
  level: '985',
  is_985: true,
  is_211: true,
  double_first_class: true,
  self_scoring: true,
  doctoral_program: true,
  display_order: 1,
  school_source: 'school-source',
  school_updated_at: '2026-06-01T08:00:00Z',
  major_code: '085410',
  department_id: 101,
  source_department_id: 'dept-source-id',
  plan_key: 'plan:test-1',
  department_name: '计算机学院',
  research_direction: '人工智能',
  exam_subjects: ['101政治', '204英语二'],
  study_mode: '全日制',
  exam_type: '统考',
  special_plans: ['退役大学生士兵'],
  department_source: 'plan-source',
  department_updated_at: '2026-06-15T08:00:00Z',
  latest_year: 2025,
  latest_min_score: 338,
  latest_enroll_count: 24,
  years: [baseYear],
};

describe('workspace stale-while-revalidate', () => {
  it('已有数据刷新时保留内容并进入局部刷新状态', () => {
    const previousRows = [basePlan];
    expect(getWorkspaceLoadingMode(previousRows.length > 0, true)).toBe('refreshing');
    expect(previousRows).toEqual([basePlan]);
  });

  it('仅无数据的首次查询进入初始 loading', () => {
    expect(getWorkspaceLoadingMode(false, true)).toBe('initial');
    expect(getWorkspaceLoadingMode(true, false)).toBe('idle');
  });

  it('刷新失败明确说明仍显示上次结果', () => {
    expect(getWorkspaceRefreshError('网络不可用', true)).toBe('刷新失败，当前仍显示上次结果：网络不可用');
    expect(getWorkspaceRefreshError('网络不可用', false)).toBe('网络不可用');
  });
});

describe('getDirectionLabel', () => {
  it.each([
    [{ research_direction: '人工智能', exam_subjects: ['科目'], special_plans: ['专项'] }, '人工智能'],
    [{ research_direction: '  ', exam_subjects: ['', '101政治', '204英语二'], special_plans: ['专项'] }, '101政治 / 204英语二'],
    [{ research_direction: '', exam_subjects: ['', ''], special_plans: ['', '少干计划'] }, '少干计划'],
    [{ research_direction: '', exam_subjects: [], special_plans: ['', ''] }, '未注明研究方向'],
  ])('按方向、科目、专项、默认值依次 fallback', (item, expected) => {
    expect(getDirectionLabel(item)).toBe(expected);
  });
});

describe('getScoreScopeLabel', () => {
  it.each([
    ['exact_direction', '方向分数线'],
    ['department', '院系分数线'],
    ['school_major', '院校专业参考线'],
    ['first_level_reference', '一级学科参考线'],
    ['category_reference', '门类参考线'],
  ] as const)('映射 %s', (scoreScope, expected) => {
    expect(getScoreScopeLabel({ ...baseYear, score_scope: scoreScope })).toBe(expected);
  });
});

describe('getTrendScaleDomain', () => {
  it('为平坦数据构造对称且合理的 padding', () => {
    const domain = getTrendScaleDomain([300, 300]);
    expect(domain).toMatchObject({ minScale: 225, maxScale: 375, padding: 75, isFlat: true });
    expect(domain.range).toBe(150);
  });

  it('为正常跨度增加 12% padding', () => {
    const domain = getTrendScaleDomain([300, 350]);
    expect(domain.minScale).toBe(294);
    expect(domain.maxScale).toBe(356);
    expect(domain.padding).toBe(6);
    expect(domain.range).toBe(62);
  });

  it.each([{ values: [] }, { values: [42] }])('空值和单值边界不会产生 NaN', ({ values }) => {
    const domain = getTrendScaleDomain(values);
    expect(Object.values(domain).every((value) => typeof value === 'boolean' || Number.isFinite(value))).toBe(true);
    expect(domain.range).toBeGreaterThan(0);
    expect(domain.padding).toBeGreaterThan(0);
  });
});

describe('getPlanExportCells', () => {
  it('导出全部 23 列及方向、粒度和来源元数据', () => {
    const cells = getPlanExportCells(basePlan, '电子信息');
    expect(cells).toHaveLength(23);
    expect(cells[7]).toBe('人工智能');
    expect(cells[18]).toBe('方向分数线');
    expect(cells.slice(20)).toEqual(['score-source', '2026-07-01T08:00:00Z', '按方向精确匹配']);
    expect(cells.slice(12, 16)).toEqual([
      'school-source',
      '2026-06-01T08:00:00Z',
      'plan-source',
      '2026-06-15T08:00:00Z',
    ]);
  });

  it('导出方向 fallback，并在无年份时保留来源列空值', () => {
    const plan = {
      ...basePlan,
      research_direction: '',
      exam_subjects: ['', '408计算机学科专业基础'],
      special_plans: [],
      years: [],
    };
    const cells = getPlanExportCells(plan, '电子信息');
    expect(cells[7]).toBe('408计算机学科专业基础');
    expect(cells[18]).toBe('分数参考');
    expect(cells.slice(20)).toEqual(['', '', '']);
  });
});
