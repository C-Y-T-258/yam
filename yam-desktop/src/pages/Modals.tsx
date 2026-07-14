import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, ChevronRight, Star, RefreshCw, Check } from 'lucide-react';
import { TopNav } from '../components/TopNav';
import { WorkspaceFilterPanel } from '../components/WorkspaceFilterPanel';
import { useAppStore } from '../stores/appStore';
import {
  fetchFavorites,
  toggleFavorite,
  fetchRecentViews,
  clearRecentViews,
  formatRelativeTime,
  applyWorkspaceFilters,
  classifyExamSubjects,
  extractLevelTags,
  isResearchInstitute,
  syncWorkspaceData,
  type Favorite,
  type RecentView,
  type FilterOptions,
  type WorkspaceFilters,
} from '../lib/db';

// S009 - Manage Display Majors Modal
interface ManageMajorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (selected: string[]) => void;
}

export function ManageMajorsModal({ isOpen, onClose, onConfirm }: ManageMajorsModalProps) {
  const { crawledMajors, visibleMajorCodes, setVisibleMajorCodes } = useAppStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number; majorName: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelected(new Set(visibleMajorCodes.length > 0 ? visibleMajorCodes : crawledMajors.map((m) => m.code)));
    }
  }, [isOpen, visibleMajorCodes, crawledMajors]);

  const toggleMajor = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const filteredMajors = useMemo(() =>
    crawledMajors.filter((m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.code.includes(searchQuery)
    ), [crawledMajors, searchQuery]);

  const handleConfirm = async () => {
    const selectedArray = Array.from(new Set(selected));
    if (selectedArray.length === 0) return;

    setVisibleMajorCodes(selectedArray);

    setIsRefreshing(true);
    setRefreshProgress({ current: 0, total: selectedArray.length, majorName: '' });
    for (let i = 0; i < selectedArray.length; i++) {
      const code = selectedArray[i];
      const major = crawledMajors.find((m) => m.code === code);
      setRefreshProgress({ current: i + 1, total: selectedArray.length, majorName: major?.name ?? code });
      try {
        await syncWorkspaceData(code);
      } catch (err) {
        console.warn(`同步专业 ${code} 失败:`, err);
      }
    }
    setRefreshProgress(null);
    setIsRefreshing(false);
    onConfirm?.(selectedArray);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={isRefreshing ? undefined : onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-medium text-gray-900">管理显示专业</h2>
                <p className="text-xs text-gray-500 mt-0.5">勾选需要在工作区显示的专业，确认后将自动刷新数据</p>
              </div>
              <button
                onClick={onClose}
                disabled={isRefreshing}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {crawledMajors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <p className="text-sm">暂无已爬取的专业</p>
                  <p className="text-xs mt-1">请先在专业管理页面爬取数据</p>
                </div>
              ) : (
                <>
                  {/* Search */}
                  <div className="relative mb-4">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索专业名称或专业代码......"
                      disabled={isRefreshing}
                      className="w-full pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1e3a5f] disabled:bg-gray-50"
                    />
                    <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>

                  {/* Table */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[40px_1fr_1fr_auto] gap-4 px-4 py-3 bg-gray-50 text-sm text-gray-500 font-medium border-b border-gray-200">
                      <div></div>
                      <div>专业代码</div>
                      <div>专业名称</div>
                      <div className="text-right">学校数量</div>
                    </div>
                    {filteredMajors.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-gray-500">
                        未找到匹配的专业
                      </div>
                    ) : (
                      filteredMajors.map((major) => (
                        <label
                          key={major.code}
                          className={`grid grid-cols-[40px_1fr_1fr_auto] gap-4 px-4 py-3 border-b border-gray-100 items-center cursor-pointer transition-colors ${
                            isRefreshing ? 'opacity-60 pointer-events-none' : 'hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(major.code)}
                            onChange={() => toggleMajor(major.code)}
                            disabled={isRefreshing}
                            className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
                          />
                          <span className="text-gray-600 font-mono text-sm">{major.code}</span>
                          <span className="text-gray-900">{major.name}</span>
                          <span className="text-gray-600 text-right text-sm">{major.schoolCount}</span>
                        </label>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Refresh progress */}
            {isRefreshing && refreshProgress && (
              <div className="px-6 py-3 bg-blue-50 border-t border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw size={14} className="text-[#1e3a5f] animate-spin" />
                  <span className="text-sm text-gray-700">
                    正在同步 {refreshProgress.majorName}（{refreshProgress.current}/{refreshProgress.total}）
                  </span>
                </div>
                <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[#1e3a5f]"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${((refreshProgress.current + 1) / refreshProgress.total) * 100}%`,
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200">
              <span className={`text-xs ${selected.size === 0 && !isRefreshing ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                {isRefreshing
                  ? '刷新中，请稍候...'
                  : selected.size === 0
                    ? '请至少选择一个专业'
                    : `已选 ${selected.size} / ${crawledMajors.length} 个专业`}
              </span>
              <div className="flex items-center gap-3">
                <motion.button
                  whileHover={!isRefreshing ? { scale: 1.02 } : undefined}
                  whileTap={!isRefreshing ? { scale: 0.98 } : undefined}
                  onClick={handleConfirm}
                  disabled={isRefreshing || selected.size === 0}
                  className="flex items-center gap-2 px-6 py-2 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#162d4a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRefreshing ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      刷新中
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      确定并刷新
                    </>
                  )}
                </motion.button>
                <motion.button
                  whileHover={!isRefreshing ? { scale: 1.02 } : undefined}
                  whileTap={!isRefreshing ? { scale: 0.98 } : undefined}
                  onClick={onClose}
                  disabled={isRefreshing}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  取消
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// S010 - School Compare Modal
interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  schools: Array<{
    id: string;
    name: string;
    region: string;
    level: string;
    tuition: number;
    duration: number;
    enrollCount: number;
    minScore: number;
    politics: number;
    english: number;
    math: number;
    specialized: number;
  }>;
}

export function CompareModal({ isOpen, onClose, schools }: CompareModalProps) {
  const handleClearAll = () => {
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg shadow-xl w-[900px] max-h-[80vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-medium text-gray-900">学校比较</h2>
                <p className="text-sm text-gray-500">比较已选择学校的招生信息。</p>
              </div>
              <button
                onClick={handleClearAll}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                清空全部
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {/* Selected Schools */}
              <div className="flex items-center gap-3 mb-6">
                {schools.map((school) => (
                  <div
                    key={school.id}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg"
                  >
                    <div className="w-8 h-8 bg-[#1e3a5f] rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {school.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{school.name}</div>
                      <div className="text-xs text-gray-500">{school.region}</div>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600 ml-2">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Comparison Table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className={`grid grid-cols-[120px_repeat(${schools.length},1fr)] gap-4 px-4 py-3 bg-gray-50 text-sm font-medium border-b border-gray-200`}>
                  <div className="text-gray-500">对比项</div>
                  {schools.map((school) => (
                    <div key={school.id} className="text-center text-gray-900">{school.name}</div>
                  ))}
                </div>
                {[
                  { label: '地区', key: 'region' },
                  { label: '院校层次', key: 'level' },
                  { label: '学费（元/年）', key: 'tuition' },
                  { label: '学制', key: 'duration', suffix: '年' },
                  { label: '招生人数', key: 'enrollCount' },
                  { label: '最低分', key: 'minScore', highlight: true },
                  { label: '政治', key: 'politics' },
                  { label: '英语', key: 'english' },
                  { label: '数学', key: 'math' },
                  { label: '专业课', key: 'specialized' },
                ].map((row) => (
                  <div
                    key={row.key}
                    className={`grid grid-cols-[120px_repeat(${schools.length},1fr)] gap-4 px-4 py-3 border-b border-gray-100`}
                  >
                    <div className="text-gray-500 text-sm">{row.label}</div>
                    {schools.map((school) => (
                      <div
                        key={school.id}
                        className={`text-center text-sm ${
                          row.highlight ? 'font-medium text-gray-900' : 'text-gray-600'
                        }`}
                      >
                        {school[row.key as keyof typeof school]}
                        {row.suffix || ''}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// S011 - Favorites Page
interface FavoritesPageProps {
  onClose?: () => void;
}

export function FavoritesPage({ onClose }: FavoritesPageProps) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<WorkspaceFilters>({
    sortBy: 'min_score',
    sortOrder: 'desc',
  });

  const loadFavorites = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchFavorites();
      setFavorites(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载收藏失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  const handleToggleFavorite = async (item: Favorite) => {
    try {
      await toggleFavorite(item.school_id, item.major_code, item.major_name);
      await loadFavorites();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const filterOptions = useMemo<FilterOptions>(() => {
    const provinces = Array.from(new Set(favorites.map((f) => f.province))).filter(Boolean).sort();
    const levels = Array.from(new Set(favorites.map((f) => f.level))).filter(Boolean).sort();
    const levelTags = extractLevelTags(levels);
    const hasSelfScoringTag = favorites.some((f) => f.self_scoring);
    const hasResearchInstitute = favorites.some((f) => isResearchInstitute(f.name));
    if (hasSelfScoringTag && !levelTags.includes('自划线')) levelTags.push('自划线');
    if (hasResearchInstitute && !levelTags.includes('科研院所')) levelTags.push('科研院所');
    levelTags.sort();
    const studyModes = Array.from(
      new Set(favorites.flatMap((f) => f.departments.map((d) => d.study_mode)))
    ).filter(Boolean).sort();
    const examTypes = Array.from(
      new Set(favorites.flatMap((f) => f.departments.map((d) => d.exam_type)))
    ).filter(Boolean).sort();
    const specialPlans = Array.from(
      new Set(favorites.flatMap((f) => f.departments.flatMap((d) => d.special_plans)))
    ).filter(Boolean).sort();
    const allExamSubjects = Array.from(
      new Set(favorites.flatMap((f) => f.departments.flatMap((d) => d.exam_subjects)))
    ).filter(Boolean);
    const { foreign, businessOne, businessTwo } = classifyExamSubjects(allExamSubjects);
    return {
      provinces,
      region_groups: [],
      levels,
      level_tags: levelTags,
      study_modes: studyModes,
      exam_types: examTypes,
      special_plans: specialPlans,
      foreign_subjects: foreign,
      business_one_subjects: businessOne,
      business_two_subjects: businessTwo,
      has_self_scoring: favorites.some((f) => f.self_scoring),
      has_doctoral: favorites.some((f) => f.doctoral_program),
      has_double_first_class: favorites.some((f) => f.double_first_class),
      has_self_scoring_tag: hasSelfScoringTag,
      has_research_institute: hasResearchInstitute,
    };
  }, [favorites]);

  const filteredFavorites = useMemo(() => {
    return applyWorkspaceFilters(favorites, filters).filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [favorites, filters, searchQuery]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <TopNav activeTab="workspace" />

      <div className="flex-1 max-w-6xl mx-auto px-6 py-8 w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">收藏</h1>
        <p className="text-gray-500 mb-6">快速访问关注的学校。</p>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索学校名称......"
              className="w-full pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1e3a5f]"
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        <WorkspaceFilterPanel
          options={filterOptions}
          filters={filters}
          onChange={setFilters}
          resultCount={filteredFavorites.length}
        />

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
            加载中…
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Table */}
        {!isLoading && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[40px_1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 bg-gray-50 text-sm text-gray-500 font-medium border-b border-gray-200">
              <div className="flex items-center justify-center">
                <Star size={16} className="text-red-500" fill="currentColor" />
              </div>
              <div>学校名称</div>
              <div className="w-40 text-center">院校层次</div>
              <div className="w-20 text-center">地区</div>
              <div className="w-20 text-center">最低分</div>
              <div className="w-20 text-center">招生人数</div>
              <div className="w-16 text-center">操作</div>
            </div>
            {filteredFavorites.map((item) => (
              <div
                key={`${item.school_id}-${item.major_code}`}
                className="grid grid-cols-[40px_1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 items-center"
              >
                <div className="flex items-center justify-center">
                  <button
                    onClick={() => handleToggleFavorite(item)}
                    className="text-red-500 hover:text-red-600 transition-colors"
                  >
                    <Star size={18} fill="currentColor" />
                  </button>
                </div>
                <div className="font-medium text-gray-900">{item.name}</div>
                <div className="w-40 text-center text-gray-600">{item.level}</div>
                <div className="w-20 text-center text-gray-600">{item.province}</div>
                <div className="w-20 text-center text-gray-900 font-medium">{item.min_score}</div>
                <div className="w-20 text-center text-gray-600">{item.enroll_count}</div>
                <div className="w-16 flex items-center justify-center">
                  <button className="p-1 text-gray-400 hover:text-[#1e3a5f] transition-colors">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">共 {filteredFavorites.length} 条</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">20条/页</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// S012 - Recent Viewed Page
interface RecentPageProps {
  onClose?: () => void;
}

export function RecentPage({ onClose }: RecentPageProps) {
  const [recentViews, setRecentViews] = useState<RecentView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadRecentViews = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchRecentViews(50);
      setRecentViews(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载最近查看失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecentViews();
  }, []);

  const handleClearHistory = async () => {
    try {
      await clearRecentViews();
      await loadRecentViews();
    } catch (err) {
      setError(err instanceof Error ? err.message : '清空失败');
    }
  };

  const filteredRecent = recentViews.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <TopNav activeTab="workspace" />

      <div className="flex-1 max-w-6xl mx-auto px-6 py-8 w-full">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">最近查看</h1>
        <p className="text-gray-500 mb-6">继续浏览最近查看过的学校。</p>

        {/* Filters */}
        <div className="flex items-center justify-between mb-6">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索学校名称......"
              className="w-full pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1e3a5f]"
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <button
            onClick={handleClearHistory}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            清空历史记录
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
            加载中…
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Table */}
        {!isLoading && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[40px_1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 bg-gray-50 text-sm text-gray-500 font-medium border-b border-gray-200">
              <div className="flex items-center justify-center">
                <Star size={16} />
              </div>
              <div>学校名称</div>
              <div className="w-40 text-center">院校层次</div>
              <div className="w-20 text-center">地区</div>
              <div className="w-32 text-center">所属专业</div>
              <div className="w-24 text-center">最后查看时间</div>
              <div className="w-16 text-center">操作</div>
            </div>
            {filteredRecent.map((item) => (
              <div
                key={`${item.school_id}-${item.major_code}`}
                className="grid grid-cols-[40px_1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 items-center"
              >
                <div className="flex items-center justify-center">
                  <Star size={18} className="text-gray-300" />
                </div>
                <div className="font-medium text-gray-900">{item.name}</div>
                <div className="w-40 text-center text-gray-600">{item.level}</div>
                <div className="w-20 text-center text-gray-600">{item.province}</div>
                <div className="w-32 text-center text-gray-600">{item.major_name}</div>
                <div className="w-24 text-center text-gray-500 text-sm">{formatRelativeTime(item.viewed_at)}</div>
                <div className="w-16 flex items-center justify-center">
                  <button className="p-1 text-gray-400 hover:text-[#1e3a5f] transition-colors">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">共 {filteredRecent.length} 条</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">20条/页</span>
          </div>
        </div>
      </div>
    </div>
  );
}
