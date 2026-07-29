import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FilterOptions, WorkspaceFilters } from '../lib/db';
import { WorkspaceFilterPanel } from './WorkspaceFilterPanel';

const options: FilterOptions = {
  provinces: [],
  region_groups: [],
  levels: [],
  level_tags: [],
  study_modes: [],
  exam_types: [],
  special_plans: [],
  foreign_subjects: [],
  business_one_subjects: [],
  business_two_subjects: [],
  has_self_scoring: false,
  has_doctoral: false,
  has_double_first_class: false,
  has_self_scoring_tag: false,
  has_research_institute: false,
};
const filters: WorkspaceFilters = { sortBy: 'min_score', sortOrder: 'desc' };

const renderPanel = (props?: { viewMode?: 'school' | 'plan'; filters?: WorkspaceFilters }) => {
  const onChange = vi.fn();
  render(
    <WorkspaceFilterPanel
      options={options}
      filters={props?.filters ?? filters}
      onChange={onChange}
      viewMode={props?.viewMode}
    />
  );
  return onChange;
};

describe('WorkspaceFilterPanel', () => {
  it('school 模式不显示院系和方向排序，plan 模式显示', () => {
    const { rerender } = render(
      <WorkspaceFilterPanel options={options} filters={filters} onChange={vi.fn()} viewMode="school" />
    );
    expect(screen.queryByRole('option', { name: '按院系名称' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '按研究方向' })).not.toBeInTheDocument();

    rerender(
      <WorkspaceFilterPanel options={options} filters={filters} onChange={vi.fn()} viewMode="plan" />
    );
    expect(screen.getByRole('option', { name: '按院系名称' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '按研究方向' })).toBeInTheDocument();
  });

  it('选择研究方向排序触发升序 onChange', async () => {
    const user = userEvent.setup();
    const onChange = renderPanel({ viewMode: 'plan' });
    await user.selectOptions(screen.getByRole('combobox'), 'research_direction-asc');
    expect(onChange).toHaveBeenCalledWith({
      ...filters,
      sortBy: 'research_direction',
      sortOrder: 'asc',
    });
  });

  it('应用研究方向关键词，并可重置清除', async () => {
    const user = userEvent.setup();
    const onChange = renderPanel({
      viewMode: 'plan',
      filters: { ...filters, researchDirection: '旧方向' },
    });

    await user.click(screen.getByRole('button', { name: '更多筛选' }));
    await user.click(screen.getByRole('button', { name: /研究方向关键词/ }));
    const input = screen.getByPlaceholderText('例如：人工智能');
    await user.clear(input);
    await user.type(input, ' 人工智能 ');
    await user.click(screen.getByRole('button', { name: '应用' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ researchDirection: '人工智能' }));

    await user.click(screen.getByRole('button', { name: '更多筛选' }));
    await user.click(screen.getByRole('button', { name: '重置' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ researchDirection: undefined }));
  });
});
