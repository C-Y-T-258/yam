import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, RefreshCw, Database } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import {
  ACADEMIC_CATEGORIES,
  PROFESSIONAL_CATEGORIES,
} from '../data/majors';
import type {
  DisciplineCategory,
  FirstLevelDiscipline,
  Major,
} from '../data/majors';

type DegreeType = 'all' | 'academic' | 'professional';

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

function getDisciplinesWithType(category: DisciplineCategory): Array<{
  type: 'academic' | 'professional';
  discipline: FirstLevelDiscipline;
}> {
  const academicCat = ACADEMIC_CATEGORIES.find((c) => c.code === category.code);
  const professionalCat = PROFESSIONAL_CATEGORIES.find((c) => c.code === category.code);
  const results: Array<{ type: 'academic' | 'professional'; discipline: FirstLevelDiscipline }> = [];
  if (academicCat) {
    for (const d of academicCat.disciplines) results.push({ type: 'academic', discipline: d });
  }
  if (professionalCat) {
    for (const d of professionalCat.disciplines) results.push({ type: 'professional', discipline: d });
  }
  return results.sort((a, b) => a.discipline.code.localeCompare(b.discipline.code));
}

interface CrawledMajor {
  code: string;
  name: string;
  schoolCount: number;
  lastUpdated: string;
}

interface SplashScreenProps {
  onSelect: (majorCode: string) => void;
  onStartCrawl?: (majorCode: string) => void;
  crawledMajors?: CrawledMajor[];
}

