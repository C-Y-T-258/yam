import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrendChart } from './TrendChart';

const year = (year: number, min_score: number, enroll_count = 20) => ({
  year,
  min_score,
  enroll_count,
});

describe('TrendChart', () => {
  it('空数据时显示暂无最低分数据', () => {
    render(<TrendChart years={[]} dataKey="min_score" title="最低分趋势" />);
    expect(screen.getByText('暂无最低分数据')).toBeInTheDocument();
  });

  it.each([
    ['单条', [year(2025, 338)]],
    ['平坦', [year(2025, 338), year(2024, 338)]],
  ])('%s数据渲染 SVG 且不产生 NaN', (_, years) => {
    const { container } = render(
      <TrendChart years={years} dataKey="min_score" title="最低分趋势" />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('显示标题、年份和数值', () => {
    render(
      <TrendChart
        years={[year(2025, 338), year(2024, 326)]}
        dataKey="min_score"
        title="最低分趋势"
      />
    );
    expect(screen.getByRole('heading', { name: '最低分趋势' })).toBeVisible();
    expect(screen.getByText('2025')).toBeVisible();
    expect(screen.getByText('2024')).toBeVisible();
    const hitTargets = document.querySelectorAll('circle[fill="transparent"]');
    fireEvent.mouseEnter(hitTargets[1]);
    expect(screen.getByText('最低分 338')).toBeVisible();
  });
});
