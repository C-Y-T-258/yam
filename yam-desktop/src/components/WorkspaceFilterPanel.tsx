import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, MapPin, ChevronDown, ChevronRight } from 'lucide-react';
import {
  REGION_ONE_PROVINCES,
  REGION_TWO_PROVINCES,
  type FilterOptions,
  type WorkspaceFilters,
} from '../lib/db';

interface WorkspaceFilterPanelProps {
  options: FilterOptions;
  filters: WorkspaceFilters;
  onChange: (filters: WorkspaceFilters) => void;
  resultCount?: number;
}

export function WorkspaceFilterPanel({
  options,
  filters,
  onChange,
  resultCount,
}: WorkspaceFilterPanelProps) {
  const [showProvincePanel, setShowProvincePanel] = useState(false);
  const [showLevelPanel, setShowLevelPanel] = useState(false);
  const [showExamSubjectPanel, setShowExamSubjectPanel] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [moreFiltersDraft, setMoreFiltersDraft] = useState({
    minScoreMin: '',
    minScoreMax: '',
    enrollCountMin: '',
    enrollCountMax: '',
    departmentName: '',
    englishMin: '',
    englishMax: '',
    businessOneMin: '',
    businessOneMax: '',
    businessTwoMin: '',
    businessTwoMax: '',
  });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    score: false,
    enroll: false,
    subjectScore: false,
    department: false,
  });

  const provincePanelRef = useRef<HTMLDivElement>(null);
  const levelPanelRef = useRef<HTMLDivElement>(null);
  const examSubjectPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (provincePanelRef.current && !provincePanelRef.current.contains(event.target as Node)) {
        setShowProvincePanel(false);
      }
      if (levelPanelRef.current && !levelPanelRef.current.contains(event.target as Node)) {
        setShowLevelPanel(false);
      }
      if (examSubjectPanelRef.current && !examSubjectPanelRef.current.contains(event.target as Node)) {
        setShowExamSubjectPanel(false);
      }
    };
    if (showProvincePanel || showLevelPanel || showExamSubjectPanel) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProvincePanel, showLevelPanel, showExamSubjectPanel]);

  const selectedProvinces = filters.provinces ?? [];
  const activeRegionGroup = filters.regionGroup ?? null;

  const toggleProvince = (province: string) => {
    const next = selectedProvinces.includes(province)
      ? selectedProvinces.filter((p) => p !== province)
      : [...selectedProvinces, province];
    onChange({
      ...filters,
      provinces: next.length > 0 ? next : undefined,
      regionGroup: undefined,
    });
  };

  const selectRegionGroup = (group: '一区' | '二区') => {
    onChange({
      ...filters,
      regionGroup: activeRegionGroup === group ? undefined : group,
      provinces: undefined,
    });
  };

  const clearProvinces = () => {
    onChange({
      ...filters,
      provinces: undefined,
      regionGroup: undefined,
    });
  };

  const toggleArrayFilter = (key: 'studyModes' | 'examTypes' | 'specialPlans', value: string) => {
    const current = filters[key] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next.length > 0 ? next : undefined });
  };

  const toggleExamSubject = (
    key: 'foreignSubjects' | 'businessOneSubjects' | 'businessTwoSubjects',
    value: string
  ) => {
    const current = filters[key] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next.length > 0 ? next : undefined });
  };

  const toggleLevel = (tag: string) => {
    const current = filters.levels ?? [];
    const next = current.includes(tag)
      ? current.filter((v) => v !== tag)
      : [...current, tag];
    onChange({ ...filters, levels: next.length > 0 ? next : undefined });
  };

  const toggleFeature = (key: 'selfScoring' | 'doctoralProgram' | 'doubleFirstClass') => {
    onChange({ ...filters, [key]: filters[key] ? undefined : true });
  };

  const parseNumber = (value: string) => {
    const num = value ? Number(value) : NaN;
    return Number.isFinite(num) ? num : undefined;
  };

  const applyMoreFilters = () => {
    onChange({
      ...filters,
      minScoreMin: parseNumber(moreFiltersDraft.minScoreMin),
      minScoreMax: parseNumber(moreFiltersDraft.minScoreMax),
      enrollCountMin: parseNumber(moreFiltersDraft.enrollCountMin),
      enrollCountMax: parseNumber(moreFiltersDraft.enrollCountMax),
      departmentName: moreFiltersDraft.departmentName.trim() || undefined,
      englishMin: parseNumber(moreFiltersDraft.englishMin),
      englishMax: parseNumber(moreFiltersDraft.englishMax),
      businessOneMin: parseNumber(moreFiltersDraft.businessOneMin),
      businessOneMax: parseNumber(moreFiltersDraft.businessOneMax),
      businessTwoMin: parseNumber(moreFiltersDraft.businessTwoMin),
      businessTwoMax: parseNumber(moreFiltersDraft.businessTwoMax),
    });
    setShowMoreFilters(false);
  };

  const resetMoreFilters = () => {
    setMoreFiltersDraft({
      minScoreMin: '',
      minScoreMax: '',
      enrollCountMin: '',
      enrollCountMax: '',
      departmentName: '',
      englishMin: '',
      englishMax: '',
      businessOneMin: '',
      businessOneMax: '',
      businessTwoMin: '',
      businessTwoMax: '',
    });
    onChange({
      ...filters,
      minScoreMin: undefined,
      minScoreMax: undefined,
      enrollCountMin: undefined,
      enrollCountMax: undefined,
      departmentName: undefined,
      englishMin: undefined,
      englishMax: undefined,
      businessOneMin: undefined,
      businessOneMax: undefined,
      businessTwoMin: undefined,
      businessTwoMax: undefined,
    });
    setShowMoreFilters(false);
  };

  const toggleMoreFilters = () => {
    setShowMoreFilters((prev) => {
      const next = !prev;
      if (next) {
        setMoreFiltersDraft({
          minScoreMin: filters.minScoreMin?.toString() ?? '',
          minScoreMax: filters.minScoreMax?.toString() ?? '',
          enrollCountMin: filters.enrollCountMin?.toString() ?? '',
          enrollCountMax: filters.enrollCountMax?.toString() ?? '',
          departmentName: filters.departmentName ?? '',
          englishMin: filters.englishMin?.toString() ?? '',
          englishMax: filters.englishMax?.toString() ?? '',
          businessOneMin: filters.businessOneMin?.toString() ?? '',
          businessOneMax: filters.businessOneMax?.toString() ?? '',
          businessTwoMin: filters.businessTwoMin?.toString() ?? '',
          businessTwoMax: filters.businessTwoMax?.toString() ?? '',
        });
      }
      return next;
    });
  };

  const handleSortChange = (value: string) => {
    const [field, order] = value.split('-') as [
      WorkspaceFilters['sortBy'],
      WorkspaceFilters['sortOrder'],
    ];
    onChange({ ...filters, sortBy: field, sortOrder: order });
  };

  const hasMoreFiltersApplied =
    filters.minScoreMin !== undefined ||
    filters.minScoreMax !== undefined ||
    filters.enrollCountMin !== undefined ||
    filters.enrollCountMax !== undefined ||
    filters.departmentName !== undefined ||
    filters.englishMin !== undefined ||
    filters.englishMax !== undefined ||
    filters.businessOneMin !== undefined ||
    filters.businessOneMax !== undefined ||
    filters.businessTwoMin !== undefined ||
    filters.businessTwoMax !== undefined ||
    filters.foreignSubjects !== undefined ||
    filters.businessOneSubjects !== undefined ||
    filters.businessTwoSubjects !== undefined ||
    filters.levels !== undefined;

  const provinceButtonText = activeRegionGroup
    ? activeRegionGroup
    : selectedProvinces.length > 0
      ? `已选 ${selectedProvinces.length} 个地区`
      : '全部地区';

  const selectedLevels = filters.levels ?? [];
  const levelButtonText = selectedLevels.length > 0
    ? `已选 ${selectedLevels.length} 项`
    : '院校层次';

  const selectedForeign = filters.foreignSubjects ?? [];
  const selectedBusinessOne = filters.businessOneSubjects ?? [];
  const selectedBusinessTwo = filters.businessTwoSubjects ?? [];
  const totalExamSubjects = selectedForeign.length + selectedBusinessOne.length + selectedBusinessTwo.length;
  const examSubjectButtonText = totalExamSubjects > 0
    ? `已选 ${totalExamSubjects} 项`
    : '考试科目';

  const clearLevels = () => {
    onChange({ ...filters, levels: undefined });
  };

  const clearExamSubjects = () => {
    onChange({
      ...filters,
      foreignSubjects: undefined,
      businessOneSubjects: undefined,
      businessTwoSubjects: undefined,
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      {/* Row 1: Province + Study Mode + Exam Type */}
      <div className="flex flex-wrap items-start gap-4 mb-3">
        {/* Province selector */}
        <div className="relative" ref={provincePanelRef}>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 whitespace-nowrap">地区：</span>
            <motion.button
              onClick={() => setShowProvincePanel((prev) => !prev)}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                showProvincePanel || selectedProvinces.length > 0 || activeRegionGroup
                  ? 'text-white bg-[#1e3a5f] border-[#1e3a5f]'
                  : 'text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <MapPin size={14} />
              {provinceButtonText}
              <ChevronDown
                size={14}
                className={`transition-transform ${showProvincePanel ? 'rotate-180' : ''}`}
              />
            </motion.button>
          </div>

          <AnimatePresence>
            {showProvincePanel && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-2 w-[480px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-30"
              >
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => selectRegionGroup('一区')}
                    className={`px-3 py-1 text-xs rounded border transition-colors ${
                      activeRegionGroup === '一区'
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                    }`}
                  >
                    一区
                  </button>
                  <button
                    onClick={() => selectRegionGroup('二区')}
                    className={`px-3 py-1 text-xs rounded border transition-colors ${
                      activeRegionGroup === '二区'
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                    }`}
                  >
                    二区
                  </button>
                  <button
                    onClick={clearProvinces}
                    className="px-3 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-400"
                  >
                    清空
                  </button>
                </div>

                <div className="mb-2">
                  <div className="text-xs text-gray-400 mb-1.5">一区</div>
                  <div className="flex flex-wrap gap-2">
                    {options.provinces
                      .filter((p) => REGION_ONE_PROVINCES.includes(p))
                      .map((province) => (
                        <label
                          key={province}
                          className={`flex items-center gap-1 px-2 py-1 text-xs rounded border cursor-pointer transition-colors ${
                            selectedProvinces.includes(province) || activeRegionGroup === '一区'
                              ? 'bg-blue-50 border-[#1e3a5f] text-[#1e3a5f]'
                              : 'border-gray-200 text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={
                              selectedProvinces.includes(province) || activeRegionGroup === '一区'
                            }
                            onChange={() => toggleProvince(province)}
                            disabled={activeRegionGroup === '一区'}
                          />
                          {province}
                        </label>
                      ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-400 mb-1.5">二区</div>
                  <div className="flex flex-wrap gap-2">
                    {options.provinces
                      .filter((p) => REGION_TWO_PROVINCES.includes(p))
                      .map((province) => (
                        <label
                          key={province}
                          className={`flex items-center gap-1 px-2 py-1 text-xs rounded border cursor-pointer transition-colors ${
                            selectedProvinces.includes(province) || activeRegionGroup === '二区'
                              ? 'bg-blue-50 border-[#1e3a5f] text-[#1e3a5f]'
                              : 'border-gray-200 text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={
                              selectedProvinces.includes(province) || activeRegionGroup === '二区'
                            }
                            onChange={() => toggleProvince(province)}
                            disabled={activeRegionGroup === '二区'}
                          />
                          {province}
                        </label>
                      ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Study mode */}
        {options.study_modes.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500 whitespace-nowrap">学习方式：</span>
            {options.study_modes.map((mode) => (
              <label
                key={mode}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border cursor-pointer transition-colors ${
                  (filters.studyModes ?? []).includes(mode)
                    ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={(filters.studyModes ?? []).includes(mode)}
                  onChange={() => toggleArrayFilter('studyModes', mode)}
                />
                {mode}
              </label>
            ))}
          </div>
        )}

        {/* Exam type */}
        {options.exam_types.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500 whitespace-nowrap">考试方式：</span>
            {options.exam_types.map((type) => (
              <label
                key={type}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border cursor-pointer transition-colors ${
                  (filters.examTypes ?? []).includes(type)
                    ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={(filters.examTypes ?? []).includes(type)}
                  onChange={() => toggleArrayFilter('examTypes', type)}
                />
                {type}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Row 2: Features + Special plans + Level + More filters + Sort */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* School features */}
          {(options.has_self_scoring || options.has_doctoral || options.has_double_first_class) && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500 whitespace-nowrap">院校特性：</span>
              {options.has_self_scoring && (
                <label
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border cursor-pointer transition-colors ${
                    filters.selfScoring
                      ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={!!filters.selfScoring}
                    onChange={() => toggleFeature('selfScoring')}
                  />
                  自划线院校
                </label>
              )}
              {options.has_doctoral && (
                <label
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border cursor-pointer transition-colors ${
                    filters.doctoralProgram
                      ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={!!filters.doctoralProgram}
                    onChange={() => toggleFeature('doctoralProgram')}
                  />
                  博士点
                </label>
              )}
              {options.has_double_first_class && (
                <label
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border cursor-pointer transition-colors ${
                    filters.doubleFirstClass
                      ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={!!filters.doubleFirstClass}
                    onChange={() => toggleFeature('doubleFirstClass')}
                  />
                  双一流
                </label>
              )}
            </div>
          )}

          {/* Special plans */}
          {options.special_plans.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500 whitespace-nowrap">专项计划：</span>
              {options.special_plans.map((plan) => (
                <label
                  key={plan}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border cursor-pointer transition-colors ${
                    (filters.specialPlans ?? []).includes(plan)
                      ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={(filters.specialPlans ?? []).includes(plan)}
                    onChange={() => toggleArrayFilter('specialPlans', plan)}
                  />
                  {plan}
                </label>
              ))}
            </div>
          )}

          {/* Level */}
          {options.level_tags.length > 0 && (
            <div className="relative" ref={levelPanelRef}>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 whitespace-nowrap">院校层次：</span>
                <motion.button
                  onClick={() => setShowLevelPanel((prev) => !prev)}
                  className={`flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                    showLevelPanel || selectedLevels.length > 0
                      ? 'text-white bg-[#1e3a5f] border-[#1e3a5f]'
                      : 'text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {levelButtonText}
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${showLevelPanel ? 'rotate-180' : ''}`}
                  />
                </motion.button>
              </div>

              <AnimatePresence>
                {showLevelPanel && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">选择院校层次</span>
                      <button
                        onClick={clearLevels}
                        className="px-2 py-0.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                      >
                        清空
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {options.level_tags.map((tag) => (
                        <label
                          key={tag}
                          className={`flex items-center gap-1 px-2 py-1 text-xs rounded border cursor-pointer transition-colors ${
                            selectedLevels.includes(tag)
                              ? 'bg-blue-50 border-[#1e3a5f] text-[#1e3a5f]'
                              : 'border-gray-200 text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={selectedLevels.includes(tag)}
                            onChange={() => toggleLevel(tag)}
                          />
                          {tag}
                        </label>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Exam subjects */}
          {(options.foreign_subjects.length > 0 || options.business_one_subjects.length > 0 || options.business_two_subjects.length > 0) && (
            <div className="relative" ref={examSubjectPanelRef}>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 whitespace-nowrap">考试科目：</span>
                <motion.button
                  onClick={() => setShowExamSubjectPanel((prev) => !prev)}
                  className={`flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                    showExamSubjectPanel || totalExamSubjects > 0
                      ? 'text-white bg-[#1e3a5f] border-[#1e3a5f]'
                      : 'text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {examSubjectButtonText}
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${showExamSubjectPanel ? 'rotate-180' : ''}`}
                  />
                </motion.button>
              </div>

              <AnimatePresence>
                {showExamSubjectPanel && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 mt-2 w-96 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">选择考试科目</span>
                      <button
                        onClick={clearExamSubjects}
                        className="px-2 py-0.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                      >
                        清空
                      </button>
                    </div>

                    {options.foreign_subjects.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-400 mb-1.5">外语</div>
                        <div className="flex flex-wrap gap-2">
                          {options.foreign_subjects.map((subject) => (
                            <label
                              key={subject}
                              className={`flex items-center gap-1 px-2 py-1 text-xs rounded border cursor-pointer transition-colors ${
                                selectedForeign.includes(subject)
                                  ? 'bg-blue-50 border-[#1e3a5f] text-[#1e3a5f]'
                                  : 'border-gray-200 text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={selectedForeign.includes(subject)}
                                onChange={() => toggleExamSubject('foreignSubjects', subject)}
                              />
                              {subject}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {options.business_one_subjects.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-400 mb-1.5">业务课一</div>
                        <div className="flex flex-wrap gap-2">
                          {options.business_one_subjects.map((subject) => (
                            <label
                              key={subject}
                              className={`flex items-center gap-1 px-2 py-1 text-xs rounded border cursor-pointer transition-colors ${
                                selectedBusinessOne.includes(subject)
                                  ? 'bg-blue-50 border-[#1e3a5f] text-[#1e3a5f]'
                                  : 'border-gray-200 text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={selectedBusinessOne.includes(subject)}
                                onChange={() => toggleExamSubject('businessOneSubjects', subject)}
                              />
                              {subject}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {options.business_two_subjects.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-400 mb-1.5">业务课二</div>
                        <div className="flex flex-wrap gap-2">
                          {options.business_two_subjects.map((subject) => (
                            <label
                              key={subject}
                              className={`flex items-center gap-1 px-2 py-1 text-xs rounded border cursor-pointer transition-colors ${
                                selectedBusinessTwo.includes(subject)
                                  ? 'bg-blue-50 border-[#1e3a5f] text-[#1e3a5f]'
                                  : 'border-gray-200 text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={selectedBusinessTwo.includes(subject)}
                                onChange={() => toggleExamSubject('businessTwoSubjects', subject)}
                              />
                              {subject}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* More filters toggle */}
          <motion.button
            onClick={toggleMoreFilters}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
              showMoreFilters || hasMoreFiltersApplied
                ? 'text-white bg-[#1e3a5f] border-[#1e3a5f]'
                : 'text-[#1e3a5f] border-[#1e3a5f] hover:bg-blue-50'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <SlidersHorizontal size={14} />
            更多筛选
          </motion.button>
        </div>

        <div className="flex items-center gap-4">
          {resultCount !== undefined && (
            <span className="text-sm text-gray-500">共 {resultCount} 所</span>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">排序：</span>
            <select
              value={`${filters.sortBy ?? 'min_score'}-${filters.sortOrder ?? 'desc'}`}
              onChange={(e) => handleSortChange(e.target.value)}
              className="px-3 py-1.5 text-sm text-gray-700 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f] bg-white"
            >
              <option value="default-asc">默认排序（掌上考研）</option>
              <option value="school_code-asc">按国标代码排序（研招网）</option>
              <option value="min_score-desc">最低分从高到低</option>
              <option value="min_score-asc">最低分从低到高</option>
              <option value="enroll_count-desc">招生人数从多到少</option>
              <option value="enroll_count-asc">招生人数从少到多</option>
              <option value="name-asc">学校名称升序</option>
              <option value="name-desc">学校名称降序</option>
            </select>
          </div>
        </div>
      </div>

      {/* More filters inline panel */}
      <AnimatePresence>
        {showMoreFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900">更多筛选条件</h3>
                <button
                  onClick={() => setShowMoreFilters(false)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  收起
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  {
                    key: 'score',
                    label: '最低分区间',
                    summary:
                      moreFiltersDraft.minScoreMin || moreFiltersDraft.minScoreMax
                        ? `${moreFiltersDraft.minScoreMin || '不限'} - ${moreFiltersDraft.minScoreMax || '不限'}`
                        : undefined,
                    content: (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="最低"
                          value={moreFiltersDraft.minScoreMin}
                          onChange={(e) =>
                            setMoreFiltersDraft((prev) => ({ ...prev, minScoreMin: e.target.value }))
                          }
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#1e3a5f]"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                          type="number"
                          placeholder="最高"
                          value={moreFiltersDraft.minScoreMax}
                          onChange={(e) =>
                            setMoreFiltersDraft((prev) => ({ ...prev, minScoreMax: e.target.value }))
                          }
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#1e3a5f]"
                        />
                      </div>
                    ),
                  },
                  {
                    key: 'enroll',
                    label: '招生人数区间',
                    summary:
                      moreFiltersDraft.enrollCountMin || moreFiltersDraft.enrollCountMax
                        ? `${moreFiltersDraft.enrollCountMin || '不限'} - ${moreFiltersDraft.enrollCountMax || '不限'}`
                        : undefined,
                    content: (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="最少"
                          value={moreFiltersDraft.enrollCountMin}
                          onChange={(e) =>
                            setMoreFiltersDraft((prev) => ({ ...prev, enrollCountMin: e.target.value }))
                          }
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#1e3a5f]"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                          type="number"
                          placeholder="最多"
                          value={moreFiltersDraft.enrollCountMax}
                          onChange={(e) =>
                            setMoreFiltersDraft((prev) => ({ ...prev, enrollCountMax: e.target.value }))
                          }
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#1e3a5f]"
                        />
                      </div>
                    ),
                  },
                  {
                    key: 'subjectScore',
                    label: '科目分数区间',
                    summary:
                      moreFiltersDraft.englishMin ||
                      moreFiltersDraft.englishMax ||
                      moreFiltersDraft.businessOneMin ||
                      moreFiltersDraft.businessOneMax ||
                      moreFiltersDraft.businessTwoMin ||
                      moreFiltersDraft.businessTwoMax
                        ? '已设置'
                        : undefined,
                    content: (
                      <div className="space-y-2">
                        {[
                          { label: '外语', minKey: 'englishMin', maxKey: 'englishMax' },
                          { label: '业务课一', minKey: 'businessOneMin', maxKey: 'businessOneMax' },
                          { label: '业务课二', minKey: 'businessTwoMin', maxKey: 'businessTwoMax' },
                        ].map(({ label, minKey, maxKey }) => (
                          <div key={label} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-16">{label}</span>
                            <input
                              type="number"
                              placeholder="最低"
                              value={moreFiltersDraft[minKey as keyof typeof moreFiltersDraft]}
                              onChange={(e) =>
                                setMoreFiltersDraft((prev) => ({ ...prev, [minKey]: e.target.value }))
                              }
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#1e3a5f]"
                            />
                            <span className="text-gray-400">-</span>
                            <input
                              type="number"
                              placeholder="最高"
                              value={moreFiltersDraft[maxKey as keyof typeof moreFiltersDraft]}
                              onChange={(e) =>
                                setMoreFiltersDraft((prev) => ({ ...prev, [maxKey]: e.target.value }))
                              }
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#1e3a5f]"
                            />
                          </div>
                        ))}
                      </div>
                    ),
                  },
                  {
                    key: 'department',
                    label: '院系名称关键词',
                    summary: moreFiltersDraft.departmentName || undefined,
                    content: (
                      <input
                        type="text"
                        placeholder="例如：计算机"
                        value={moreFiltersDraft.departmentName}
                        onChange={(e) =>
                          setMoreFiltersDraft((prev) => ({ ...prev, departmentName: e.target.value }))
                        }
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#1e3a5f]"
                      />
                    ),
                  },
                ].map(({ key, label, summary, content }) => (
                  <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() =>
                        setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <span className="font-medium">{label}</span>
                      <div className="flex items-center gap-2">
                        {summary && (
                          <span className="text-xs text-[#1e3a5f] bg-blue-50 px-2 py-0.5 rounded">
                            {summary}
                          </span>
                        )}
                        <motion.span
                          animate={{ rotate: expandedSections[key] ? 90 : 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <ChevronRight size={14} className="text-gray-400" />
                        </motion.span>
                      </div>
                    </button>
                    <AnimatePresence initial={false}>
                      {expandedSections[key] && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 pt-1 border-t border-gray-100">{content}</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  onClick={resetMoreFilters}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
                >
                  重置
                </button>
                <button
                  onClick={applyMoreFilters}
                  className="px-3 py-1.5 text-xs text-white bg-[#1e3a5f] hover:bg-[#162d4a] rounded"
                >
                  应用
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
