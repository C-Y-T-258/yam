import { describe, expect, it } from 'vitest';
import type { WorkspacePlanRow, WorkspaceYear } from './db';
import {
  getDirectionInfo,
  getDirectionLabel,
  getEnrollmentCountLabel,
  getLatestScoreYear,
  getPlanEnrollmentLabel,
  getPlanExportCells,
  getPlanScoreLabel,
  getPlanScoreYearLabel,
  getPlanYearLabel,
  getScoreScopeLabel,
  getSchoolScoreStatus,
  getTrendScaleDomain,
  getWorkspaceLoadingMode,
  getWorkspaceRefreshError,
  hasPlanProfessionalScore,
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
  latest_plan_year: 2025,
  plan_year_status: 'provided',
  plan_snapshot_at: '2026-06-15T08:00:00Z',
  latest_score_year: 2025,
  latest_min_score: 338,
  latest_enroll_count: 24,
  latest_enroll_count_status: 'provided',
  latest_enroll_text: '专业：24(不含推免)',
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

  it('为 fallback 显式返回类型且真实方向优先', () => {
    expect(getDirectionInfo({ research_direction: '方向', exam_subjects: ['科目'], special_plans: [] }))
      .toMatchObject({ label: '方向', label_type: 'direction', is_fallback: false });
    expect(getDirectionInfo({ research_direction: '', exam_subjects: ['科目'], special_plans: [] }))
      .toMatchObject({ label_type: 'exam_subject', is_fallback: true });
    expect(getDirectionInfo({ research_direction: '', exam_subjects: [], special_plans: [] }))
      .toMatchObject({ label: '未注明研究方向', label_type: 'unspecified', is_fallback: true });
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

describe('getLatestScoreYear', () => {
  it('优先返回最新专业级分数，不被最新参考线覆盖', () => {
    const plan = {
      ...basePlan,
      latest_score_year: 2024,
      latest_min_score: 335,
      years: [
        { ...baseYear, year: 2025, min_score: 285, score_scope: 'first_level_reference' as const },
        { ...baseYear, year: 2024, min_score: 335, score_scope: 'school_major' as const },
      ],
    };
    expect(getLatestScoreYear(plan)).toMatchObject({ year: 2024, min_score: 335, score_scope: 'school_major' });
  });
});

describe('getPlanEnrollmentLabel', () => {
  it('基础招生人数标签保留 0，仅缺失值显示未提供', () => {
    expect(getEnrollmentCountLabel(0)).toBe(0);
    expect(getEnrollmentCountLabel(24)).toBe(24);
    expect(getEnrollmentCountLabel(null)).toBe('未提供');
    expect(getEnrollmentCountLabel(undefined)).toBe('未提供');
  });

  it('保留来源明确提供的 0，不显示为未提供', () => {
    expect(getPlanEnrollmentLabel({
      ...basePlan,
      latest_enroll_count: 0,
      latest_enroll_count_status: 'provided',
    })).toBe(0);
  });

  it('仅在状态未知时显示未提供', () => {
    expect(getPlanEnrollmentLabel({
      ...basePlan,
      latest_enroll_count: 0,
      latest_enroll_count_status: 'unknown',
    })).toBe('未提供');
  });
});

describe('getPlanYearLabel', () => {
  it('只有计划年份来源明确时显示年份，否则显示未知', () => {
    expect(getPlanYearLabel(basePlan)).toBe(2025);
    expect(getPlanYearLabel({
      ...basePlan,
      latest_plan_year: 0,
      plan_year_status: 'unknown',
    })).toBe('未知');
  });
});

describe('getSchoolScoreStatus', () => {
  const school = {
    school_id: 'school-1', major_code: '085410', name: '测试大学', province: '湖北', level: '',
    min_score: 0, reference_score: 0, reference_year: 0, reference_scope: '',
    latest_request_year: 2026, latest_request_status: '', latest_request_error: '', enroll_count: 0,
    self_scoring: false, doctoral_program: false, double_first_class: false,
    school_code: '', province_code: '', is_985: false, is_211: false, display_order: 0,
    source: 'yanzhao', updated_at: '',
  };

  it('解释API失败、一级学科参考线和门类参考线', () => {
    expect(getSchoolScoreStatus({ ...school, latest_request_status: 'api_error' }))
      .toBe('2026专业分数线获取失败');
    expect(getSchoolScoreStatus({ ...school, reference_score: 320, reference_year: 2026, reference_scope: 'first_level_reference' }))
      .toBe('暂无该专业分数线；2026年一级学科参考线320');
    expect(getSchoolScoreStatus({ ...school, reference_score: 300, reference_year: 2026, reference_scope: 'category_reference' }))
      .toBe('暂无该专业分数线；2026年门类参考线300');
  });
});

describe('plan score labels', () => {
  it('用显式状态判断计划专业级分数，不依赖 || fallback', () => {
    expect(hasPlanProfessionalScore(basePlan)).toBe(true);
    expect(getPlanScoreLabel(basePlan)).toBe(338);
    expect(getPlanScoreYearLabel(basePlan)).toBe('2025');

    const missing = { ...basePlan, latest_min_score: 0, latest_score_year: 0 };
    expect(hasPlanProfessionalScore(missing)).toBe(false);
    expect(getPlanScoreLabel(missing)).toBe('暂无');
    expect(getPlanScoreYearLabel(missing)).toBe('无分数年份');
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
  it('导出方向、目录年份状态、快照时间、粒度和来源元数据', () => {
    const cells = getPlanExportCells(basePlan, '电子信息');
    expect(cells).toHaveLength(30);
    expect(cells[7]).toBe('人工智能');
    expect(cells[8]).toBe('direction');
    expect(cells[18]).toBe(2025);
    expect(cells.slice(18, 22)).toEqual([2025, 'provided', '2026-06-15T08:00:00Z', 2025]);
    expect(cells[23]).toBe('方向分数线');
    expect(cells[24]).toBe(24);
    expect(cells[25]).toBe('provided');
    expect(cells[26]).toBe('专业：24(不含推免)');
    expect(cells.slice(27)).toEqual(['score-source', '2026-07-01T08:00:00Z', '按方向精确匹配']);
    expect(cells.slice(14, 18)).toEqual([
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
    expect(cells[23]).toBe('分数参考');
    expect(cells.slice(27)).toEqual(['', '', '']);
  });
});
