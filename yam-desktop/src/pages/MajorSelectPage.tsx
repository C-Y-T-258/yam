import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import {
  ACADEMIC_CATEGORIES,
  PROFESSIONAL_DEGREE_CATEGORIES,
} from '../data/majors';
import type {
  DisciplineCategory,
  FirstLevelDiscipline,
  Major,
  ProfessionalDegreeCategory,
} from '../data/majors';
import { useAppStore } from '../stores/appStore';

type DegreeType = 'academic' | 'professional';

export function MajorSelectPage() {
  const { setPage, addMajor, crawledMajors } = useAppStore();
  const [degreeType, setDegreeType] = useState<DegreeType>('academic');
  const [selectedCategory, setSelectedCategory] = useState<DisciplineCategory | null>(null);
  const [selectedDiscipline, setSelectedDiscipline] = useState<FirstLevelDiscipline | null>(null);
  const [selectedProfCategory, setSelectedProfCategory] = useState<ProfessionalDegreeCategory | null>(null);
  const [showSubFields, setShowSubFields] = useState(false);
  const [selectedSubField, setSelectedSubField] = useState<string | null>(null);
  const [selectedMajor, setSelectedMajor] = useState<{ code: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const subFieldsRef = useRef<HTMLDivElement>(null);

  const filteredAcademicMajors = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: Array<{
      type: 'academic';
      category: DisciplineCategory;
      discipline: FirstLevelDiscipline;
      major: Major;
    }> = [];

    for (const cat of ACADEMIC_CATEGORIES) {
      for (const disc of cat.disciplines) {
        if (disc.majors.length === 0) {
          if (disc.name.toLowerCase().includes(q) || disc.code.includes(q)) {
            results.push({
              type: 'academic',
              category: cat,
              discipline: disc,
              major: { code: disc.code, name: disc.name },
            });
          }
          continue;
        }
        for (const major of disc.majors) {
          if (major.name.toLowerCase().includes(q) || major.code.includes(q)) {
            results.push({
              type: 'academic',
              category: cat,
              discipline: disc,
              major,
            });
          }
        }
      }
    }
    return results;
  }, [searchQuery]);

  const filteredProfessionalMajors = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return PROFESSIONAL_DEGREE_CATEGORIES.filter(
      (cat) =>
        cat.name.toLowerCase().includes(q) ||
        cat.code.includes(q) ||
        cat.subFields?.some((f) => f.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const isSearching = searchQuery.trim().length > 0;
  const isExistingMajor = selectedMajor
    ? crawledMajors.some((m) => m.code === selectedMajor.code)
    : false;

  const handleSelectMajor = (code: string, name: string) => {
    setSelectedMajor({ code, name });
    setShowSubFields(false);
  };

  const handleSelectProfCategory = (cat: ProfessionalDegreeCategory) => {
    const hasSubFields = !!(cat.subFields && cat.subFields.length > 0);
    setSelectedProfCategory(cat);
    setSelectedSubField(null);
    setSelectedMajor(null);
    // 只在状态变化时更新，避免动画重复播放
    if (hasSubFields !== showSubFields) {
      setShowSubFields(hasSubFields);
    }
    if (!hasSubFields) {
      setSelectedMajor({ code: cat.code, name: cat.name });
    }
  };

  const handleSelectSubField = (subField: string) => {
    setSelectedSubField(subField);
    if (selectedProfCategory) {
      setSelectedMajor({
        code: selectedProfCategory.code,
        name: `${selectedProfCategory.name} - ${subField}`,
      });
    }
  };

  const handleConfirm = () => {
    if (selectedMajor) {
      if (!isExistingMajor) {
        addMajor({
          code: selectedMajor.code,
          name: selectedMajor.name,
          dataVersion: '2026',
          lastUpdated: '刚刚',
          schoolCount: 0,
          dbSize: '0 MB',
        });
      }
      setPage('crawling');
    }
  };

  const handleBack = () => {
    setPage('major-management');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (subFieldsRef.current && !subFieldsRef.current.contains(event.target as Node)) {
        setShowSubFields(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        <p className="text-gray-500 mb-6">选择需要采集数据的专业。</p>

        {/* Degree Type Selector */}
        <div className="flex justify-center mb-4">
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => {
                setDegreeType('academic');
                setSelectedCategory(null);
                setSelectedDiscipline(null);
                setSelectedProfCategory(null);
                setShowSubFields(false);
                setSelectedSubField(null);
                setSelectedMajor(null);
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                degreeType === 'academic'
                  ? 'bg-white text-[#1e3a5f] shadow-sm'
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
                setSelectedProfCategory(null);
                setShowSubFields(false);
                setSelectedSubField(null);
                setSelectedMajor(null);
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                degreeType === 'professional'
                  ? 'bg-white text-[#1e3a5f] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              专业学位
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索专业名称或代码..."
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
          <div className="border border-gray-200 rounded-lg p-3 h-64 overflow-auto">
            {degreeType === 'academic' ? (
              filteredAcademicMajors.length > 0 ? (
                filteredAcademicMajors.map((item) => (
                  <motion.button
                    key={item.major.code}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    whileHover={{ x: 4 }}
                    onClick={() => handleSelectMajor(item.major.code, item.major.name)}
                    className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                      selectedMajor?.code === item.major.code
                        ? 'bg-[#1e3a5f] text-white'
                        : 'hover:bg-[#1e3a5f]/10'
                    }`}
                  >
                    <span className="text-gray-500 mr-2">{item.major.code}</span>
                    {item.major.name}
                    <span className="text-xs text-gray-400 ml-2">
                      {item.category.name} · {item.discipline.name}
                    </span>
                  </motion.button>
                ))
              ) : (
                <p className="text-center text-gray-500 py-8">未找到匹配的专业</p>
              )
            ) : filteredProfessionalMajors.length > 0 ? (
              filteredProfessionalMajors.map((cat) => (
                <motion.button
                  key={cat.code}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ x: 4 }}
                  onClick={() => handleSelectProfCategory(cat)}
                  className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                    selectedProfCategory?.code === cat.code
                      ? 'bg-[#1e3a5f] text-white'
                      : 'hover:bg-[#1e3a5f]/10'
                  }`}
                >
                  <span className="text-gray-500 mr-2">{cat.code}</span>
                  {cat.name}
                  {cat.subFields && (
                    <span className="text-xs text-gray-400 ml-2">
                      ({cat.subFields.length}个方向)
                    </span>
                  )}
                </motion.button>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">未找到匹配的专业</p>
            )}
          </div>
        ) : degreeType === 'academic' ? (
          /* Academic: 3-column cascading */
          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-lg p-3 h-64 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">学科门类</h3>
              {ACADEMIC_CATEGORIES.map((cat) => (
                <motion.button
                  key={cat.code}
                  whileHover={{ x: 4 }}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setSelectedDiscipline(null);
                    setSelectedMajor(null);
                  }}
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

            <div className="border rounded-lg p-3 h-64 overflow-auto">
              <h3 className="text-sm font-medium text-gray-500 mb-2">一级学科</h3>
              <AnimatePresence mode="wait">
                {selectedCategory ? (
                  selectedCategory.disciplines.map((disc) => (
                    <motion.button
                      key={disc.code}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      whileHover={{ x: 4 }}
                      onClick={() => {
                        setSelectedDiscipline(disc);
                        setSelectedMajor(null);
                      }}
                      className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                        selectedDiscipline?.code === disc.code
                          ? 'bg-[#1e3a5f] text-white'
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
                        onClick={() => handleSelectMajor(m.code, m.name)}
                        className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                          selectedMajor?.code === m.code
                            ? 'bg-[#1e3a5f] text-white'
                            : 'hover:bg-[#1e3a5f]/10'
                        }`}
                      >
                        <span className="text-gray-500 mr-2">{m.code}</span>
                        {m.name}
                      </motion.button>
                    ))
                  ) : (
                    <div className="py-4">
                      <p className="text-sm text-gray-500 mb-3">按一级学科招生</p>
                      <motion.button
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        whileHover={{ x: 4 }}
                        onClick={() => handleSelectMajor(selectedDiscipline.code, selectedDiscipline.name)}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors bg-[#1e3a5f]/5 ${
                          selectedMajor?.code === selectedDiscipline.code
                            ? 'bg-[#1e3a5f] text-white'
                            : ''
                        }`}
                      >
                        <span className="text-gray-500 mr-2">{selectedDiscipline.code}</span>
                        {selectedDiscipline.name}
                      </motion.button>
                    </div>
                  )
                ) : (
                  <p className="text-center text-gray-400 py-8 text-sm">请选择一级学科</p>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          /* Professional: Two-column layout */
          <div className="flex gap-4 h-64">
            {/* Left: Category list */}
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className={`border rounded-lg overflow-hidden transition-all duration-200 ${showSubFields ? 'w-1/2' : 'w-full'}`}
            >
              <div className="px-3 py-2 bg-gray-50 border-b">
                <h3 className="text-sm font-medium text-gray-600">专业学位类别</h3>
              </div>
              <div className="h-[calc(100%-36px)] overflow-auto">
                {PROFESSIONAL_DEGREE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.code}
                    onClick={() => handleSelectProfCategory(cat)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                      selectedProfCategory?.code === cat.code
                        ? 'bg-[#1e3a5f] text-white'
                        : 'hover:bg-[#1e3a5f]/10'
                    }`}
                  >
                    <div>
                      <span className="text-gray-500 mr-2">{cat.code}</span>
                      {cat.name}
                    </div>
                    {cat.subFields && cat.subFields.length > 0 && (
                      <span className={`text-xs ${selectedProfCategory?.code === cat.code ? 'text-white/70' : 'text-gray-400'}`}>
                        ({cat.subFields.length}个方向)
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: SubFields - always rendered when showSubFields is true */}
            <div
              ref={subFieldsRef}
              className={`border rounded-lg overflow-hidden transition-all duration-200 ${
                showSubFields ? 'w-1/2 opacity-100' : 'w-0 opacity-0 border-0'
              }`}
            >
              <div className="px-3 py-2 bg-gray-50 border-b">
                <h3 className="text-sm font-medium text-gray-600">
                  {selectedProfCategory?.name || '选择'} - 研究方向
                </h3>
              </div>
              <div className="h-[calc(100%-36px)] overflow-auto">
                {selectedProfCategory?.subFields?.map((field) => (
                  <button
                    key={field}
                    onClick={() => handleSelectSubField(field)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      selectedSubField === field
                        ? 'bg-[#1e3a5f] text-white'
                        : 'hover:bg-[#1e3a5f]/10'
                    }`}
                  >
                    {field}
                  </button>
                ))}
              </div>
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