export function SplashScreen({ onSelect, onStartCrawl, crawledMajors = [] }: SplashScreenProps) {
  const { enableProfessionalThreeLevelMenu, setEnableProfessionalThreeLevelMenu } = useAppStore();
  const [degreeType, setDegreeType] = useState<DegreeType>('all');
  const [selectedCategory, setSelectedCategory] = useState<DisciplineCategory | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState<FirstLevelDiscipline | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMajors, setSelectedMajors] = useState<Set<string>>(new Set());

  const categories = useMemo(() => {
    if (degreeType === 'academic') return ACADEMIC_CATEGORIES;
    if (degreeType === 'professional') return PROFESSIONAL_CATEGORIES;
    return mergeCategories(ACADEMIC_CATEGORIES, PROFESSIONAL_CATEGORIES);
  }, [degreeType]);
  const isProfessionalFlat = degreeType === 'professional' && !enableProfessionalThreeLevelMenu;

  const hasData = crawledMajors.length > 0;

  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: Array<{
      type: DegreeType;
      category: DisciplineCategory;
      discipline: FirstLevelDiscipline;
      major: Major;
    }> = [];

    const collect = (type: DegreeType, cats: DisciplineCategory[]) => {
      for (const cat of cats) {
        for (const disc of cat.disciplines) {
          for (const major of disc.majors) {
            if (
              major.name.toLowerCase().includes(q) ||
              major.code.includes(q) ||
              disc.name.toLowerCase().includes(q) ||
              disc.code.includes(q) ||
              cat.name.toLowerCase().includes(q) ||
              cat.code.includes(q)
            ) {
              results.push({ type, category: cat, discipline: disc, major });
            }
          }
        }
      }
    };

    collect('academic', ACADEMIC_CATEGORIES);
    collect('professional', PROFESSIONAL_CATEGORIES);
    return results;
  }, [searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  const allMajors = useMemo(() => {
    const results: Array<{
      type: Exclude<DegreeType, 'all'>;
      category: DisciplineCategory;
      discipline: FirstLevelDiscipline;
      major: Major;
    }> = [];
    const collect = (type: Exclude<DegreeType, 'all'>, cats: DisciplineCategory[]) => {
      for (const cat of cats) {
        for (const disc of cat.disciplines) {
          for (const major of disc.majors) {
            results.push({ type, category: cat, discipline: disc, major });
          }
        }
      }
    };
    collect('academic', ACADEMIC_CATEGORIES);
    collect('professional', PROFESSIONAL_CATEGORIES);
    return results;
  }, []);

  const toggleMajorSelection = (code: string) => {
    setSelectedMajors(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const totalSchools = crawledMajors.reduce((sum, m) => sum + m.schoolCount, 0);

  // Has data view
  if (hasData) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5"
      >
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-xl p-8 w-[700px]"
        >
          <h1 className="text-3xl font-bold text-center text-primary mb-2">研喵 YAM</h1>
          <p className="text-center text-gray-500 mb-6">本地优先的考研择校数据工具</p>

          {/* Enter Main Button */}
          <div className="flex justify-center mb-6">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                if (selectedMajors.size > 0) {
                  onSelect(Array.from(selectedMajors)[0]);
                } else if (crawledMajors.length > 0) {
                  onSelect(crawledMajors[0].code);
                }
              }}
              className="px-8 py-3 bg-primary text-white rounded-full font-medium text-lg shadow-lg hover:shadow-xl transition-shadow"
            >
              进入主界面
            </motion.button>
          </div>

          {/* Crawled Majors List */}
          <div className="border rounded-xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 bg-gray-50 text-sm text-gray-500 font-medium">
              <div className="w-5"></div>
              <div>专业名</div>
              <div className="text-right">已采集</div>
              <div className="text-right">院校</div>
              <div className="w-8"></div>
            </div>

            {/* List */}
            {crawledMajors.map((major, index) => (
              <motion.div
                key={major.code}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 border-t hover:bg-gray-50 transition-colors items-center"
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selectedMajors.has(major.code)}
                  onChange={() => toggleMajorSelection(major.code)}
                  className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                />

                {/* Major Name */}
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-mono">{major.code}</span>
                  <span className="font-medium">{major.name}</span>
                </div>

                {/* Collected Status */}
                <div className="flex items-center gap-1 text-green-600">
                  <Check size={16} />
                  <span>{major.schoolCount}所</span>
                </div>

                {/* School Count */}
                <div className="flex items-center gap-1 text-green-600">
                  <Check size={16} />
                  <span>{major.schoolCount}所</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onStartCrawl?.(major.code)}
                    className="p-1 text-gray-400 hover:text-primary transition-colors"
                    title="刷新数据"
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    onClick={() => onSelect(major.code)}
                    className="p-1 text-gray-400 hover:text-primary transition-colors"
                    title="进入查看"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Summary */}
          <p className="text-sm text-gray-500 mt-4 text-center">
            共 {crawledMajors.length} 个专业, {totalSchools} 所院校
          </p>
        </motion.div>
      </motion.div>
    );
  }

  // No data view - original three-column selector
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5"
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl shadow-xl p-8 w-[800px]"
      >
        <h1 className="text-3xl font-bold text-center text-primary mb-2">研喵 YAM</h1>
        <p className="text-center text-gray-500 mb-6">本地优先的考研择校数据工具</p>

        {/* Degree Type Selector */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => {
                setDegreeType('all');
                setSelectedCategory(null);
                setSelectedDiscipline(null);
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                degreeType === 'all'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => {
                setDegreeType('academic');
                setSelectedCategory(null);
                setSelectedDiscipline(null);
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                degreeType === 'academic'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              学术学位
            </button>
            <button
              onClick={() => {
                setDegreeType('professional');
                setSelectedCategory(null);
                setSelectedDiscipline(null);
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                degreeType === 'professional'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              专业学位
            </button>
          </div>
          {degreeType === 'professional' && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableProfessionalThreeLevelMenu}
                onChange={(e) => setEnableProfessionalThreeLevelMenu(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
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
            placeholder="搜索专业名称或代码..."
            className="w-full p-3 border rounded-lg"
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
          <div className="border rounded-lg p-3 h-64 overflow-auto">
            {filteredResults.length > 0 ? (
              filteredResults.map((item, index) => (
                <motion.button
                  key={`${item.type}-${item.major.code}-${index}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index * 0.01, 0.2) }}
                  whileHover={{ x: 4 }}
                  onClick={() => {
                    setDegreeType(item.type);
                    setSelectedCategory(item.category);
                    setSelectedDiscipline(item.discipline);
                    setSearchQuery('');
                    onStartCrawl?.(item.major.code);
                  }}
                  className="w-full text-left px-3 py-2 rounded text-sm mb-1 hover:bg-primary/10 transition-colors"
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
            <div className="border rounded-lg p-3 h-64 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">学科门类</h3>
              {categories.map((cat) => (
                <motion.button
                  key={cat.code}
                  whileHover={{ x: 4 }}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setSelectedDiscipline(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                    selectedCategory?.code === cat.code
                      ? 'bg-primary text-white'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <span className="text-xs opacity-60 mr-1">{cat.code}</span>
                  {cat.name}
                </motion.button>
              ))}
            </div>

            {/* Column 2: 一级学科/专业学位类别 */}
            <div className="border rounded-lg p-3 h-64 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">学科类别</h3>
              <AnimatePresence mode="wait">
                {selectedCategory ? (
                  getDisciplinesWithType(selectedCategory).length > 0 ? (
                    getDisciplinesWithType(selectedCategory).map((item) => (
                      <motion.button
                        key={`${item.type}-${item.discipline.code}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        whileHover={{ x: 4 }}
                        onClick={() => setSelectedDiscipline(item.discipline)}
                        className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                          selectedDiscipline?.code === item.discipline.code
                            ? 'bg-primary text-white'
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
                    ))
                  ) : (
                    <p className="text-center text-gray-400 py-8 text-sm">该门类下暂无学科</p>
                  )
                ) : (
                  <p className="text-center text-gray-400 py-8 text-sm">请选择门类</p>
                )}
              </AnimatePresence>
            </div>

            {/* Column 3: 专业 */}
            <div className="border rounded-lg p-3 h-64 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">专业</h3>
              <AnimatePresence mode="wait">
                {selectedDiscipline ? (
                  allMajors.filter(
                    (item) =>
                      item.category.code === selectedCategory?.code &&
                      item.discipline.code === selectedDiscipline.code
                  ).length > 0 ? (
                    allMajors
                      .filter(
                        (item) =>
                          item.category.code === selectedCategory?.code &&
                          item.discipline.code === selectedDiscipline.code
                      )
                      .sort((a, b) => a.major.code.localeCompare(b.major.code))
                      .map((item) => (
                        <motion.button
                          key={`${item.type}-${item.major.code}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          whileHover={{ x: 4 }}
                          onClick={() => onStartCrawl?.(item.major.code)}
                          className="w-full text-left px-3 py-2 rounded text-sm mb-1 hover:bg-primary/10 transition-colors"
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
                      ))
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
              className="border rounded-lg p-3 h-64 overflow-auto min-w-0"
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
                        setSelectedDiscipline(disc);
                      } else if (disc.majors.length === 1) {
                        setSelectedDiscipline(null);
                        onStartCrawl?.(disc.majors[0].code);
                      } else {
                        setSelectedDiscipline(null);
                      }
                    }}
                    className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors whitespace-nowrap overflow-hidden text-ellipsis ${
                      selectedDiscipline?.code === disc.code
                        ? 'bg-primary text-white'
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
                  className="border rounded-lg p-3 h-64 overflow-auto min-w-0"
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
                      onClick={() => onStartCrawl?.(m.code)}
                      className="w-full text-left px-3 py-2 rounded text-sm mb-1 hover:bg-primary/10 transition-colors whitespace-nowrap overflow-hidden text-ellipsis"
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
          /* 3-column cascading for academic or professional (when enabled) */
          <div className="grid grid-cols-3 gap-4">
            {/* Column 1: 门类 */}
            <div className="border rounded-lg p-3 h-64 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">学科门类</h3>
              {categories.map((cat) => (
                <motion.button
                  key={cat.code}
                  whileHover={{ x: 4 }}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setSelectedDiscipline(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                    selectedCategory?.code === cat.code
                      ? 'bg-primary text-white'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <span className="text-xs opacity-60 mr-1">{cat.code}</span>
                  {cat.name}
                </motion.button>
              ))}
            </div>

            {/* Column 2: 一级学科 / 专业学位类别 */}
            <div className="border rounded-lg p-3 h-64 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                {degreeType === 'academic' ? '一级学科' : '专业学位类别'}
              </h3>
              <AnimatePresence mode="wait">
                {selectedCategory ? (
                  selectedCategory.disciplines.map((disc) => (
                    <motion.button
                      key={disc.code}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      whileHover={{ x: 4 }}
                      onClick={() => setSelectedDiscipline(disc)}
                      className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                        selectedDiscipline?.code === disc.code
                          ? 'bg-primary text-white'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-xs opacity-60 mr-1">{disc.code}</span>
                      {disc.name}
                    </motion.button>
                  ))
                ) : (
                  <p className="text-center text-gray-400 py-8 text-sm">请选择门类</p>
                )}
              </AnimatePresence>
            </div>

            {/* Column 3: 专业 */}
            <div className="border rounded-lg p-3 h-64 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">专业</h3>
              <AnimatePresence mode="wait">
                {selectedDiscipline ? (
                  selectedDiscipline.majors.length > 0 ? (
                    selectedDiscipline.majors.map((m) => (
                      <motion.button
                        key={m.code}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        whileHover={{ x: 4 }}
                        onClick={() => onStartCrawl?.(m.code)}
                        className="w-full text-left px-3 py-2 rounded text-sm mb-1 hover:bg-primary/10 transition-colors"
                      >
                        <span className="text-gray-500 mr-2 font-mono">{m.code}</span>
                        {m.name}
                      </motion.button>
                    ))
                  ) : (
                    <div className="py-4">
                      <p className="text-sm text-gray-500 mb-3">
                        按一级学科招生
                      </p>
                      <motion.button
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        whileHover={{ x: 4 }}
                        onClick={() => onStartCrawl?.(selectedDiscipline.code)}
                        className="w-full text-left px-3 py-2 rounded text-sm mb-1 hover:bg-primary/10 transition-colors bg-primary/5"
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

        {/* Manual Input Link */}
        <p className="text-center text-sm text-gray-500 mt-4">
          或 <button className="text-primary hover:underline">手动输入专业代码</button>
        </p>
      </motion.div>
    </motion.div>
  );
}
