import { useState } from 'react';
import { motion } from 'framer-motion';
import { getTrendScaleDomain } from '../lib/workspace-utils';

interface YearData {
  year: number;
  enroll_count: number;
  min_score: number;
}

interface TrendChartProps {
  years: YearData[];
  dataKey: 'min_score' | 'enroll_count';
  title: string;
  chartHeight?: number;
}

export function TrendChart({ years, dataKey, title, chartHeight = 260 }: TrendChartProps) {
  const data = [...years].reverse();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const valueLabel = dataKey === 'min_score' ? '最低分' : '招生人数';

  if (data.length === 0) {
    return (
      <div className="border border-gray-200 rounded-xl p-4 h-52 flex items-center justify-center text-sm text-gray-400 bg-white w-full max-w-2xl mx-auto">
        暂无{valueLabel}数据
      </div>
    );
  }

  const values = data.map((d) => d[dataKey]);
  const { minScale, maxScale, range, isFlat } = getTrendScaleDomain(values);
  const height = Math.max(120, chartHeight);
  const width = 420;
  const padLeft = 38;
  const padRight = 24;
  const padTop = Math.max(10, Math.round(height * 0.08));
  const padBottom = Math.max(20, Math.round(height * 0.15));
  const drawWidth = width - padLeft - padRight;
  const drawHeight = height - padTop - padBottom;
  const getX = (i: number) =>
    data.length <= 1 ? padLeft + drawWidth / 2 : padLeft + (i / (data.length - 1)) * drawWidth;
  const getY = (value: number) => padTop + drawHeight - ((value - minScale) / range) * drawHeight;
  const tickCount = height <= 140 ? 3 : height <= 200 ? 4 : 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round(maxScale - (i / tickCount) * range)
  );
  const points = data.map((d, i) => ({ x: getX(i), y: getY(d[dataKey]) }));
  const linePath =
    data.length === 1
      ? `M ${points[0].x} ${points[0].y}`
      : points.reduce((acc, p, i, arr) => {
          if (i === 0) return `M ${p.x} ${p.y}`;
          const prev = arr[i - 1];
          const cp1x = prev.x + (p.x - prev.x) / 4;
          const cp1y = prev.y;
          const cp2x = p.x - (p.x - prev.x) / 4;
          const cp2y = p.y;
          return `${acc} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p.x} ${p.y}`;
        }, '');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padBottom} L ${points[0].x} ${height - padBottom} Z`;
  const chartKey = `${dataKey}-${data.map((d) => d.year).join('-')}`;
  const hovered = hoverIdx !== null ? data[hoverIdx] : null;
  const isCompact = height <= 160;
  const cardPadding = isCompact ? 'p-2.5' : 'p-4';
  const titleMargin = isCompact ? 'mb-2' : 'mb-3';
  const xLabelHeight = isCompact ? 22 : 28;
  const strokeWidth = isCompact ? 1.5 : 2;
  const pointRadius = isCompact ? 3 : 4;
  const hoverRadius = isCompact ? 5 : 6.5;

  return (
    <div className={`border border-gray-200 rounded-xl ${cardPadding} bg-white w-full max-w-2xl mx-auto shadow-sm`}>
      <div className={`flex items-center justify-between ${titleMargin}`}>
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
        {isFlat && (
          <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
            无变化
          </span>
        )}
      </div>
      <div
        className="grid grid-cols-[38px_1fr] gap-x-2 gap-y-0.5"
        style={{ gridTemplateRows: `1fr ${xLabelHeight}px` }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <div
          className="flex flex-col justify-between text-[11px] text-gray-400 text-right pr-1 pointer-events-none"
          style={{ paddingTop: `${padTop}px`, paddingBottom: `${padBottom}px` }}
        >
          {ticks.map((t, i) => <span key={i}>{t}</span>)}
        </div>
        <div className="relative w-full" style={{ aspectRatio: `${width} / ${height}` }}>
          <svg
            className="absolute inset-0 w-full h-full overflow-visible"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={`areaGradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
                <stop offset="55%" stopColor="#3b82f6" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </linearGradient>
              <filter id={`shadow-${dataKey}`} x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#2563eb" floodOpacity="0.22" />
              </filter>
            </defs>
            {ticks.map((_, i) => {
              const y = padTop + (i / tickCount) * drawHeight;
              return <line key={`grid-h-${i}`} x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#f1f5f9" strokeWidth="1" />;
            })}
            {data.length > 1 && data.map((_, i) => {
              const x = getX(i);
              return <line key={`grid-v-${i}`} x1={x} y1={padTop} x2={x} y2={height - padBottom} stroke="#f8fafc" strokeWidth="1" />;
            })}
            <line x1={padLeft} y1={height - padBottom} x2={width - padRight} y2={height - padBottom} stroke="#e2e8f0" strokeWidth="1" />
            <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} stroke="#e2e8f0" strokeWidth="1" />
            <motion.path key={`area-${chartKey}`} d={areaPath} fill={`url(#areaGradient-${dataKey})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, ease: 'easeInOut' }} />
            <motion.path key={`path-${chartKey}`} d={linePath} fill="none" stroke="#2563eb" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.8, ease: 'easeInOut' }} />
            {data.map((d, i) => {
              const x = getX(i);
              const y = getY(d[dataKey]);
              const isHovered = hoverIdx === i;
              return (
                <g key={d.year}>
                  <circle cx={x} cy={y} r="14" fill="transparent" style={{ cursor: 'pointer' }} onMouseEnter={() => setHoverIdx(i)} />
                  <motion.circle cx={x} cy={y} r={isHovered ? hoverRadius : pointRadius} fill="#ffffff" stroke={isHovered ? '#1e3a5f' : '#2563eb'} strokeWidth={strokeWidth} filter={isHovered ? `url(#shadow-${dataKey})` : undefined} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 + i * 0.08, duration: 0.25, type: 'spring', stiffness: 320 }} style={{ pointerEvents: 'none' }} />
                </g>
              );
            })}
          </svg>
          {hovered && hoverIdx !== null && (
            <div
              className="absolute z-10 pointer-events-none bg-gray-900/95 backdrop-blur text-white text-[11px] rounded-md px-2.5 py-1.5 shadow-xl whitespace-nowrap"
              style={{
                left: `${((getX(hoverIdx) - padLeft) / (width - padLeft - padRight)) * 100}%`,
                top: `${((getY(hovered[dataKey]) - padTop) / (height - padTop - padBottom)) * 100}%`,
                transform: 'translate(-50%, calc(-100% - 10px))',
              }}
            >
              <div className="font-semibold">{hovered.year}年</div>
              <div className="text-gray-300">{valueLabel} {hovered[dataKey]}</div>
            </div>
          )}
        </div>
        <div />
        <div className="flex justify-between text-[11px] text-gray-400 px-[2px] pointer-events-none">
          {data.map((d) => <span key={d.year}>{d.year}</span>)}
        </div>
      </div>
    </div>
  );
}
