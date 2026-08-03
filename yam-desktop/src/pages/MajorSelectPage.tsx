import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, GraduationCap, Award } from 'lucide-react';
import { ACADEMIC_CATEGORIES, PROFESSIONAL_CATEGORIES } from '../data/majors';
import type { DisciplineCategory, FirstLevelDiscipline, Major } from '../data/majors';
import { useAppStore } from '../stores/appStore';
import { resetCrawl, readMajorsCatalog, isTauri } from '../lib/db';

type DegreeType = 'all' | 'academic' | 'professional';

interface SearchResult {
  type: Exclude<DegreeType, 'all'>;
  category: DisciplineCategory;
  discipline: FirstLevelDiscipline;
  major: Major;
}

interface RealtimeCatalog {
  academic: DisciplineCategory[];
  professional: DisciplineCategory[];
}

function mergeCategories(
  academic: DisciplineCategory[],
  professional: DisciplineCategory[]
): DisciplineCategory[] {
  const map = new Map<string, DisciplineCategory>();
  for (const cat of academic) {
    map.set(cat.code, { ...cat, disciplines: [...cat.disciplines] });
  }
  for (const cat of professional) {
    const existing = map.get(cat.code);
    if (existing) {
      existing.disciplines = [...existing.disciplines, ...cat.disciplines];
    } else {
      map.set(cat.code, { ...cat, disciplines: [...cat.disciplines] });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

function getDisciplinesWithType(
  category: DisciplineCategory,
  academicCats: DisciplineCategory[],
  professionalCats: DisciplineCategory[]
): Array<{
  type: 'academic' | 'professional';
  discipline: FirstLevelDiscipline;
}> {
  const academicCat = academicCats.find((c) => c.code === category.code);
  const professionalCat = professionalCats.find((c) => c.code === category.code);
  const results: Array<{ type: 'academic' | 'professional'; discipline: FirstLevelDiscipline }> = [];
  if (academicCat) {
    for (const d of academicCat.disciplines) results.push({ type: 'academic', discipline: d });
  }
  if (professionalCat) {
    for (const d of professionalCat.disciplines) results.push({ type: 'professional', discipline: d });
  }
  return results.sort((a, b) => a.discipline.code.localeCompare(b.discipline.code));
}

export function MajorSelectPage() {
  const {
    setPage,
    crawledMajors,
    setCrawlTarget,
    enableProfessionalThreeLevelMenu,
    setEnableProfessionalThreeLevelMenu,
  } = useAppStore();
  const [degreeType, setDegreeType] = useState<DegreeType>('all');
  const [selectedCategory, setSelectedCategory] = useState<DisciplineCategory | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState<FirstLevelDiscipline | null>(null);
  const [selectedMajor, setSelectedMajor] = useState<Major | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // 实时目录（来自 d:/yam/data/majors_realtime.json），如果存在则覆盖静态数据。
  // 初始为 null 表示尚未加载；加载后即使为空数组也设为非 null 以触发 useMemo 重算。
  const [realtimeCatalog, setRealtimeCatalog] = useState<RealtimeCatalog | null>(null);

  // 桌面端启动时尝试读取实时目录；浏览器环境跳过。
  useEffect(() => {
    if (!isTauri) return;
    let active = true;
    (async () => {
      try {
        const jsonStr = await readMajorsCatalog();
        if (!active || !jsonStr) return;
        const parsed = JSON.parse(jsonStr) as {
          academic_categories?: DisciplineCategory[];
          professional_categories?: DisciplineCategory[];
        };
        if (parsed.academic_categories && parsed.professional_categories) {
          setRealtimeCatalog({
            academic: parsed.academic_categories,
            professional: parsed.professional_categories,
          });
        }
      } catch (e) {
        console.warn('读取实时专业目录失败，回退到静态数据:', e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 实际使用的数据源：优先实时目录，否则静态。
  const academicCats = realtimeCatalog?.academic ?? ACADEMIC_CATEGORIES;
  const professionalCats = realtimeCatalog?.professional ?? PROFESSIONAL_CATEGORIES;

  const categories = useMemo(() => {
    if (degreeType === 'academic') return academicCats;
    if (degreeType === 'professional') return professionalCats;
    return mergeCategories(academicCats, professionalCats);
  }, [degreeType, academicCats, professionalCats]);
  const isProfessionalFlat = degreeType === 'professional' && !enableProfessionalThreeLevelMenu;

  // 构建跨学位类型的统一搜索索引
  const allSearchResults = useMemo<SearchResult[]>(() => {
    const results: SearchResult[] = [];
    const collect = (type: Exclude<DegreeType, 'all'>, cats: DisciplineCategory[]) => {
      for (const cat of cats) {
        for (const disc of cat.disciplines) {
          for (const major of disc.majors) {
            results.push({ type, category: cat, discipline: disc, major });
          }
        }
      }
    };
    collect('academic', academicCats);
    collect('professional', professionalCats);
    return results;
  }, [academicCats, professionalCats]);

  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allSearchResults.filter(
      (item) =>
        item.major.name.toLowerCase().includes(q) ||
        item.major.code.includes(q) ||
        item.discipline.name.toLowerCase().includes(q) ||
        item.discipline.code.includes(q) ||
        item.category.name.toLowerCase().includes(q) ||
        item.category.code.includes(q)
    );
  }, [searchQuery, allSearchResults]);

  const isSearching = searchQuery.trim().length > 0;
  const isExistingMajor = selectedMajor
    ? crawledMajors.some((m) => m.code === selectedMajor.code)
    : false;

  // 当前选中门类下的所有学科（带学位类型标记）
  const disciplinesInSelectedCategory = useMemo(() => {
    if (!selectedCategory) return [];
    return getDisciplinesWithType(selectedCategory, academicCats, professionalCats);
  }, [selectedCategory, academicCats, professionalCats]);

  const handleSelectMajor = (major: Major) => {
    setSelectedMajor(major);
  };

  const handleSelectDiscipline = (disc: FirstLevelDiscipline) => {
    setSelectedDiscipline(disc);
    setSelectedMajor(null);
  };

  const handleSelectCategory = (cat: DisciplineCategory) => {
    setSelectedCategory(cat);
    setSelectedDiscipline(null);
    setSelectedMajor(null);
  };

  const handleSelectSearchResult = (result: SearchResult) => {
    setDegreeType(result.type);
    setSelectedCategory(result.category);
    setSelectedDiscipline(result.discipline);
    setSelectedMajor(result.major);
    setSearchQuery('');
  };

  const handleConfirm = async () => {
    if (selectedMajor) {
      // 仅允许清理已结束的状态；运行中的任务会由后端拒绝重置，不会被新请求终止。
      try {
        await resetCrawl();
      } catch (e) {
        console.warn('reset crawl rejected:', e);
      }
      // 不在此处添加专业；采集并同步成功后由 CrawlingPage 加入，
      // 避免未采集成功就出现在专业管理页。
      setCrawlTarget({ code: selectedMajor.code, name: selectedMajor.name });
      setPage('crawling');
    }
  };

  const handleBack = () => {
    setPage('major-management');
  };

  const handleDegreeTypeChange = (type: DegreeType) => {
    setDegreeType(type);
    setSelectedCategory(null);
    setSelectedDiscipline(null);
    setSelectedMajor(null);
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="p-1.5 text-gray-400 hover:text-gray-600">
            <ChevronLeft size={20} />
          </button>
          <div className="w-8 h-8 bg-[#1e3a5f] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">研</span>
          </div>
          <span className="font-medium text-gray-800">研喵 (YAM)</span>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">选择专业</h1>
        <p className="text-gray-500 mb-6">选择需要采集数据的专业。数据来自掌上考研专业目录。</p>

        {/* Degree Type Selector */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => handleDegreeTypeChange('all')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                degreeType === 'all'
                  ? 'bg-white text-[#1e3a5f] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => handleDegreeTypeChange('academic')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                degreeType === 'academic'
                  ? 'bg-white text-[#1e3a5f] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <GraduationCap size={16} />
              学术学位
            </button>
            <button
              onClick={() => handleDegreeTypeChange('professional')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                degreeType === 'professional'
                  ? 'bg-white text-[#1e3a5f] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Award size={16} />
              专业学位
            </button>
          </div>
          {degreeType === 'professional' && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableProfessionalThreeLevelMenu}
                onChange={(e) => setEnableProfessionalThreeLevelMenu(e.target.checked)}
                className="rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
              />
              启用三级菜单
            </label>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索专业名称或代码，支持跨学位类型搜索..."
            className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f]"
          />
          {isSearching && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* Search Results */}
        {isSearching ? (
          <div className="border border-gray-200 rounded-lg p-3 h-80 overflow-auto">
            {filteredResults.length > 0 ? (
              filteredResults.map((item, index) => (
                <motion.button
                  key={`${item.type}-${item.major.code}-${index}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index * 0.01, 0.2) }}
                  whileHover={{ x: 4 }}
                  onClick={() => handleSelectSearchResult(item)}
                  className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                    selectedMajor?.code === item.major.code && degreeType === item.type
                      ? 'bg-[#1e3a5f] text-white'
                      : 'hover:bg-[#1e3a5f]/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 mr-2 font-mono">{item.major.code}</span>
                    <span className="font-medium">{item.major.name}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        item.type === 'academic'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-green-50 text-green-600'
                      }`}
                    >
                      {item.type === 'academic' ? '学硕' : '专硕'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 ml-[72px]">
                    {item.category.name} · {item.discipline.name}
                  </div>
                </motion.button>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">未找到匹配的专业</p>
            )}
          </div>
        ) : degreeType === 'all' ? (
          /* 3-column cascading for all degree types */
          <div className="grid grid-cols-3 gap-4">
            {/* Column 1: 门类 */}
            <div className="border rounded-lg p-3 h-80 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">学科门类</h3>
              {categories.map((cat) => (
                <motion.button
                  key={cat.code}
                  whileHover={{ x: 4 }}
                  onClick={() => handleSelectCategory(cat)}
                  className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                    selectedCategory?.code === cat.code
                      ? 'bg-[#1e3a5f] text-white'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <span className="text-xs opacity-60 mr-1">{cat.code}</span>
                  {cat.name}
                </motion.button>
              ))}
            </div>

            {/* Column 2: 一级学科/专业学位类别 */}
            <div className="border rounded-lg p-3 h-80 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">学科类别</h3>
              <AnimatePresence mode="wait">
                {selectedCategory ? (
                  disciplinesInSelectedCategory.length > 0 ? (
                    <motion.div
                      key={selectedCategory.code}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                    >
                      {disciplinesInSelectedCategory.map((item) => (
                        <motion.button
                          key={`${item.type}-${item.discipline.code}`}
                          whileHover={{ x: 4 }}
                          onClick={() => handleSelectDiscipline(item.discipline)}
                          className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                            selectedDiscipline?.code === item.discipline.code
                              ? 'bg-[#1e3a5f] text-white'
                              : 'hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs opacity-60 mr-1">{item.discipline.code}</span>
                            <span className="font-medium">{item.discipline.name}</span>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                item.type === 'academic'
                                  ? 'bg-blue-50 text-blue-600'
                                  : 'bg-green-50 text-green-600'
                              }`}
                            >
                              {item.type === 'academic' ? '学硕' : '专硕'}
                            </span>
                          </div>
                        </motion.button>
                      ))}
                    </motion.div>
                  ) : (
                    <p className="text-center text-gray-400 py-8 text-sm">该门类下暂无学科</p>
                  )
                ) : (
                  <p className="text-center text-gray-400 py-8 text-sm">请选择门类</p>
                )}
              </AnimatePresence>
            </div>

            {/* Column 3: 专业 */}
            <div className="border rounded-lg p-3 h-80 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">专业</h3>
              <AnimatePresence mode="wait">
                {selectedDiscipline ? (
                  allSearchResults.filter(
                    (item) =>
                      item.category.code === selectedCategory?.code &&
                      item.discipline.code === selectedDiscipline.code
                  ).length > 0 ? (
                    <motion.div
                      key={selectedDiscipline.code}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                    >
                      {allSearchResults
                        .filter(
                          (item) =>
                            item.category.code === selectedCategory?.code &&
                            item.discipline.code === selectedDiscipline.code
                        )
                        .sort((a, b) => a.major.code.localeCompare(b.major.code))
                        .map((item) => (
                          <motion.button
                            key={`${item.type}-${item.major.code}`}
                            whileHover={{ x: 4 }}
                            onClick={() => handleSelectMajor(item.major)}
                            className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                              selectedMajor?.code === item.major.code
                                ? 'bg-[#1e3a5f] text-white'
                                : 'hover:bg-[#1e3a5f]/10'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 mr-2 font-mono">{item.major.code}</span>
                              <span className="font-medium">{item.major.name}</span>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  item.type === 'academic'
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'bg-green-50 text-green-600'
                                }`}
                              >
                                {item.type === 'academic' ? '学硕' : '专硕'}
                              </span>
                            </div>
                          </motion.button>
                        ))}
                    </motion.div>
                  ) : (
                    <p className="text-center text-gray-400 py-8 text-sm">该学科下暂无专业</p>
                  )
                ) : (
                  <p className="text-center text-gray-400 py-8 text-sm">请选择学科类别</p>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : isProfessionalFlat ? (
          /* Professional: category -> research directions (old interaction) */
          <div className="flex gap-4 overflow-hidden">
            {/* Column 1: 专业学位类别 */}
            <motion.div
              layout
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="border rounded-lg p-3 h-80 overflow-auto min-w-0"
              style={{ flex: 1 }}
            >
              <h3 className="text-sm font-medium text-gray-500 mb-2">专业学位类别</h3>
              {PROFESSIONAL_CATEGORIES.flatMap((cat) => cat.disciplines)
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((disc) => (
                  <motion.button
                    key={disc.code}
                    whileHover={{ x: 4 }}
                    onClick={() => {
                      if (disc.majors.length > 1) {
                        handleSelectDiscipline(disc);
                      } else if (disc.majors.length === 1) {
                        setSelectedDiscipline(null);
                        handleSelectMajor(disc.majors[0]);
                      } else {
                        setSelectedDiscipline(null);
                        setSelectedMajor(null);
                      }
                    }}
                    className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors whitespace-nowrap overflow-hidden text-ellipsis ${
                      selectedDiscipline?.code === disc.code
                        ? 'bg-[#1e3a5f] text-white'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-xs opacity-60 mr-1">{disc.code}</span>
                    {disc.name}
                    {disc.majors.length > 1 && (
                      <span className="ml-2 text-xs opacity-60">({disc.majors.length}个方向)</span>
                    )}
                  </motion.button>
                ))}
            </motion.div>

            {/* Column 2: 研究方向 */}
            <AnimatePresence initial={false} mode="popLayout">
              {selectedDiscipline && selectedDiscipline.majors.length > 1 && (
                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="border rounded-lg p-3 h-80 overflow-auto min-w-0"
                  style={{ flex: 1 }}
                >
                  <h3 className="text-sm font-medium text-gray-500 mb-2">研究方向</h3>
                  {selectedDiscipline.majors.map((m, i) => (
                    <motion.button
                      key={m.code}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      whileHover={{ x: 4 }}
                      onClick={() => handleSelectMajor(m)}
                      className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors whitespace-nowrap overflow-hidden text-ellipsis ${
                        selectedMajor?.code === m.code
                          ? 'bg-[#1e3a5f] text-white'
                          : 'hover:bg-[#1e3a5f]/10'
                      }`}
                    >
                      <span className="text-gray-500 mr-2 font-mono">{m.code}</span>
                      {m.name}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          /* Cascading: 3-column layout for academic or professional (when enabled) */
          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-lg p-3 h-80 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">学科门类</h3>
              {categories.map((cat) => (
                <motion.button
                  key={cat.code}
                  whileHover={{ x: 4 }}
                  onClick={() => handleSelectCategory(cat)}
                  className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                    selectedCategory?.code === cat.code
                      ? 'bg-[#1e3a5f] text-white'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <span className="text-xs opacity-60 mr-1">{cat.code}</span>
                  {cat.name}
                </motion.button>
              ))}
            </div>

            <div className="border rounded-lg p-3 h-80 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                {degreeType === 'academic' ? '一级学科' : '专业学位类别'}
              </h3>
              <AnimatePresence mode="wait">
                {selectedCategory ? (
                  <motion.div
                    key={selectedCategory.code}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                  >
                    {selectedCategory.disciplines.map((disc) => (
                      <motion.button
                        key={disc.code}
                        whileHover={{ x: 4 }}
                        onClick={() => handleSelectDiscipline(disc)}
                        className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                          selectedDiscipline?.code === disc.code
                            ? 'bg-[#1e3a5f] text-white'
                            : 'hover:bg-gray-100'
                        }`}
                      >
                        <span className="text-xs opacity-60 mr-1">{disc.code}</span>
                        {disc.name}
                      </motion.button>
                    ))}
                  </motion.div>
                ) : (
                  <p className="text-center text-gray-400 py-8 text-sm">请选择门类</p>
                )}
              </AnimatePresence>
            </div>

            <div className="border rounded-lg p-3 h-80 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">专业</h3>
              <AnimatePresence mode="wait">
                {selectedDiscipline ? (
                  selectedDiscipline.majors.length > 0 ? (
                    <motion.div
                      key={selectedDiscipline.code}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                    >
                      {selectedDiscipline.majors.map((m) => (
                        <motion.button
                          key={m.code}
                          whileHover={{ x: 4 }}
                          onClick={() => handleSelectMajor(m)}
                          className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                            selectedMajor?.code === m.code
                              ? 'bg-[#1e3a5f] text-white'
                              : 'hover:bg-[#1e3a5f]/10'
                          }`}
                        >
                          <span className="text-gray-500 mr-2 font-mono">{m.code}</span>
                          {m.name}
                        </motion.button>
                      ))}
                    </motion.div>
                  ) : (
                    <div className="py-4">
                      <p className="text-sm text-gray-500 mb-3">按一级学科招生</p>
                      <motion.button
                        whileHover={{ x: 4 }}
                        onClick={() => handleSelectMajor(selectedDiscipline)}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors bg-[#1e3a5f]/5 ${
                          selectedMajor?.code === selectedDiscipline.code
                            ? 'bg-[#1e3a5f] text-white'
                            : ''
                        }`}
                      >
                        <span className="text-gray-500 mr-2 font-mono">{selectedDiscipline.code}</span>
                        {selectedDiscipline.name}
                      </motion.button>
                    </div>
                  )
                ) : (
                  <p className="text-center text-gray-400 py-8 text-sm">
                    {degreeType === 'academic' ? '请选择一级学科' : '请选择专业学位类别'}
                  </p>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Confirm Button */}
        {selectedMajor && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 flex justify-center"
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleConfirm}
              className="px-8 py-3 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#162d4a] transition-colors"
            >
              {isExistingMajor ? `确认更新：${selectedMajor.name}` : `确认添加：${selectedMajor.name}`}
            </motion.button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
