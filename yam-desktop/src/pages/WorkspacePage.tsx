import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, Download,
  Star, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  MapPin, Award, BookOpen, Clock, Square
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { TopNav } from '../components/TopNav';
import { WorkspaceFilterPanel } from '../components/WorkspaceFilterPanel';
import {
  fetchWorkspaceData,
  fetchWorkspaceFilterOptions,
  fetchFavorites,
  toggleFavorite as toggleFavoriteApi,
  addRecentView,
  syncWorkspaceData,
  type WorkspaceSchool,
  type WorkspaceDepartment,
  type FilterOptions,
  type WorkspaceFilters,
} from '../lib/db';

interface YearData {
  year: number;
  enroll_count: number;
  min_score: number;
}

interface TrendChartProps {
  years: YearData[];
  dataKey: 'min_score' | 'enroll_count';
  title: string;
  baseMin?: number;
  baseMax?: number;
}

function TrendChart({ years, dataKey, title, baseMin, baseMax }: TrendChartProps) {
  const data = [...years].reverse();
  const values = data.map((d) => d[dataKey]);
  const minValue = values.length > 0 ? Math.min(...values) : baseMin ?? 0;
  const maxValue = values.length > 0 ? Math.max(...values) : baseMax ?? 100;
  const minScale = baseMin !== undefined ? Math.min(baseMin, minValue) : minValue;
  const maxScale = baseMax !== undefined ? Math.max(baseMax, maxValue) : maxValue;
  const range = maxScale - minScale || 1;

  const width = 160;
  const height = 80;
  const padLeft = 12;
  const padRight = 12;
  const padTop = 18;
  const padBottom = 4;
  const drawWidth = width - padLeft - padRight;
  const drawHeight = height - padTop - padBottom;

  const getX = (i: number) =>
    data.length <= 1 ? width / 2 : padLeft + (i / (data.length - 1)) * drawWidth;
  const getY = (value: number) => padTop + drawHeight - ((value - minScale) / range) * drawHeight;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(maxScale - p * range));

  const pathD = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d[dataKey])}`).join(' ');
  const chartKey = `${dataKey}-${data.map((d) => d.year).join('-')}`;

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <h4 className="text-xs font-medium text-gray-600 mb-3">{title}</h4>
      <div className="flex h-32">
        <div className="w-8 flex flex-col justify-between text-[10px] text-gray-500 pr-1">
          {ticks.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
        <div className="flex-1 relative">
          <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            {[0, 0.25, 0.5, 0.75, 1].map((p) => {
              const y = padTop + p * drawHeight;
              return (
                <line
                  key={`grid-${p}`}
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth="0.5"
                />
              );
            })}
            <motion.path
              key={`path-${chartKey}`}
              d={pathD}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: 'easeInOut' }}
            />
            {data.map((d, i) => {
              const x = getX(i);
              const y = getY(d[dataKey]);
              return (
                <g key={d.year}>
                  <motion.circle
                    cx={x}
                    cy={y}
                    r="4"
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth="1"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.3, type: 'spring', stiffness: 300 }}
                  />
                  <motion.text
                    x={x}
                    y={y - 8}
                    textAnchor="middle"
                    className="text-[8px]"
                    fill="#3b82f6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 + i * 0.1, duration: 0.3 }}
                  >
                    {d[dataKey]}
                  </motion.text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 ml-8 mt-1">
        {data.map((d) => (
          <span key={d.year}>{d.year}</span>
        ))}
      </div>
    </div>
  );
}

interface WorkspacePageProps {
  onOpenCompare?: () => void;
  onOpenManageMajors?: () => void;
  refreshNonce?: number;
}

export function WorkspacePage({ onOpenCompare, onOpenManageMajors, refreshNonce }: WorkspacePageProps) {
  const { crawledMajors, currentMajor, visibleMajorCodes, setCurrentMajor } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<WorkspaceFilters>({
    sortBy: 'min_score',
    sortOrder: 'desc',
  });

  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
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
  });

  const [expandedSchoolId, setExpandedSchoolId] = useState<string | null>(null);
  const [expandedDeptIndex, setExpandedDeptIndex] = useState<number>(0);
  const [activeYear, setActiveYear] = useState<number>(2026);
  const [showHistorical, setShowHistorical] = useState(false);

  const [schools, setSchools] = useState<WorkspaceSchool[]>([]);
  const [departments, setDepartments] = useState<WorkspaceDepartment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleMajors = useMemo(
    () => crawledMajors.filter((m) => visibleMajorCodes.includes(m.code)),
    [crawledMajors, visibleMajorCodes]
  );

  const majorCode = useMemo(() => {
    if (currentMajor && visibleMajors.some((m) => m.code === currentMajor)) {
      return currentMajor;
    }
    return visibleMajors[0]?.code ?? null;
  }, [currentMajor, visibleMajors]);
  const majorName = crawledMajors.find((m) => m.code === majorCode)?.name || '';

  useEffect(() => {
    if (currentMajor && visibleMajors.some((m) => m.code === currentMajor)) return;
    const fallback = visibleMajors[0]?.code ?? null;
    if (fallback && fallback !== currentMajor) {
      setCurrentMajor(fallback);
    }
  }, [visibleMajors, currentMajor, setCurrentMajor]);

  const loadFavorites = async () => {
    if (!majorCode) return;
    try {
      const data = await fetchFavorites(majorCode);
      setFavorites(new Set(data.map(f => f.school_id)));
    } catch (err) {
      console.error('加载收藏失败:', err);
    }
  };

  const loadWorkspaceData = async (schoolId: string = '') => {
    if (!majorCode) {
      setSchools([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchWorkspaceData(schoolId, majorCode, filters);
      setSchools(data.schools);
      if (schoolId) {
        setDepartments(data.departments);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    if (!majorCode) return;
    setIsLoading(true);
    setError(null);
    try {
      await syncWorkspaceData(majorCode);
      await loadWorkspaceData('');
      await loadFilterOptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFilterOptions = async () => {
    if (!majorCode) return;
    try {
      const options = await fetchWorkspaceFilterOptions(majorCode);
      setFilterOptions(options);
    } catch (err) {
      console.error('加载筛选项失败:', err);
    }
  };

  const resetAllFilters = () => {
    setFilters({
      sortBy: 'min_score',
      sortOrder: 'desc',
    });
    setSearchQuery('');
    setCurrentPageNum(1);
  };

  useEffect(() => {
    // 切换专业或首次进入工作区时自动刷新数据（含后端同步）
    // 若当前已有数据且不是强制刷新，则跳过重复加载
    if (!majorCode || (schools.length > 0 && !refreshNonce)) return;
    const autoSync = async () => {
      setIsLoading(true);
      setError(null);
      try {
        try {
          await syncWorkspaceData(majorCode);
        } catch (syncErr) {
          // 同步失败时降级使用 Tauri DB 现有数据，不阻塞加载
          console.warn('后端同步失败，使用现有数据:', syncErr);
        }
        const data = await fetchWorkspaceData('', majorCode, {
          sortBy: 'min_score',
          sortOrder: 'desc',
        });
        setSchools(data.schools);
        await loadFilterOptions();
        await loadFavorites();
        setExpandedSchoolId(null);
        setExpandedDeptIndex(0);
        setActiveYear(2026);
        setShowHistorical(false);
        resetAllFilters();
      } catch (err) {
        setError(err instanceof Error ? err.message : '刷新数据失败');
      } finally {
        setIsLoading(false);
      }
    };
    autoSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [majorCode, refreshNonce]);

  useEffect(() => {
    if (!refreshNonce || refreshNonce === 0) return;
    const reload = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchWorkspaceData('', majorCode, {
          sortBy: 'min_score',
          sortOrder: 'desc',
        });
        setSchools(data.schools);
        await loadFilterOptions();
        await loadFavorites();
        setExpandedSchoolId(null);
        setExpandedDeptIndex(0);
        setActiveYear(2026);
        setShowHistorical(false);
        resetAllFilters();
      } catch (err) {
        setError(err instanceof Error ? err.message : '刷新数据失败');
      } finally {
        setIsLoading(false);
      }
    };
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  useEffect(() => {
    loadWorkspaceData('');
    setExpandedSchoolId(null);
    setCurrentPageNum(1);
  }, [filters]);

  useEffect(() => {
    setCurrentPageNum(1);
  }, [searchQuery, pageSize]);

  const displayMajors = useMemo(() => {
    return visibleMajors.map((m) => m.name);
  }, [visibleMajors]);

  const hasNoVisibleMajors = crawledMajors.length > 0 && visibleMajors.length === 0;

  const toggleFavorite = async (id: string) => {
    try {
      await toggleFavoriteApi(id, majorCode, majorName);
      await loadFavorites();
    } catch (err) {
      setError(err instanceof Error ? err.message : '收藏操作失败');
    }
  };

  const toggleCompare = (id: string) => {
    setSelectedForCompare(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 3) {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleExpand = (id: string) => {
    if (expandedSchoolId === id) {
      setExpandedSchoolId(null);
    } else {
      setExpandedSchoolId(id);
      setExpandedDeptIndex(0);
      setActiveYear(2026);
      setShowHistorical(false);
      loadWorkspaceData(id);
      addRecentView(id, majorCode, majorName).catch(err => {
        console.error('记录最近查看失败:', err);
      });
    }
  };

  const filteredData = schools.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paginatedData = filteredData.slice((currentPageNum - 1) * pageSize, currentPageNum * pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));

  const expandedDept = departments[expandedDeptIndex];
  const yearData = expandedDept?.years.find(y => y.year === activeYear) || expandedDept?.years[0];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <TopNav activeTab="workspace" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6">
        {/* Current Majors Display */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">当前显示专业：</span>
            <div className="flex items-center gap-2">
              {displayMajors.length > 0 ? (
                displayMajors.map((major, index) => (
                  <span key={index} className="text-gray-700">
                    {major}
                    {index < displayMajors.length - 1 && <span className="text-gray-300 ml-2">|</span>}
                  </span>
                ))
              ) : crawledMajors.length > 0 ? (
                <span className="text-sm text-gray-400">未选择显示专业</span>
              ) : (
                <span className="text-sm text-gray-400">暂无专业数据</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索学校名称"
                disabled={!majorCode}
                className="pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:border-[#1e3a5f] disabled:bg-gray-50"
              />
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <motion.button
              onClick={handleSync}
              disabled={!majorCode}
              className="flex items-center gap-1 text-[#1e3a5f] hover:text-[#162d4a] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              whileHover={majorCode ? { scale: 1.02 } : undefined}
              whileTap={majorCode ? { scale: 0.97 } : undefined}
            >
              <RefreshCw size={14} />
              刷新数据
            </motion.button>
            <motion.button
              className="flex items-center gap-1 text-gray-600 hover:text-gray-800 text-sm"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Download size={14} />
              导出
              <ChevronDown size={14} />
            </motion.button>
            <motion.button
              onClick={onOpenManageMajors}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              管理显示专业
            </motion.button>
          </div>
        </div>

        {majorCode && (
          <>
            {/* Filters */}
            <WorkspaceFilterPanel
              options={filterOptions}
              filters={filters}
              onChange={setFilters}
              resultCount={filteredData.length}
            />

            {/* Loading / Error */}
            {isLoading && (
              <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
                <RefreshCw size={16} className="animate-spin mr-2" />
                加载中…
              </div>
            )}
            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            {/* Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[40px_40px_1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 bg-gray-50 text-sm text-gray-500 font-medium border-b border-gray-200">
            <div className="flex items-center justify-center">
              <Star size={16} />
            </div>
            <div className="flex items-center justify-center">
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300" />
            </div>
            <div>学校名称</div>
            <div className="w-40 text-center">院校层次</div>
            <div className="w-20 text-center">地区</div>
            <div className="w-20 text-center">最低分</div>
            <div className="w-20 text-center">招生人数</div>
            <div className="w-16 text-center">操作</div>
          </div>

          {/* Table Body */}
          {paginatedData.map((item, index) => (
            <div key={item.school_id}>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`grid grid-cols-[40px_40px_1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors items-center ${
                  expandedSchoolId === item.school_id ? 'bg-blue-50' : ''
                }`}
              >
                {/* Favorite */}
                <div className="flex items-center justify-center">
                  <motion.button
                    onClick={() => toggleFavorite(item.school_id)}
                    className={`transition-colors ${
                      favorites.has(item.school_id) ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'
                    }`}
                    whileTap={{ scale: 0.8 }}
                    animate={favorites.has(item.school_id) ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                    transition={{ duration: 0.35 }}
                  >
                    <Star size={18} fill={favorites.has(item.school_id) ? 'currentColor' : 'none'} />
                  </motion.button>
                </div>

                {/* Compare Checkbox */}
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={selectedForCompare.has(item.school_id)}
                    onChange={() => toggleCompare(item.school_id)}
                    className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
                  />
                </div>

                {/* School Name */}
                <div className="font-medium text-gray-900">{item.name}</div>

                {/* Level - 用标签显示 985/211/双一流 */}
                <div className="w-40 text-center">
                  <div className="flex flex-wrap justify-center gap-1">
                    {item.is_985 && (
                      <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-50 text-red-700 border border-red-200">985</span>
                    )}
                    {item.is_211 && (
                      <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-50 text-blue-700 border border-blue-200">211</span>
                    )}
                    {item.double_first_class && (
                      <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-50 text-green-700 border border-green-200">双一流</span>
                    )}
                    {!item.is_985 && !item.is_211 && !item.double_first_class && (
                      <span className="text-xs text-gray-500">{item.level}</span>
                    )}
                  </div>
                </div>

                {/* Region */}
                <div className="w-20 text-center text-gray-600">{item.province}</div>

                {/* Min Score */}
                <div className="w-20 text-center text-gray-900 font-medium">{item.min_score}</div>

                {/* Enrollment Count */}
                <div className="w-20 text-center text-gray-600">{item.enroll_count}</div>

                {/* Actions */}
                <div className="w-16 flex items-center justify-center">
                  <motion.button
                    onClick={() => handleToggleExpand(item.school_id)}
                    className="p-1 text-gray-400 hover:text-[#1e3a5f] transition-colors"
                    whileTap={{ scale: 0.9 }}
                  >
                    <motion.span
                      animate={{ rotate: expandedSchoolId === item.school_id ? 90 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="inline-block"
                    >
                      <ChevronRight size={18} />
                    </motion.span>
                  </motion.button>
                </div>
              </motion.div>

              {/* Expanded Detail Panel */}
              <AnimatePresence>
                {expandedSchoolId === item.school_id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-b border-gray-200"
                  >
                    <motion.div
                      className="flex bg-white"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1, duration: 0.3 }}
                    >
                      {/* Left - School Info */}
                      <div className="w-64 border-r border-gray-200 p-6 flex-shrink-0">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">{item.name}</h3>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 text-gray-600 text-sm">
                            <MapPin size={16} className="text-gray-400" />
                            <span>{item.province}</span>
                          </div>
                          <div className="flex items-center gap-3 text-gray-600 text-sm">
                            <Award size={16} className="text-gray-400" />
                            <div className="flex flex-wrap gap-1">
                              {item.is_985 && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-50 text-red-700 border border-red-200">985</span>}
                              {item.is_211 && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-50 text-blue-700 border border-blue-200">211</span>}
                              {item.double_first_class && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-50 text-green-700 border border-green-200">双一流</span>}
                              {!item.is_985 && !item.is_211 && !item.double_first_class && <span>{item.level}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-gray-600 text-sm">
                            <BookOpen size={16} className="text-gray-400" />
                            <span>学费：8000 元/年</span>
                          </div>
                          <div className="flex items-center gap-3 text-gray-600 text-sm">
                            <Clock size={16} className="text-gray-400" />
                            <span>学制：3 年</span>
                          </div>
                          <div className="flex items-center gap-3 text-gray-600 text-sm">
                            <Clock size={16} className="text-gray-400" />
                            <span>更新时间：2025-05-20</span>
                          </div>
                        </div>
                        <div className="mt-6 space-y-2">
                          <motion.button
                            onClick={() => toggleFavorite(item.school_id)}
                            className={`w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors ${
                              favorites.has(item.school_id) ? 'text-red-500 border-red-200 bg-red-50' : 'text-gray-600'
                            }`}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <Star size={14} fill={favorites.has(item.school_id) ? 'currentColor' : 'none'} />
                            {favorites.has(item.school_id) ? '已收藏' : '收藏'}
                          </motion.button>
                          <motion.button
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-gray-600 text-sm hover:bg-gray-50 transition-colors"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <Square size={14} />
                            加入比较
                          </motion.button>
                        </div>
                      </div>

                      {/* Right - Department Details */}
                      <div className="flex-1 p-6 overflow-auto max-h-[500px]">
                        {departments.map((dept, deptIdx) => (
                          <div key={deptIdx} className="mb-3">
                            {/* Department Header */}
                            <motion.button
                              onClick={() => setExpandedDeptIndex(deptIdx)}
                              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                              whileTap={{ scale: 0.995 }}
                            >
                              <span className="font-medium text-gray-900 text-sm flex items-center">
                                <motion.span
                                  animate={{ rotate: expandedDeptIndex === deptIdx ? 90 : 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="inline-block mr-2"
                                >
                                  <ChevronRight size={14} className="text-gray-500" />
                                </motion.span>
                                {dept.name}
                              </span>
                              <motion.span
                                animate={{ rotate: expandedDeptIndex === deptIdx ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="inline-block"
                              >
                                <ChevronUp size={14} className="text-gray-400" />
                              </motion.span>
                            </motion.button>

                            {/* Department Content */}
                            <AnimatePresence>
                              {expandedDeptIndex === deptIdx && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                                  className="overflow-hidden"
                                >
                                  <motion.div
                                    className="p-4 border border-gray-200 border-t-0 rounded-b-lg"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.15, duration: 0.2 }}
                                  >
                                    {/* Research Direction */}
                                    <div className="mb-4">
                                      <h4 className="text-xs font-medium text-gray-500 mb-1">研究方向</h4>
                                      <p className="text-sm text-gray-700">{dept.research_direction}</p>
                                    </div>

                                    {/* Exam Subjects */}
                                    <div className="mb-4">
                                      <h4 className="text-xs font-medium text-gray-500 mb-1">考试科目</h4>
                                      <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                                        {dept.exam_subjects.map((subject, i) => (
                                          <span key={i}>{subject}</span>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Year Tabs */}
                                    <div className="flex items-center gap-3 mb-3 border-b border-gray-200">
                                      {dept.years.map((y) => (
                                        <button
                                          key={y.year}
                                          onClick={() => {
                                            setActiveYear(y.year);
                                            setShowHistorical(false);
                                          }}
                                          className={`pb-2 text-sm font-medium transition-colors ${
                                            activeYear === y.year && !showHistorical
                                              ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f]'
                                              : 'text-gray-500 hover:text-gray-700'
                                          }`}
                                        >
                                          {y.year}
                                        </button>
                                      ))}
                                      <button
                                        onClick={() => setShowHistorical(true)}
                                        className={`pb-2 text-sm font-medium transition-colors ${
                                          showHistorical
                                            ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f]'
                                            : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                      >
                                        历年分析
                                      </button>
                                    </div>

                                    <AnimatePresence mode="wait">
                                      {/* Year Data */}
                                      {yearData && !showHistorical && (
                                        <motion.div
                                          key="year-data"
                                          initial={{ opacity: 0, x: -10 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          exit={{ opacity: 0, x: 10 }}
                                          transition={{ duration: 0.2 }}
                                          className="space-y-1 text-sm"
                                        >
                                          <div className="flex justify-between py-1.5 border-b border-gray-100">
                                            <span className="text-gray-500">招生人数</span>
                                            <span className="text-gray-900">{yearData.enroll_count}</span>
                                          </div>
                                          <div className="flex justify-between py-1.5 border-b border-gray-100">
                                            <span className="text-gray-500">最低分</span>
                                            <span className="text-gray-900 font-medium">{yearData.min_score}</span>
                                          </div>
                                          <div className="flex justify-between py-1.5 border-b border-gray-100">
                                            <span className="text-gray-500">政治</span>
                                            <span className="text-gray-900">{yearData.politics}</span>
                                          </div>
                                          <div className="flex justify-between py-1.5 border-b border-gray-100">
                                            <span className="text-gray-500">英语</span>
                                            <span className="text-gray-900">{yearData.english}</span>
                                          </div>
                                          <div className="flex justify-between py-1.5 border-b border-gray-100">
                                            <span className="text-gray-500">数学</span>
                                            <span className="text-gray-900">{yearData.math}</span>
                                          </div>
                                          <div className="flex justify-between py-1.5">
                                            <span className="text-gray-500">专业课</span>
                                            <span className="text-gray-900">{yearData.specialized}</span>
                                          </div>
                                        </motion.div>
                                      )}

                                      {/* Historical Analysis */}
                                      {showHistorical && (
                                        <motion.div
                                          key="historical"
                                          initial={{ opacity: 0, x: 10 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          exit={{ opacity: 0, x: -10 }}
                                          transition={{ duration: 0.2 }}
                                        >
                                          <table className="w-full text-sm mb-4">
                                          <thead>
                                            <tr className="border-b border-gray-200">
                                              <th className="text-left py-1.5 text-gray-500 font-medium">年份</th>
                                              <th className="text-right py-1.5 text-gray-500 font-medium">招生人数</th>
                                              <th className="text-right py-1.5 text-gray-500 font-medium">最低分</th>
                                              <th className="text-right py-1.5 text-gray-500 font-medium">政治</th>
                                              <th className="text-right py-1.5 text-gray-500 font-medium">英语</th>
                                              <th className="text-right py-1.5 text-gray-500 font-medium">数学</th>
                                              <th className="text-right py-1.5 text-gray-500 font-medium">专业课</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {dept.years.map((y) => (
                                              <tr key={y.year} className="border-b border-gray-100">
                                                <td className="py-1.5 text-gray-900">{y.year}</td>
                                                <td className="py-1.5 text-right text-gray-900">{y.enroll_count}</td>
                                                <td className="py-1.5 text-right text-gray-900 font-medium">{y.min_score}</td>
                                                <td className="py-1.5 text-right text-gray-900">{y.politics}</td>
                                                <td className="py-1.5 text-right text-gray-900">{y.english}</td>
                                                <td className="py-1.5 text-right text-gray-900">{y.math}</td>
                                                <td className="py-1.5 text-right text-gray-900">{y.specialized}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>

                                        {/* Charts */}
                                        <div className="grid grid-cols-2 gap-4">
                                          <TrendChart
                                            years={dept.years}
                                            dataKey="min_score"
                                            title="最低分趋势"
                                            baseMin={600}
                                            baseMax={720}
                                          />
                                          <TrendChart
                                            years={dept.years}
                                            dataKey="enroll_count"
                                            title="招生人数趋势"
                                            baseMax={40}
                                          />
                                        </div>
                                      </motion.div>
                                    )}
                                    </AnimatePresence>
                                  </motion.div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">共 {filteredData.length} 条</span>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => setCurrentPageNum(Math.max(1, currentPageNum - 1))}
              disabled={currentPageNum === 1}
              className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: currentPageNum === 1 ? 1 : 1.1 }}
              whileTap={{ scale: currentPageNum === 1 ? 1 : 0.9 }}
            >
              <ChevronLeft size={16} />
            </motion.button>
            {(() => {
              const windowSize = 5;
              let start = Math.max(1, currentPageNum - Math.floor(windowSize / 2));
              let end = Math.min(totalPages, start + windowSize - 1);
              if (end - start + 1 < windowSize) {
                start = Math.max(1, end - windowSize + 1);
              }
              const pages: (number | string)[] = [];
              if (start > 1) pages.push(1, '...');
              for (let i = start; i <= end; i++) pages.push(i);
              if (end < totalPages) pages.push('...', totalPages);
              return pages.map((page, idx) =>
                typeof page === 'string' ? (
                  <span key={`ellipsis-${idx}`} className="text-gray-400 px-1">
                    {page}
                  </span>
                ) : (
                  <motion.button
                    key={page}
                    onClick={() => setCurrentPageNum(page)}
                    className={`w-8 h-8 rounded text-sm ${
                      currentPageNum === page
                        ? 'bg-[#1e3a5f] text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {page}
                  </motion.button>
                )
              );
            })()}
            <motion.button
              onClick={() => setCurrentPageNum(Math.min(totalPages, currentPageNum + 1))}
              disabled={currentPageNum === totalPages}
              className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: currentPageNum === totalPages ? 1 : 1.1 }}
              whileTap={{ scale: currentPageNum === totalPages ? 1 : 0.9 }}
            >
              <ChevronRight size={16} />
            </motion.button>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="ml-2 px-2 py-1.5 text-sm text-gray-700 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f] bg-white"
            >
              <option value={10}>10 条/页</option>
              <option value={20}>20 条/页</option>
              <option value={50}>50 条/页</option>
            </select>
          </div>
        </div>
          </>
        )}

        {!majorCode && !isLoading && (
          <div className="flex flex-col items-center justify-center flex-1 py-20 text-gray-500">
            <p className="text-base mb-2">
              {crawledMajors.length > 0 ? '未选择显示专业' : '暂无专业数据'}
            </p>
            <p className="text-sm text-gray-400 mb-6">
              {crawledMajors.length > 0
                ? '请在「管理显示专业」中选择至少一个专业'
                : '请先在「专业管理」中添加或爬取专业'}
            </p>
            <motion.button
              onClick={onOpenManageMajors}
              className="px-5 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a]"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              管理显示专业
            </motion.button>
          </div>
        )}

        {/* Compare Floating Button */}
        <AnimatePresence>
          {selectedForCompare.size > 0 && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={onOpenCompare}
              className="fixed bottom-12 right-4 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg shadow-lg hover:bg-[#162d4a] transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              对比 ({selectedForCompare.size})
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
