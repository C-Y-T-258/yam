import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, Download,
  Star, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  MapPin, Award, BookOpen, Clock, Square, X, AlertCircle, RotateCw
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { toast } from '../stores/toastStore';
import { TopNav } from '../components/TopNav';
import { WorkspaceFilterPanel } from '../components/WorkspaceFilterPanel';
import {
  fetchWorkspaceData,
  fetchWorkspaceFilterOptions,
  fetchWorkspacePlans,
  fetchFavorites,
  toggleFavorite as toggleFavoriteApi,
  addRecentView,
  syncWorkspaceData,
  isTauri,
  type WorkspaceSchool,
  type WorkspaceDepartment,
  type WorkspacePlanRow,
  type WorkspaceData,
  type FilterOptions,
  type WorkspaceFilters,
} from '../lib/db';

interface YearData {
  year: number;
  enroll_count: number;
  min_score: number;
}

// ISSUE-027：聚合后的院校行。同 school_id 多专业合并为一行。
interface AggregatedSchool extends WorkspaceSchool {
  major_codes: string[];
  _raw: WorkspaceSchool[]; // 原始行，供展开与导出用
  major_count: number;
}

// ISSUE-028：导出数据结构。CSV/Excel 共用 cellRows（已字符串化的扁平行），
// JSON 用 jsonRows（含完整原始字段 + major_name）。
type ExportCell = string | number; // 布尔字段已转"是"/"否"字符串
type ExportFormat = 'csv' | 'excel' | 'json';
interface ExportData {
  headers: string[];
  cellRows: ExportCell[][]; // CSV + Excel 用
  jsonRows: object[]; // JSON 用（含完整 _raw / years[] + major_name）
  filenameBase: string; // 不含扩展名
  viewMode: 'school' | 'plan';
  majorCodes: string[];
}
// CSV 字段转义：包含 , " \n 的字段用双引号包裹，内部双引号转义为 ""
// （原 handleExport 两处重复的 escapeField 合并为单一实现）
const escapeField = (v: ExportCell): string => {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

interface TrendChartProps {
  years: YearData[];
  dataKey: 'min_score' | 'enroll_count';
  title: string;
  baseMin?: number;
  baseMax?: number;
}

function TrendChart({ years, dataKey, title, baseMin, baseMax }: TrendChartProps) {
  const data = [...years].reverse();
  // UX-4.2：hover tooltip。悬停数据点时显示年份+数值，并放大该点高亮。
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
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

  // UX-4.2：viewBox 坐标 → 容器百分比。SVG 用 preserveAspectRatio="none"，
  // 容器宽高与 viewBox 比例不同，按百分比定位 HTML tooltip 才能跟随缩放。
  const xPercent = (x: number) => (x / width) * 100;
  const yPercent = (y: number) => (y / height) * 100;
  const hovered = hoverIdx !== null ? data[hoverIdx] : null;
  // 边缘 clamp，避免首末点 tooltip 超出容器
  const hoveredX = hoverIdx !== null ? Math.min(85, Math.max(15, xPercent(getX(hoverIdx)))) : 0;
  const hoveredY = hoverIdx !== null ? yPercent(getY(data[hoverIdx][dataKey])) : 0;
  const valueLabel = dataKey === 'min_score' ? '最低分' : '招生人数';

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <h4 className="text-xs font-medium text-gray-600 mb-3">{title}</h4>
      <div className="flex h-32">
        <div className="w-8 flex flex-col justify-between text-[10px] text-gray-500 pr-1">
          {ticks.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
        <div
          className="flex-1 relative"
          onMouseLeave={() => setHoverIdx(null)}
        >
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
              const isHovered = hoverIdx === i;
              return (
                <g key={d.year}>
                  {/* UX-4.2：透明命中区扩大悬停范围，便于精准 hover */}
                  <circle
                    cx={x}
                    cy={y}
                    r="10"
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoverIdx(i)}
                  />
                  <motion.circle
                    cx={x}
                    cy={y}
                    r={isHovered ? 5 : 4}
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth="1"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.3, type: 'spring', stiffness: 300 }}
                    style={{ pointerEvents: 'none' }}
                  />
                  <motion.text
                    x={x}
                    y={y - 8}
                    textAnchor="middle"
                    className="text-[8px]"
                    fill={isHovered ? '#1e3a5f' : '#3b82f6'}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 + i * 0.1, duration: 0.3 }}
                    style={{ pointerEvents: 'none' }}
                  >
                    {d[dataKey]}
                  </motion.text>
                </g>
              );
            })}
          </svg>
          {/* UX-4.2：hover tooltip（HTML 浮层，百分比定位跟随缩放） */}
          {hovered && (
            <div
              className="absolute z-10 pointer-events-none bg-gray-900 text-white text-[10px] rounded px-2 py-1 shadow-lg whitespace-nowrap"
              style={{
                left: `${hoveredX}%`,
                top: `${hoveredY}%`,
                transform: 'translate(-50%, calc(-100% - 6px))',
              }}
            >
              {hovered.year}年 · {valueLabel} {hovered[dataKey]}
            </div>
          )}
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
  const { crawledMajors, selectedMajorCodes, visibleMajorCodes, setSelectedMajorCodes, viewMode, setViewMode } = useAppStore();
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

  // ISSUE-027 阶段 2：招生计划视图状态
  const [plans, setPlans] = useState<WorkspacePlanRow[]>([]);
  const [planPageNum, setPlanPageNum] = useState(1);
  const [planPageSize, setPlanPageSize] = useState(20);
  const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null);
  // UX-4.3：招生计划视图紧凑/舒适切换。紧凑模式隐藏低频列（研究方向、考试科目），
  // 展开行仍可见全部信息。默认舒适视图。
  const [planCompact, setPlanCompact] = useState(false);
  // ISSUE-028：导出格式下拉菜单
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // UX-2.1：后台可取消刷新。isRefreshing 与 isLoading 分离：
  //   isRefreshing = 长耗时 sync 循环（页面保持可交互，旧列表可见，顶部显示进度+取消）
  //   isLoading    = 短耗时 DB 查询（loadWorkspaceData / loadPlans 内部设置）
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number; failed: number } | null>(null);
  const cancelRefreshRef = useRef(false);
  // UX-6.2：同步失败的专业 { code: { name, error } }，用于 Tab 红点 + 单独重试（6.2 接入 UI）
  const [syncFailures, setSyncFailures] = useState<Record<string, { name: string; error: string }>>({});

  // UX-6.1：错误横幅的「重试」按钮。reportError 设置 error + 对应 retry 函数。
  // persistent=true 的错误同时显示横幅（兜底）+ toast；persistent=false 只发 toast（如导出/收藏）。
  const [retryAction, setRetryAction] = useState<{ fn: () => Promise<unknown> | void } | null>(null);
  const reportError = (
    msg: string,
    retry?: () => Promise<unknown> | void,
    persistent = true
  ) => {
    if (persistent) {
      setError(msg);
      setRetryAction(retry ? { fn: retry } : null);
    }
    toast.error(msg, retry ? { label: '重试', onClick: () => { void retry(); } } : undefined);
  };
  const runRetry = async () => {
    const fn = retryAction?.fn;
    setError(null);
    setRetryAction(null);
    if (fn) await fn();
  };

  const visibleMajors = useMemo(
    () => crawledMajors.filter((m) => visibleMajorCodes.includes(m.code)),
    [crawledMajors, visibleMajorCodes]
  );

  // ISSUE-027 多选：activeMajorCodes 是当前实际加载的专业代码列表。
  // selectedMajorCodes 空 [] → "全部"模式，加载所有 visibleMajors；非空 → 选中的那些专业（多选/单选）。
  const activeMajorCodes = useMemo(() => {
    if (selectedMajorCodes.length === 0) {
      return visibleMajors.map((m) => m.code);
    }
    // 过滤掉不在 visibleMajors 的 stale code（兜底，ManageMajorsModal 删专业后残留清理）
    const valid = selectedMajorCodes.filter((code) => visibleMajors.some((m) => m.code === code));
    return valid.length > 0 ? valid : visibleMajors.map((m) => m.code);
  }, [selectedMajorCodes, visibleMajors]);
  const isAllMajors = activeMajorCodes.length > 1;
  // focusedMajorCode：单专业模式下的专业代码（用于 recent_views / 单专业同步等单专业语义场景）
  const focusedMajorCode = isAllMajors ? null : (activeMajorCodes[0] ?? null);
  const focusedMajorName = focusedMajorCode
    ? (crawledMajors.find((m) => m.code === focusedMajorCode)?.name ?? focusedMajorCode)
    : '';
  // activeMajorCodesKey：稳定字符串，用作 useEffect 依赖（避免数组引用变化触发重复加载）
  const activeMajorCodesKey = activeMajorCodes.join(',');

  // ISSUE-027 多选：selectedMajorCodes 里不在 visibleMajors 的 stale code 清理掉。
  // ManageMajorsModal 删除某专业后，selectedMajorCodes 可能残留其 code，此处过滤。
  // 过滤后为空则自然变"全部"模式（派生时空数组=全部），不强制设值。
  useEffect(() => {
    if (selectedMajorCodes.length === 0) return;
    const valid = selectedMajorCodes.filter((code) => visibleMajors.some((m) => m.code === code));
    if (valid.length !== selectedMajorCodes.length) {
      setSelectedMajorCodes(valid);
    }
  }, [visibleMajors, selectedMajorCodes, setSelectedMajorCodes]);

  // ISSUE-027：favorites 改存复合键 `${school_id}|${major_code}`，支持多专业聚合高亮。
  const loadFavorites = async () => {
    if (activeMajorCodes.length === 0) return;
    try {
      // "全部"模式拿所有专业收藏；单专业仍按 focusedMajorCode 过滤
      const data = await fetchFavorites(isAllMajors ? undefined : focusedMajorCode ?? undefined);
      setFavorites(new Set(data.map(f => `${f.school_id}|${f.major_code}`)));
    } catch (err) {
      console.error('加载收藏失败:', err);
    }
  };

  const loadWorkspaceData = async (schoolId: string = ''): Promise<WorkspaceData | null> => {
    if (activeMajorCodes.length === 0) {
      setSchools([]);
      return null;
    }
    setIsLoading(true);
    setError(null);
    setRetryAction(null);
    try {
      const data = await fetchWorkspaceData(schoolId, activeMajorCodes, filters);
      setSchools(data.schools);
      if (schoolId) {
        setDepartments(data.departments);
      }
      return data;
    } catch (err) {
      // UX-6.1：数据加载失败 → 横幅（兜底）+ toast + 局部重试按钮
      reportError(
        err instanceof Error ? err.message : '加载数据失败',
        () => loadWorkspaceData(schoolId)
      );
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // UX-4.1：展开状态持久化。expandedSchoolId 写入 localStorage，切换专业/刷新后恢复。
  // expandedSchoolIdRef 让 effect/handleSync 读取最新值而不进入依赖数组。
  const EXPANDED_KEY = 'yam-expanded-school';
  const expandedSchoolIdRef = useRef<string | null>(null);
  useEffect(() => { expandedSchoolIdRef.current = expandedSchoolId; }, [expandedSchoolId]);
  const persistExpanded = (id: string | null) => {
    if (typeof window === 'undefined') return;
    if (id) window.localStorage.setItem(EXPANDED_KEY, id);
    else window.localStorage.removeItem(EXPANDED_KEY);
  };
  // 从 localStorage 恢复展开：若该 school 仍在结果中则展开并加载院系，否则清空。
  const restoreExpanded = (schoolsList: WorkspaceSchool[]) => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(EXPANDED_KEY) : null;
    if (saved && schoolsList.some((s) => s.school_id === saved)) {
      setExpandedSchoolId(saved);
      void loadWorkspaceData(saved);
    } else {
      setExpandedSchoolId(null);
      if (saved) persistExpanded(null);
    }
  };

  // UX-2.1：后台可取消刷新。sync 循环不再用 isLoading 阻塞整页（旧列表保持可见、可筛选），
  // 改为 isRefreshing + 顶部进度条 + 取消按钮。cancelRefreshRef 在每个 major 之间检查中断。
  // 单专业失败记录到 syncFailures（6.2 接入 Tab 红点 + 单独重试），不阻塞其余专业。
  const handleSync = async () => {
    if (activeMajorCodes.length === 0 || isRefreshing) return;
    setIsRefreshing(true);
    setRefreshProgress({ current: 0, total: activeMajorCodes.length, failed: 0 });
    setSyncFailures({});
    cancelRefreshRef.current = false;
    setError(null);
    const failures: Record<string, { name: string; error: string }> = {};
    for (let i = 0; i < activeMajorCodes.length; i++) {
      if (cancelRefreshRef.current) break;
      const code = activeMajorCodes[i];
      const mName = crawledMajors.find((m) => m.code === code)?.name ?? code;
      try {
        await syncWorkspaceData(code);
        syncedMajorsRef.current.add(code);
      } catch (syncErr) {
        const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
        failures[code] = { name: mName, error: msg };
        console.warn(`同步专业 ${code} 失败:`, syncErr);
      }
      setRefreshProgress({
        current: i + 1,
        total: activeMajorCodes.length,
        failed: Object.keys(failures).length,
      });
    }
    setSyncFailures(failures);
    // 无论完成或取消，都重新加载已同步进 DB 的数据（DB 查询毫秒级，loadWorkspaceData 内部会短暂 isLoading）
    try {
      const data = await loadWorkspaceData('');
      // UX-4.1：刷新后若展开的院校仍在结果中，重新加载其院系（同步可能带来新数据）
      if (data && expandedSchoolIdRef.current && data.schools.some((s) => s.school_id === expandedSchoolIdRef.current)) {
        await loadWorkspaceData(expandedSchoolIdRef.current);
      }
      await loadFilterOptions();
      await loadFavorites();
    } catch (err) {
      reportError(
        err instanceof Error ? err.message : '刷新数据失败',
        () => handleSync()
      );
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(null);
    }
  };

  const handleCancelRefresh = () => {
    cancelRefreshRef.current = true;
  };

  // UX-6.2：单个专业重新同步（从失败列表重试）。只 sync 该专业后刷新数据。
  const handleRetrySyncOne = async (code: string) => {
    if (isRefreshing) return;
    const mName = crawledMajors.find((m) => m.code === code)?.name ?? code;
    setIsRefreshing(true);
    setRefreshProgress({ current: 0, total: 1, failed: 0 });
    setError(null);
    try {
      await syncWorkspaceData(code);
      syncedMajorsRef.current.add(code);
      setSyncFailures((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
      await loadWorkspaceData('');
      await loadFilterOptions();
      await loadFavorites();
    } catch (syncErr) {
      const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
      setSyncFailures((prev) => ({ ...prev, [code]: { name: mName, error: msg } }));
      reportError(
        `重新同步「${mName}」失败：${msg}`,
        () => handleRetrySyncOne(code)
      );
    } finally {
      setRefreshProgress(null);
      setIsRefreshing(false);
    }
  };

  const loadFilterOptions = async () => {
    if (activeMajorCodes.length === 0) return;
    try {
      const options = await fetchWorkspaceFilterOptions(activeMajorCodes);
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

  // ISSUE-027：记录已 sync 过的专业代码，避免每次切换专业 Tab 都重新跑 Python sync。
  // sync_to_tauri.py 每个专业耗时 1-2 秒，重复 sync 会导致 Tab 切换明显卡顿。
  // 首次加载或管理显示专业新增专业时才 sync 新专业；Tab 切换只从 DB 查询（毫秒级）。
  // 用户点"刷新数据"按钮（handleSync）会强制重新 sync，不受此 ref 限制。
  const syncedMajorsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // ISSUE-027：切换专业 Tab 或首次进入工作区时刷新数据。
    // 仅 sync 尚未 sync 过的专业（首次/新增专业），已 sync 的专业直接从 DB 查询。
    if (activeMajorCodes.length === 0) return;
    const autoSync = async () => {
      setIsLoading(true);
      setError(null);
      // UX-6.2：切换专业 Tab 时清空上一组专业的同步失败记录，避免残留红点
      setSyncFailures({});
      setRetryAction(null);
      try {
        // 只 sync syncedMajorsRef 里没有的专业
        const toSync = activeMajorCodes.filter((code) => !syncedMajorsRef.current.has(code));
        for (const code of toSync) {
          try {
            await syncWorkspaceData(code);
            syncedMajorsRef.current.add(code);
          } catch (syncErr) {
            console.warn(`同步专业 ${code} 失败，使用现有数据:`, syncErr);
          }
        }
        const data = await fetchWorkspaceData('', activeMajorCodes, {
          sortBy: 'min_score',
          sortOrder: 'desc',
        });
        setSchools(data.schools);
        await loadFilterOptions();
        await loadFavorites();
        // UX-4.1：切换专业/刷新后恢复上次展开的院校（若仍在新结果中）
        restoreExpanded(data.schools);
        setExpandedDeptIndex(0);
        setActiveYear(2026);
        setShowHistorical(false);
        resetAllFilters();
      } catch (err) {
        // UX-6.1：刷新失败 → 横幅 + toast + 重试（重新拉取 DB 数据）
        reportError(
          err instanceof Error ? err.message : '刷新数据失败',
          () => loadWorkspaceData('')
        );
      } finally {
        setIsLoading(false);
      }
    };
    autoSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMajorCodesKey]);

  useEffect(() => {
    if (!refreshNonce || refreshNonce === 0) return;
    const reload = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchWorkspaceData('', activeMajorCodes, {
          sortBy: 'min_score',
          sortOrder: 'desc',
        });
        setSchools(data.schools);
        await loadFilterOptions();
        await loadFavorites();
        // UX-4.1：切换专业/刷新后恢复上次展开的院校（若仍在新结果中）
        restoreExpanded(data.schools);
        setExpandedDeptIndex(0);
        setActiveYear(2026);
        setShowHistorical(false);
        resetAllFilters();
      } catch (err) {
        // UX-6.1：刷新失败 → 横幅 + toast + 重试（重新拉取 DB 数据）
        reportError(
          err instanceof Error ? err.message : '刷新数据失败',
          () => loadWorkspaceData('')
        );
      } finally {
        setIsLoading(false);
      }
    };
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  useEffect(() => {
    loadWorkspaceData('');
    // UX-4.1：筛选变化不强制收起展开的院校。若该院校被筛掉，渲染时自然不显示（无害）；
    // 重新出现时仍保持展开（其院系数据对院校筛选不敏感，无需重载）。
    setCurrentPageNum(1);
  }, [filters]);

  // ISSUE-027 阶段 2：招生计划视图加载。切到 plan 视图或切换专业/筛选时查询扁平行。
  // 不触发 sync（sync 由院校视图的 autoSync effect 负责，已 sync 的专业直接查 DB）。
  useEffect(() => {
    if (viewMode !== 'plan' || activeMajorCodes.length === 0) return;
    const loadPlans = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchWorkspacePlans(activeMajorCodes, filters);
        setPlans(data);
        setPlanPageNum(1);
        setExpandedPlanId(null);
      } catch (err) {
        // UX-6.1：招生计划加载失败 → 横幅 + toast + 重试
        reportError(
          err instanceof Error ? err.message : '加载招生计划失败',
          () => { void fetchWorkspacePlans(activeMajorCodes, filters).then(setPlans); }
        );
      } finally {
        setIsLoading(false);
      }
    };
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, activeMajorCodesKey, filters]);

  useEffect(() => {
    setCurrentPageNum(1);
  }, [searchQuery, pageSize]);

  // ISSUE-027 多选：Tab 点击专业 toggle 选中。
  // 在 selectedMajorCodes 里 → 移除；不在 → 加入。全选自动清空（= 全部模式）避免歧义。
  const handleToggleMajor = (code: string) => {
    const next = selectedMajorCodes.includes(code)
      ? selectedMajorCodes.filter((c) => c !== code)
      : [...selectedMajorCodes, code];
    if (next.length === visibleMajors.length) {
      setSelectedMajorCodes([]);
    } else {
      setSelectedMajorCodes(next);
    }
  };

  // ISSUE-027：收藏批量处理。favorites 存复合键 `${school_id}|${major_code}`。
  // 聚合行点击 → 对该 school 的所有 activeMajorCodes 批量 toggle：
  //   全部已收藏 → 全部取消；否则 → 把未收藏的都加上。
  const toggleFavorite = async (schoolId: string) => {
    try {
      const codes = activeMajorCodes;
      const allFavorited = codes.every((code) => favorites.has(`${schoolId}|${code}`));
      for (const code of codes) {
        const isFav = favorites.has(`${schoolId}|${code}`);
        const mName = crawledMajors.find((m) => m.code === code)?.name ?? code;
        if (allFavorited) {
          if (isFav) await toggleFavoriteApi(schoolId, code, mName);
        } else {
          if (!isFav) await toggleFavoriteApi(schoolId, code, mName);
        }
      }
      await loadFavorites();
    } catch (err) {
      // UX-6.1：收藏操作失败 → 仅 toast（瞬时反馈，不留横幅），带重试
      reportError(
        err instanceof Error ? err.message : '收藏操作失败',
        () => toggleFavorite(schoolId),
        false
      );
    }
  };

  // 判断聚合行是否高亮（任一 activeMajorCode 已收藏即高亮）
  const isSchoolFavorited = (schoolId: string) =>
    activeMajorCodes.some((code) => favorites.has(`${schoolId}|${code}`));

  // UX-5.1：单个 (school, major) 收藏切换，简化取消收藏路径。
  // 展开区每个专业分组单独显示收藏星，点击即可直接切换；取消后 toast 提示并提供「撤销」。
  const toggleFavoriteMajor = async (schoolId: string, majorCode: string) => {
    const key = `${schoolId}|${majorCode}`;
    const wasFav = favorites.has(key);
    const mName = crawledMajors.find((m) => m.code === majorCode)?.name ?? majorCode;
    const schoolName = schools.find((s) => s.school_id === schoolId)?.name ?? schoolId;
    try {
      await toggleFavoriteApi(schoolId, majorCode, mName);
      await loadFavorites();
      if (wasFav) {
        // 取消收藏 → 提供「撤销」（8s 内可恢复，比默认 4s 更宽松）
        toast.show({
          message: `已取消收藏「${schoolName} · ${mName}」`,
          type: 'info',
          duration: 8000,
          action: {
            label: '撤销',
            onClick: () => {
              void toggleFavoriteApi(schoolId, majorCode, mName).then(() => loadFavorites());
            },
          },
        });
      } else {
        toast.success(`已收藏「${schoolName} · ${mName}」`);
      }
    } catch (err) {
      // UX-6.1：收藏操作失败 → 仅 toast（瞬时反馈，不留横幅），带重试
      reportError(
        err instanceof Error ? err.message : '收藏操作失败',
        () => toggleFavoriteMajor(schoolId, majorCode),
        false
      );
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
      // UX-4.1：收起时清除持久化
      persistExpanded(null);
    } else {
      setExpandedSchoolId(id);
      // UX-4.1：展开时持久化到 localStorage，切换专业/刷新后可恢复
      persistExpanded(id);
      setExpandedDeptIndex(0);
      setActiveYear(2026);
      setShowHistorical(false);
      loadWorkspaceData(id);
      // ISSUE-027：recent_views 是单专业语义，"全部"模式跳过；单专业模式照常记录
      if (focusedMajorCode) {
        addRecentView(id, focusedMajorCode, focusedMajorName).catch(err => {
          console.error('记录最近查看失败:', err);
        });
      }
    }
  };

  // ISSUE-027：多专业院校聚合。按 school_id 聚合扁平 schools：
  //   min_score=MIN, enroll_count=SUM, display_order=MIN, 布尔标签=OR
  //   保留 major_codes[] 和 _raw[]（原始行，供展开与导出用）
  // 单专业模式每条 major_count===1，行为与原版完全一致（向后兼容）
  const aggregatedSchools = useMemo<AggregatedSchool[]>(() => {
    const map = new Map<string, AggregatedSchool>();
    for (const s of schools) {
      const existing = map.get(s.school_id);
      if (!existing) {
        map.set(s.school_id, {
          ...s,
          major_codes: [s.major_code],
          _raw: [s],
          major_count: 1,
        });
      } else {
        existing.major_codes.push(s.major_code);
        existing._raw.push(s);
        existing.major_count += 1;
        existing.min_score = Math.min(existing.min_score, s.min_score);
        existing.enroll_count += s.enroll_count;
        existing.display_order = Math.min(existing.display_order, s.display_order);
        existing.self_scoring = existing.self_scoring || s.self_scoring;
        existing.doctoral_program = existing.doctoral_program || s.doctoral_program;
        existing.double_first_class = existing.double_first_class || s.double_first_class;
        existing.is_985 = existing.is_985 || s.is_985;
        existing.is_211 = existing.is_211 || s.is_211;
      }
    }
    return Array.from(map.values());
  }, [schools]);

  const filteredData = aggregatedSchools.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paginatedData = filteredData.slice((currentPageNum - 1) * pageSize, currentPageNum * pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));

  // ISSUE-027 阶段 2：招生计划视图分页。searchQuery 同样按院校名过滤。
  const filteredPlans = plans.filter(p =>
    p.school_name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const paginatedPlans = filteredPlans.slice((planPageNum - 1) * planPageSize, planPageNum * planPageSize);
  const planTotalPages = Math.max(1, Math.ceil(filteredPlans.length / planPageSize));
  // UX-4.3：紧凑模式去掉「研究方向」「考试科目」两列（1.6fr × 2），减少小屏换行。
  const planGridCols = planCompact
    ? 'grid-cols-[1.4fr_0.9fr_1.2fr_0.6fr_0.6fr_0.6fr_40px]'
    : 'grid-cols-[1.4fr_0.9fr_1.2fr_1.6fr_1.6fr_0.6fr_0.6fr_0.6fr_40px]';

  // ISSUE-028：导出格式下拉菜单 click-away 关闭
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportMenuOpen]);

  // ISSUE-026/027/028：构建当前筛选结果的导出数据。CSV/Excel 共用 cellRows（已字符串化扁平行），
  // JSON 用 jsonRows（含完整原始字段 + major_name）。空数据返回 null。
  const buildExportData = (vm: 'school' | 'plan'): ExportData | null => {
    const majorNameOf = (code: string) =>
      crawledMajors.find((m) => m.code === code)?.name ?? code;
    const today = new Date();
    const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    // ISSUE-027 多选：文件名区分 全部/单选/多选子集 三种情况
    const defaultFilenamePrefix =
      selectedMajorCodes.length === 0
        ? `all_全部专业`
        : selectedMajorCodes.length === 1
          ? `${focusedMajorCode}_${focusedMajorName}`
          : `${selectedMajorCodes.join('+')}_多专业`;
    const majorCodes = activeMajorCodes;

    if (vm === 'plan') {
      if (filteredPlans.length === 0) return null;
      const headers = [
        '院校代码', '院校名称', '专业代码', '专业名称', '省份', '层次',
        '院系', '研究方向', '考试科目', '学习方式', '考试方式', '特殊计划',
        '最新年份', '最低分', '招生人数',
      ];
      const cellRows: ExportCell[][] = filteredPlans.map(p => [
        p.school_code, p.school_name, p.major_code, majorNameOf(p.major_code),
        p.province, p.level, p.department_name, p.research_direction,
        p.exam_subjects.join('; '), p.study_mode, p.exam_type,
        p.special_plans.join('; '), p.latest_year, p.latest_min_score, p.latest_enroll_count,
      ]);
      const jsonRows = filteredPlans.map(p => ({ ...p, major_name: majorNameOf(p.major_code) }));
      return {
        headers, cellRows, jsonRows,
        filenameBase: `${defaultFilenamePrefix}_招生计划_${ymd}`,
        viewMode: 'plan', majorCodes,
      };
    }

    // 院校视图
    if (filteredData.length === 0) return null;
    const headers = [
      '院校代码', '院校名称', '专业代码', '专业名称', '省份', '层次',
      '最低分', '招生人数', '自划线', '博士点',
      '双一流', '985', '211',
    ];
    // ISSUE-027：每个 (school, major) 一行，用 _raw.flatMap 展开
    const cellRows: ExportCell[][] = filteredData.flatMap((s) =>
      s._raw.map((raw) => [
        raw.school_code ?? '',
        raw.name ?? '',
        raw.major_code ?? '',
        majorNameOf(raw.major_code),
        raw.province ?? '',
        raw.level ?? '',
        raw.min_score ?? 0,
        raw.enroll_count ?? 0,
        raw.self_scoring ? '是' : '否',
        raw.doctoral_program ? '是' : '否',
        raw.double_first_class ? '是' : '否',
        raw.is_985 ? '是' : '否',
        raw.is_211 ? '是' : '否',
      ])
    );
    const jsonRows = filteredData.flatMap((s) =>
      s._raw.map((raw) => ({ ...raw, major_name: majorNameOf(raw.major_code) }))
    );
    return {
      headers, cellRows, jsonRows,
      filenameBase: `${defaultFilenamePrefix}_${ymd}`,
      viewMode: 'school', majorCodes,
    };
  };

  // ISSUE-026/028：导出为 CSV（UTF-8 BOM + 字段转义）。Tauri 调 export_file；浏览器走 Blob。
  const exportAsCsv = async (d: ExportData) => {
    const csvBody = [d.headers, ...d.cellRows]
      .map((row) => row.map(escapeField).join(','))
      .join('\r\n');
    const csvContent = '\uFEFF' + csvBody; // UTF-8 BOM 让 Excel 正确识别中文
    const filename = `${d.filenameBase}.csv`;
    if (!isTauri) {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return null;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string | null>('export_file', { defaultFilename: filename, content: csvContent, ext: 'csv' });
  };

  // ISSUE-028：导出为 Excel（.xlsx）。Tauri 调 export_excel（Rust 用 rust_xlsxwriter 生成）；
  // 浏览器（仅 debug）不支持 xlsx，降级为 CSV。
  const exportAsExcel = async (d: ExportData) => {
    const filename = `${d.filenameBase}.xlsx`;
    const sheetName = d.viewMode === 'plan' ? '招生计划' : '院校列表';
    if (!isTauri) {
      console.warn('浏览器环境不支持 xlsx 导出，降级为 CSV');
      return exportAsCsv(d);
    }
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string | null>('export_excel', {
      defaultFilename: filename,
      sheetName,
      headers: d.headers,
      rows: d.cellRows,
    });
  };

  // ISSUE-028：导出为 JSON（结构化对象，含元数据 + 完整行字段）。
  const exportAsJson = async (d: ExportData) => {
    const payload = {
      export_date: new Date().toISOString(),
      view_mode: d.viewMode,
      major_codes: d.majorCodes,
      row_count: d.jsonRows.length,
      columns: d.headers,
      rows: d.jsonRows,
    };
    const jsonContent = JSON.stringify(payload, null, 2);
    const filename = `${d.filenameBase}.json`;
    if (!isTauri) {
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return null;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string | null>('export_file', { defaultFilename: filename, content: jsonContent, ext: 'json' });
  };

  // ISSUE-028：导出入口，按格式分发。UX-6.1：成功/失败改用 toast（瞬时通知，不留横幅）。
  const doExport = async (format: ExportFormat) => {
    setExportMenuOpen(false);
    const d = buildExportData(viewMode);
    if (!d) {
      toast.warning('当前没有可导出的数据');
      return;
    }
    try {
      const result =
        format === 'csv' ? await exportAsCsv(d)
          : format === 'excel' ? await exportAsExcel(d)
            : await exportAsJson(d);
      if (result === null) {
        // 浏览器下载完成 / 用户取消保存（Tauri），无需额外提示
        if (isTauri) return;
        return;
      }
      const fmtLabel = format === 'csv' ? 'CSV' : format === 'excel' ? 'Excel' : 'JSON';
      toast.success(`已导出 ${d.cellRows.length} 条${format === 'excel' ? '(xlsx)' : `(${fmtLabel})`} 到：${result}`);
    } catch (e) {
      toast.error(`导出失败: ${e}`, { label: '重试', onClick: () => { void doExport(format); } });
    }
  };

  // ISSUE-027：展开区按专业分组。departmentsByMajor 按 major_code 分组并按 visibleMajors 顺序排序；
  // flatDepts 是跨专业扁平化后的列表，expandedDeptIndex 指向 flatDepts（跨专业连续编号）。
  const departmentsByMajor = useMemo(() => {
    const map = new Map<string, WorkspaceDepartment[]>();
    for (const d of departments) {
      if (!map.has(d.major_code)) map.set(d.major_code, []);
      map.get(d.major_code)!.push(d);
    }
    return visibleMajors
      .filter((m) => map.has(m.code))
      .map((m) => ({ major: m, depts: map.get(m.code)! }));
  }, [departments, visibleMajors]);
  const flatDepts = useMemo(
    () => departmentsByMajor.flatMap((g) => g.depts),
    [departmentsByMajor]
  );

  const expandedDept = flatDepts[expandedDeptIndex];
  const yearData = expandedDept?.years.find(y => y.year === activeYear) || expandedDept?.years[0];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <TopNav activeTab="workspace" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6">
        {/* Current Majors Display */}
        {/* ISSUE-027：顶部专业 Tab + 视图切换 + 操作按钮 */}
        <div className="flex items-center justify-between mb-4 gap-4">
          {/* 左侧：专业 Tab（"全部" + 各专业多选 toggle） */}
          <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0">
            {visibleMajors.length > 0 ? (
              <>
                <button
                  onClick={() => setSelectedMajorCodes([])}
                  className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
                    selectedMajorCodes.length === 0
                      ? 'bg-[#1e3a5f] text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  全部
                </button>
                {visibleMajors.map((m) => {
                  // UX-6.2：同步失败的专业 Tab 显示红点，hover 提示失败原因
                  const failed = syncFailures[m.code];
                  return (
                  <button
                    key={m.code}
                    onClick={() => handleToggleMajor(m.code)}
                    title={failed ? `同步失败：${failed.error}` : undefined}
                    className={`relative px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
                      selectedMajorCodes.includes(m.code)
                        ? 'bg-[#1e3a5f] text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {m.name}
                    {failed && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white"
                        title={`同步失败：${failed.error}`}
                      />
                    )}
                  </button>
                  );
                })}
                {selectedMajorCodes.length >= 2 && selectedMajorCodes.length < visibleMajors.length && (
                  <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                    已选 {selectedMajorCodes.length} 个
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-400">
                {crawledMajors.length > 0 ? '未选择显示专业' : '暂无专业数据'}
              </span>
            )}
          </div>

          {/* 右侧：视图切换 + 搜索 + 刷新 + 导出 + 管理 */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* ISSUE-027 阶段 2：视图切换按钮组，院校视图 + 招生计划视图 */}
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('school')}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'school'
                    ? 'bg-[#1e3a5f] text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                院校视图
              </button>
              <button
                onClick={() => setViewMode('plan')}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'plan'
                    ? 'bg-[#1e3a5f] text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                招生计划视图
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索学校名称"
                disabled={activeMajorCodes.length === 0}
                className="pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:border-[#1e3a5f] disabled:bg-gray-50"
              />
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            {/* UX-2.1：刷新数据按钮。刷新中改为「进度 + 取消」内联显示，页面保持可交互。 */}
            {isRefreshing ? (
              <div className="flex items-center gap-2 text-sm">
                <RefreshCw size={14} className="animate-spin text-[#1e3a5f]" />
                <span className="text-gray-600 whitespace-nowrap">
                  刷新中
                  {refreshProgress && ` ${refreshProgress.current}/${refreshProgress.total}`}
                  {refreshProgress && refreshProgress.failed > 0 && (
                    <span className="text-red-500 ml-1">· 失败 {refreshProgress.failed}</span>
                  )}
                </span>
                <button
                  onClick={handleCancelRefresh}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50 transition-colors whitespace-nowrap"
                >
                  <X size={12} />
                  取消
                </button>
              </div>
            ) : (
              <motion.button
                onClick={handleSync}
                disabled={activeMajorCodes.length === 0}
                className="flex items-center gap-1 text-[#1e3a5f] hover:text-[#162d4a] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                whileHover={activeMajorCodes.length > 0 ? { scale: 1.02 } : undefined}
                whileTap={activeMajorCodes.length > 0 ? { scale: 0.97 } : undefined}
              >
                <RefreshCw size={14} />
                刷新数据
              </motion.button>
            )}
            {/* ISSUE-028：导出格式下拉菜单（CSV / Excel / JSON） */}
            <div className="relative" ref={exportMenuRef}>
              <motion.button
                onClick={() => setExportMenuOpen((o) => !o)}
                disabled={activeMajorCodes.length === 0 || (viewMode === 'plan' ? filteredPlans.length === 0 : filteredData.length === 0)}
                className="flex items-center gap-1 text-gray-600 hover:text-gray-800 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                whileHover={activeMajorCodes.length > 0 ? { scale: 1.02 } : undefined}
                whileTap={activeMajorCodes.length > 0 ? { scale: 0.97 } : undefined}
                title="导出当前筛选结果"
              >
                <Download size={14} />
                导出
                <ChevronDown size={14} />
              </motion.button>
              <AnimatePresence>
                {exportMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-full right-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
                  >
                    <button
                      onClick={() => doExport('csv')}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#1e3a5f]"
                    >
                      导出为 CSV
                    </button>
                    <button
                      onClick={() => doExport('excel')}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#1e3a5f]"
                    >
                      导出为 Excel
                    </button>
                    <button
                      onClick={() => doExport('json')}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#1e3a5f]"
                    >
                      导出为 JSON
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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

        {activeMajorCodes.length > 0 && (
          <>
            {/* UX-6.2：批量刷新结束后的同步失败汇总。每个失败专业可单独「重新同步」。 */}
            {!isRefreshing && Object.keys(syncFailures).length > 0 && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg mb-4">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium mb-2">
                    {Object.keys(syncFailures).length} 个专业同步失败，可单独重试：
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {Object.entries(syncFailures).map(([code, info]) => (
                      <div key={code} className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-amber-900 flex-shrink-0">{info.name}</span>
                        <span className="text-amber-600 truncate flex-1 min-w-0" title={info.error}>
                          {info.error}
                        </span>
                        <button
                          onClick={() => handleRetrySyncOne(code)}
                          className="flex items-center gap-1 text-[#1e3a5f] hover:text-[#162d4a] font-medium flex-shrink-0"
                        >
                          <RotateCw size={12} />
                          重新同步
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setSyncFailures({})}
                  className="text-amber-400 hover:text-amber-600 flex-shrink-0"
                  aria-label="关闭"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Filters */}
            <WorkspaceFilterPanel
              options={filterOptions}
              filters={filters}
              onChange={setFilters}
              resultCount={viewMode === 'plan' ? filteredPlans.length : filteredData.length}
            />

            {/* Loading / Error */}
            {isLoading && (
              <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
                <RefreshCw size={16} className="animate-spin mr-2" />
                加载中…
              </div>
            )}
            {/* UX-6.1：错误横幅（兜底）+ 局部「重试」按钮。toast 在右上角同步提示。 */}
            {error && (
              <div className="flex items-start gap-3 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span className="flex-1 break-words">{error}</span>
                {retryAction && (
                  <button
                    onClick={() => { void runRetry(); }}
                    className="flex items-center gap-1 flex-shrink-0 text-xs font-medium text-red-600 hover:text-red-700 border border-red-300 rounded px-2 py-1 hover:bg-red-100 transition-colors"
                  >
                    <RotateCw size={12} />
                    重试
                  </button>
                )}
                <button
                  onClick={() => { setError(null); setRetryAction(null); }}
                  className="text-red-400 hover:text-red-600 flex-shrink-0"
                  aria-label="关闭"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* ISSUE-027 阶段 2：院校视图表格（viewMode === 'school'） */}
            {viewMode === 'school' && (
            <>
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
                      isSchoolFavorited(item.school_id) ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'
                    }`}
                    whileTap={{ scale: 0.8 }}
                    animate={isSchoolFavorited(item.school_id) ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                    transition={{ duration: 0.35 }}
                  >
                    <Star size={18} fill={isSchoolFavorited(item.school_id) ? 'currentColor' : 'none'} />
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

                {/* School Name + 多专业徽标 */}
                <div className="font-medium text-gray-900 flex items-center">
                  {item.name}
                  {isAllMajors && item.major_count > 1 && (
                    <span className="ml-2 text-xs text-gray-500">({item.major_count} 个专业)</span>
                  )}
                </div>

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
                              isSchoolFavorited(item.school_id) ? 'text-red-500 border-red-200 bg-red-50' : 'text-gray-600'
                            }`}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <Star size={14} fill={isSchoolFavorited(item.school_id) ? 'currentColor' : 'none'} />
                            {isSchoolFavorited(item.school_id) ? '已收藏' : '收藏'}
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
                        {/* ISSUE-027：按专业分组渲染院系，多专业模式每组带专业标题 */}
                        {departmentsByMajor.map((group, groupIdx) => {
                          const offset = departmentsByMajor
                            .slice(0, groupIdx)
                            .reduce((sum, g) => sum + g.depts.length, 0);
                          return (
                          <div key={group.major.code}>
                            {/* UX-5.1：专业分组标题 + 单专业收藏星。单专业模式也显示，
                                提供清晰的「收藏/取消收藏此专业」入口，取消后 toast 可撤销。 */}
                            <div className="flex items-center gap-2 mb-2 mt-3 first:mt-0">
                              <h4 className="text-sm font-semibold text-[#1e3a5f]">
                                {group.major.name}
                                {isAllMajors && (
                                  <span className="text-gray-400 font-normal">（{group.depts.length} 个院系）</span>
                                )}
                              </h4>
                              {(() => {
                                const favKey = `${item.school_id}|${group.major.code}`;
                                const isFav = favorites.has(favKey);
                                return (
                                  <motion.button
                                    onClick={() => toggleFavoriteMajor(item.school_id, group.major.code)}
                                    className={`transition-colors ${isFav ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'}`}
                                    whileTap={{ scale: 0.8 }}
                                    animate={isFav ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                                    transition={{ duration: 0.3 }}
                                    title={isFav ? '取消收藏此专业' : '收藏此专业'}
                                  >
                                    <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
                                  </motion.button>
                                );
                              })()}
                            </div>
                            {group.depts.map((dept, deptIdx) => {
                              const flatIdx = offset + deptIdx;
                              return (
                          <div className="mb-3">
                            {/* Department Header */}
                            <motion.button
                              onClick={() => setExpandedDeptIndex(flatIdx)}
                              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                              whileTap={{ scale: 0.995 }}
                            >
                              <span className="font-medium text-gray-900 text-sm flex items-center">
                                <motion.span
                                  animate={{ rotate: expandedDeptIndex === flatIdx ? 90 : 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="inline-block mr-2"
                                >
                                  <ChevronRight size={14} className="text-gray-500" />
                                </motion.span>
                                {dept.name}
                              </span>
                              <motion.span
                                animate={{ rotate: expandedDeptIndex === flatIdx ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="inline-block"
                              >
                                <ChevronUp size={14} className="text-gray-400" />
                              </motion.span>
                            </motion.button>

                            {/* Department Content */}
                            <AnimatePresence>
                              {expandedDeptIndex === flatIdx && (
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
                              );
                            })}
                          </div>
                          );
                        })}
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

            {/* ISSUE-027 阶段 2：招生计划视图表格（viewMode === 'plan'） */}
            {viewMode === 'plan' && (
              <>
              {/* UX-4.3：紧凑/舒适视图切换。紧凑模式隐藏研究方向、考试科目列，展开行仍可见。 */}
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setPlanCompact((c) => !c)}
                  className="text-xs text-gray-600 hover:text-[#1e3a5f] border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 transition-colors"
                  title={planCompact ? '切换到舒适视图（显示研究方向、考试科目列）' : '切换到紧凑视图（隐藏低频列）'}
                >
                  {planCompact ? '舒适视图' : '紧凑视图'}
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Plan Table Header */}
                <div className={`grid ${planGridCols} gap-3 px-4 py-3 bg-gray-50 text-xs text-gray-500 font-medium border-b border-gray-200`}>
                  <div>院校</div>
                  <div>专业</div>
                  <div>院系</div>
                  {!planCompact && <div>研究方向</div>}
                  {!planCompact && <div>考试科目</div>}
                  <div className="text-center">年份</div>
                  <div className="text-center">最低分</div>
                  <div className="text-center">招生</div>
                  <div className="text-center">操作</div>
                </div>

                {/* Plan Table Body */}
                {paginatedPlans.map((p, idx) => (
                  <div key={`${p.school_id}-${p.department_id}`}>
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                      className={`grid ${planGridCols} gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors items-center text-sm ${
                        expandedPlanId === p.department_id ? 'bg-blue-50' : ''
                      }`}
                    >
                      {/* 院校 */}
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{p.school_name}</div>
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {p.is_985 && <span className="px-1 text-[9px] rounded bg-red-50 text-red-700 border border-red-200">985</span>}
                          {p.is_211 && <span className="px-1 text-[9px] rounded bg-blue-50 text-blue-700 border border-blue-200">211</span>}
                          {p.double_first_class && <span className="px-1 text-[9px] rounded bg-green-50 text-green-700 border border-green-200">双一流</span>}
                          <span className="text-[10px] text-gray-400">{p.province}</span>
                        </div>
                      </div>
                      {/* 专业 */}
                      <div className="text-gray-600 text-xs min-w-0 truncate">
                        {crawledMajors.find(m => m.code === p.major_code)?.name ?? p.major_code}
                      </div>
                      {/* 院系 */}
                      <div className="text-gray-700 text-xs min-w-0 truncate" title={p.department_name}>
                        {p.department_name}
                      </div>
                      {/* 研究方向（紧凑模式隐藏，展开行仍可见） */}
                      {!planCompact && (
                        <div className="text-gray-500 text-xs min-w-0 line-clamp-2" title={p.research_direction}>
                          {p.research_direction || '—'}
                        </div>
                      )}
                      {/* 考试科目（紧凑模式隐藏，展开行仍可见） */}
                      {!planCompact && (
                        <div className="text-gray-500 text-xs min-w-0 line-clamp-2" title={p.exam_subjects.join('；')}>
                          {p.exam_subjects.join('；') || '—'}
                        </div>
                      )}
                      {/* 年份 */}
                      <div className="text-center text-gray-500 text-xs">{p.latest_year || '—'}</div>
                      {/* 最低分 */}
                      <div className="text-center text-gray-900 font-medium">{p.latest_min_score || '—'}</div>
                      {/* 招生 */}
                      <div className="text-center text-gray-600 text-xs">{p.latest_enroll_count || '—'}</div>
                      {/* 操作 */}
                      <div className="flex items-center justify-center">
                        <motion.button
                          onClick={() => setExpandedPlanId(expandedPlanId === p.department_id ? null : p.department_id)}
                          className="p-1 text-gray-400 hover:text-[#1e3a5f] transition-colors"
                          whileTap={{ scale: 0.9 }}
                        >
                          <motion.span
                            animate={{ rotate: expandedPlanId === p.department_id ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="inline-block"
                          >
                            <ChevronRight size={16} />
                          </motion.span>
                        </motion.button>
                      </div>
                    </motion.div>

                    {/* 展开行：多年分数表 */}
                    <AnimatePresence>
                      {expandedPlanId === p.department_id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-b border-gray-200"
                        >
                          <div className="p-4 bg-gray-50/50">
                            <h4 className="text-xs font-medium text-gray-500 mb-2">
                              {p.school_name} · {p.department_name} · 历年分数
                            </h4>
                            {p.years.length > 0 ? (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500 border-b border-gray-200">
                                      <th className="py-1.5 px-2 text-left">年份</th>
                                      <th className="py-1.5 px-2 text-center">招生人数</th>
                                      <th className="py-1.5 px-2 text-center">最低分</th>
                                      <th className="py-1.5 px-2 text-center">政治</th>
                                      <th className="py-1.5 px-2 text-center">英语</th>
                                      <th className="py-1.5 px-2 text-center">数学</th>
                                      <th className="py-1.5 px-2 text-center">专业课</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {p.years.map(y => (
                                      <tr key={y.year} className="border-b border-gray-100">
                                        <td className="py-1.5 px-2 text-gray-700 font-medium">{y.year}</td>
                                        <td className="py-1.5 px-2 text-center text-gray-600">{y.enroll_count}</td>
                                        <td className="py-1.5 px-2 text-center text-gray-900 font-medium">{y.min_score}</td>
                                        <td className="py-1.5 px-2 text-center text-gray-600">{y.politics}</td>
                                        <td className="py-1.5 px-2 text-center text-gray-600">{y.english}</td>
                                        <td className="py-1.5 px-2 text-center text-gray-600">{y.math}</td>
                                        <td className="py-1.5 px-2 text-center text-gray-600">{y.specialized}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400">暂无历年分数数据</p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-gray-500">
                              <span>学习方式：{p.study_mode || '—'}</span>
                              <span>考试方式：{p.exam_type || '—'}</span>
                              {p.special_plans.length > 0 && <span>专项：{p.special_plans.join('、')}</span>}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}

                {/* 空状态 */}
                {paginatedPlans.length === 0 && !isLoading && (
                  <div className="py-12 text-center text-gray-400 text-sm">暂无招生计划数据</div>
                )}
              </div>
              </>
            )}

            {/* ISSUE-027 阶段 2：招生计划视图分页 */}
            {viewMode === 'plan' && filteredPlans.length > 0 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-gray-500">共 {filteredPlans.length} 条</span>
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={() => setPlanPageNum(Math.max(1, planPageNum - 1))}
                    disabled={planPageNum === 1}
                    className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: planPageNum === 1 ? 1 : 1.1 }}
                    whileTap={{ scale: planPageNum === 1 ? 1 : 0.9 }}
                  >
                    <ChevronLeft size={16} />
                  </motion.button>
                  {(() => {
                    const windowSize = 5;
                    let start = Math.max(1, planPageNum - Math.floor(windowSize / 2));
                    let end = Math.min(planTotalPages, start + windowSize - 1);
                    if (end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);
                    const pages: (number | string)[] = [];
                    if (start > 1) pages.push(1, '...');
                    for (let i = start; i <= end; i++) pages.push(i);
                    if (end < planTotalPages) pages.push('...', planTotalPages);
                    return pages.map((page, idx) =>
                      typeof page === 'string' ? (
                        <span key={`p-ellipsis-${idx}`} className="text-gray-400 px-1">{page}</span>
                      ) : (
                        <motion.button
                          key={page}
                          onClick={() => setPlanPageNum(page)}
                          className={`w-8 h-8 rounded text-sm ${
                            planPageNum === page ? 'bg-[#1e3a5f] text-white' : 'text-gray-600 hover:bg-gray-100'
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
                    onClick={() => setPlanPageNum(Math.min(planTotalPages, planPageNum + 1))}
                    disabled={planPageNum === planTotalPages}
                    className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: planPageNum === planTotalPages ? 1 : 1.1 }}
                    whileTap={{ scale: planPageNum === planTotalPages ? 1 : 0.9 }}
                  >
                    <ChevronRight size={16} />
                  </motion.button>
                  <select
                    value={planPageSize}
                    onChange={(e) => { setPlanPageSize(Number(e.target.value)); setPlanPageNum(1); }}
                    className="ml-2 px-2 py-1.5 text-sm text-gray-700 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f] bg-white"
                  >
                    <option value={20}>20 条/页</option>
                    <option value={50}>50 条/页</option>
                    <option value={100}>100 条/页</option>
                  </select>
                </div>
              </div>
            )}
          </>
        )}

        {activeMajorCodes.length === 0 && !isLoading && (
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
