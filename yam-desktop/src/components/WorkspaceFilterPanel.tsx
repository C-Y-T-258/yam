import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SlidersHorizontal,
  MapPin,
  GraduationCap,
  BookOpen,
  Clock,
  FileText,
  Award,
  ChevronDown,
  ChevronRight,
  X,
  ArrowUpDown,
} from 'lucide-react';
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
  const [showStudyModePanel, setShowStudyModePanel] = useState(false);
  const [showExamTypePanel, setShowExamTypePanel] = useState(false);
  const [showSpecialPlanPanel, setShowSpecialPlanPanel] = useState(false);
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
    score: true,
    enroll: true,
    subjectScore: false,
    department: false,
  });

  const provincePanelRef = useRef<HTMLDivElement>(null);
  const levelPanelRef = useRef<HTMLDivElement>(null);
  const examSubjectPanelRef = useRef<HTMLDivElement>(null);
  const studyModePanelRef = useRef<HTMLDivElement>(null);
  const examTypePanelRef = useRef<HTMLDivElement>(null);
  const specialPlanPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (provincePanelRef.current && !provincePanelRef.current.contains(target)) {
        setShowProvincePanel(false);
      }
      if (levelPanelRef.current && !levelPanelRef.current.contains(target)) {
        setShowLevelPanel(false);
      }
      if (examSubjectPanelRef.current && !examSubjectPanelRef.current.contains(target)) {
        setShowExamSubjectPanel(false);
      }
      if (studyModePanelRef.current && !studyModePanelRef.current.contains(target)) {
        setShowStudyModePanel(false);
      }
      if (examTypePanelRef.current && !examTypePanelRef.current.contains(target)) {
        setShowExamTypePanel(false);
      }
      if (specialPlanPanelRef.current && !specialPlanPanelRef.current.contains(target)) {
        setShowSpecialPlanPanel(false);
      }
    };
    if (
      showProvincePanel ||
      showLevelPanel ||
      showExamSubjectPanel ||
      showStudyModePanel ||
      showExamTypePanel ||
      showSpecialPlanPanel
    ) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [
    showProvincePanel,
    showLevelPanel,
    showExamSubjectPanel,
    showStudyModePanel,
    showExamTypePanel,
    showSpecialPlanPanel,
  ]);

  const selectedProvinces = filters.provinces ?? [];
  const activeRegionGroup = filters.regionGroup ?? null;
  const selectedLevels = filters.levels ?? [];
  const selectedStudyModes = filters.studyModes ?? [];
  const selectedExamTypes = filters.examTypes ?? [];
  const selectedSpecialPlans = filters.specialPlans ?? [];
  const selectedForeign = filters.foreignSubjects ?? [];
  const selectedBusinessOne = filters.businessOneSubjects ?? [];
  const selectedBusinessTwo = filters.businessTwoSubjects ?? [];

  const totalExamSubjects = selectedForeign.length + selectedBusinessOne.length + selectedBusinessTwo.length;

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
    onChange({ ...filters, provinces: undefined, regionGroup: undefined });
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
    const next = selectedLevels.includes(tag)
      ? selectedLevels.filter((v) => v !== tag)
      : [...selectedLevels, tag];
    onChange({ ...filters, levels: next.length > 0 ? next : undefined });
  };

  const clearLevels = () => onChange({ ...filters, levels: undefined });

  const clearExamSubjects = () =>
    onChange({
      ...filters,
      foreignSubjects: undefined,
      businessOneSubjects: undefined,
      businessTwoSubjects: undefined,
    });

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
    filters.businessTwoMax !== undefined;

  const activeChips = useMemo(() => {
    // UX-3.1：每个 chip 附带 onEdit，点击 chip 主体（非 ×）打开对应筛选面板重新编辑
    const chips: { label: string; onRemove: () => void; onEdit: () => void }[] = [];
    if (activeRegionGroup) {
      chips.push({ label: activeRegionGroup, onRemove: clearProvinces, onEdit: () => setShowProvincePanel(true) });
    }
    selectedProvinces.forEach((p) =>
      chips.push({
        label: p,
        onRemove: () => toggleProvince(p),
        onEdit: () => setShowProvincePanel(true),
      })
    );
    selectedLevels.forEach((l) =>
      chips.push({
        label: l,
        onRemove: () => toggleLevel(l),
        onEdit: () => setShowLevelPanel(true),
      })
    );
    selectedStudyModes.forEach((s) =>
      chips.push({
        label: s,
        onRemove: () => toggleArrayFilter('studyModes', s),
        onEdit: () => setShowStudyModePanel(true),
      })
    );
    selectedExamTypes.forEach((e) =>
      chips.push({
        label: e,
        onRemove: () => toggleArrayFilter('examTypes', e),
        onEdit: () => setShowExamTypePanel(true),
      })
    );
    selectedSpecialPlans.forEach((s) =>
      chips.push({
        label: s,
        onRemove: () => toggleArrayFilter('specialPlans', s),
        onEdit: () => setShowSpecialPlanPanel(true),
      })
    );
    selectedForeign.forEach((s) =>
      chips.push({
        label: `外语：${s}`,
        onRemove: () => toggleExamSubject('foreignSubjects', s),
        onEdit: () => setShowExamSubjectPanel(true),
      })
    );
    selectedBusinessOne.forEach((s) =>
      chips.push({
        label: `业务课一：${s}`,
        onRemove: () => toggleExamSubject('businessOneSubjects', s),
        onEdit: () => setShowExamSubjectPanel(true),
      })
    );
    selectedBusinessTwo.forEach((s) =>
      chips.push({
        label: `业务课二：${s}`,
        onRemove: () => toggleExamSubject('businessTwoSubjects', s),
        onEdit: () => setShowExamSubjectPanel(true),
      })
    );
    return chips;
  }, [
    activeRegionGroup,
    selectedProvinces,
    selectedLevels,
    selectedStudyModes,
    selectedExamTypes,
    selectedSpecialPlans,
    selectedForeign,
    selectedBusinessOne,
    selectedBusinessTwo,
  ]);

  const clearAllFilters = () => {
    onChange({
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
  };

  const isActive = (open: boolean, hasValue: boolean) => open || hasValue;

  const FilterButton = ({
    open,
    hasValue,
    onClick,
    icon: Icon,
    label,
    activeLabel,
  }: {
    open: boolean;
    hasValue: boolean;
    onClick: () => void;
    icon: React.ElementType;
    label: string;
    activeLabel?: string;
  }) => (
    <motion.button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
        isActive(open, hasValue)
          ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
          : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f] hover:text-[#1e3a5f]'
      }`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
    >
      <Icon size={14} />
      <span className="max-w-[120px] truncate">{activeLabel || label}</span>
      <ChevronDown
        size={14}
        className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      />
    </motion.button>
  );

  const DropdownCard = ({
    children,
    className = '',
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={`absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 z-30 ${className}`}
    >
      {children}
    </motion.div>
  );

  const TagCheckbox = ({
    checked,
    onChange,
    label,
    disabled,
  }: {
    checked: boolean;
    onChange: () => void;
    label: string;
    disabled?: boolean;
  }) => (
    <label
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border cursor-pointer transition-colors ${
        checked
          ? 'bg-blue-50 border-[#1e3a5f] text-[#1e3a5f]'
          : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        type="checkbox"
        className="hidden"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      {label}
    </label>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm">
      {/* Filter buttons row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Province */}
        <div className="relative" ref={provincePanelRef}>
          <FilterButton
            open={showProvincePanel}
            hasValue={selectedProvinces.length > 0 || activeRegionGroup !== null}
            onClick={() => setShowProvincePanel((p) => !p)}
            icon={MapPin}
            label="地区"
            activeLabel={
              activeRegionGroup ||
              (selectedProvinces.length > 0 ? `已选 ${selectedProvinces.length}` : undefined)
            }
          />
          <AnimatePresence>
            {showProvincePanel && (
              <DropdownCard className="w-[520px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">选择地区</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearProvinces}
                      className="text-xs text-gray-500 hover:text-gray-800"
                    >
                      清空
                    </button>
                    <button onClick={() => setShowProvincePanel(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => selectRegionGroup('一区')}
                    className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                      activeRegionGroup === '一区'
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                    }`}
                  >
                    一区
                  </button>
                  <button
                    onClick={() => selectRegionGroup('二区')}
                    className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                      activeRegionGroup === '二区'
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f]'
                    }`}
                  >
                    二区
                  </button>
                </div>

                <div className="mb-4">
                  <div className="text-xs font-medium text-gray-500 mb-2">一区</div>
                  <div className="flex flex-wrap gap-2">
                    {options.provinces
                      .filter((p) => REGION_ONE_PROVINCES.includes(p))
                      .map((province) => (
                        <TagCheckbox
                          key={province}
                          checked={selectedProvinces.includes(province) || activeRegionGroup === '一区'}
                          onChange={() => toggleProvince(province)}
                          label={province}
                          disabled={activeRegionGroup === '一区'}
                        />
                      ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-gray-500 mb-2">二区</div>
                  <div className="flex flex-wrap gap-2">
                    {options.provinces
                      .filter((p) => REGION_TWO_PROVINCES.includes(p))
                      .map((province) => (
                        <TagCheckbox
                          key={province}
                          checked={selectedProvinces.includes(province) || activeRegionGroup === '二区'}
                          onChange={() => toggleProvince(province)}
                          label={province}
                          disabled={activeRegionGroup === '二区'}
                        />
                      ))}
                  </div>
                </div>
              </DropdownCard>
            )}
          </AnimatePresence>
        </div>

        {/* Level */}
        <div className="relative" ref={levelPanelRef}>
          <FilterButton
            open={showLevelPanel}
            hasValue={selectedLevels.length > 0}
            onClick={() => setShowLevelPanel((p) => !p)}
            icon={GraduationCap}
            label="院校层次"
            activeLabel={selectedLevels.length > 0 ? `已选 ${selectedLevels.length}` : undefined}
          />
          <AnimatePresence>
            {showLevelPanel && (
              <DropdownCard className="w-[420px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">院校层次</h3>
                  <div className="flex items-center gap-2">
                    <button onClick={clearLevels} className="text-xs text-gray-500 hover:text-gray-800">
                      清空
                    </button>
                    <button onClick={() => setShowLevelPanel(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {options.level_tags.map((tag) => (
                    <TagCheckbox
                      key={tag}
                      checked={selectedLevels.includes(tag)}
                      onChange={() => toggleLevel(tag)}
                      label={tag}
                    />
                  ))}
                </div>
              </DropdownCard>
            )}
          </AnimatePresence>
        </div>

        {/* Exam Subjects */}
        <div className="relative" ref={examSubjectPanelRef}>
          <FilterButton
            open={showExamSubjectPanel}
            hasValue={totalExamSubjects > 0}
            onClick={() => setShowExamSubjectPanel((p) => !p)}
            icon={BookOpen}
            label="考试科目"
            activeLabel={totalExamSubjects > 0 ? `已选 ${totalExamSubjects}` : undefined}
          />
          <AnimatePresence>
            {showExamSubjectPanel && (
              <DropdownCard className="w-[480px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">考试科目</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearExamSubjects}
                      className="text-xs text-gray-500 hover:text-gray-800"
                    >
                      清空
                    </button>
                    <button onClick={() => setShowExamSubjectPanel(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {[
                  { title: '外语', key: 'foreignSubjects' as const, options: options.foreign_subjects },
                  { title: '业务课一', key: 'businessOneSubjects' as const, options: options.business_one_subjects },
                  { title: '业务课二', key: 'businessTwoSubjects' as const, options: options.business_two_subjects },
                ].map(({ title, key, options: opts }) => (
                  <div key={key} className="mb-4 last:mb-0">
                    <div className="text-xs font-medium text-gray-500 mb-2">{title}</div>
                    <div className="flex flex-wrap gap-2">
                      {opts.length > 0 ? (
                        opts.map((subject) => (
                          <TagCheckbox
                            key={subject}
                            checked={(filters[key] ?? []).includes(subject)}
                            onChange={() => toggleExamSubject(key, subject)}
                            label={subject}
                          />
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">暂无数据</span>
                      )}
                    </div>
                  </div>
                ))}
              </DropdownCard>
            )}
          </AnimatePresence>
        </div>

        {/* Study Mode */}
        {options.study_modes.length > 0 && (
          <div className="relative" ref={studyModePanelRef}>
            <FilterButton
              open={showStudyModePanel}
              hasValue={selectedStudyModes.length > 0}
              onClick={() => setShowStudyModePanel((p) => !p)}
              icon={Clock}
              label="学习方式"
              activeLabel={
                selectedStudyModes.length > 0 ? `已选 ${selectedStudyModes.length}` : undefined
              }
            />
            <AnimatePresence>
              {showStudyModePanel && (
                <DropdownCard className="w-[240px] max-w-[calc(100vw-2rem)] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900">学习方式</h3>
                    <button onClick={() => setShowStudyModePanel(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {options.study_modes.map((mode) => (
                      <TagCheckbox
                        key={mode}
                        checked={selectedStudyModes.includes(mode)}
                        onChange={() => toggleArrayFilter('studyModes', mode)}
                        label={mode}
                      />
                    ))}
                  </div>
                </DropdownCard>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Exam Type */}
        {options.exam_types.length > 0 && (
          <div className="relative" ref={examTypePanelRef}>
            <FilterButton
              open={showExamTypePanel}
              hasValue={selectedExamTypes.length > 0}
              onClick={() => setShowExamTypePanel((p) => !p)}
              icon={FileText}
              label="考试方式"
              activeLabel={
                selectedExamTypes.length > 0 ? `已选 ${selectedExamTypes.length}` : undefined
              }
            />
            <AnimatePresence>
              {showExamTypePanel && (
                <DropdownCard className="w-[240px] max-w-[calc(100vw-2rem)] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900">考试方式</h3>
                    <button onClick={() => setShowExamTypePanel(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {options.exam_types.map((type) => (
                      <TagCheckbox
                        key={type}
                        checked={selectedExamTypes.includes(type)}
                        onChange={() => toggleArrayFilter('examTypes', type)}
                        label={type}
                      />
                    ))}
                  </div>
                </DropdownCard>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Special Plans */}
        {options.special_plans.length > 0 && (
          <div className="relative" ref={specialPlanPanelRef}>
            <FilterButton
              open={showSpecialPlanPanel}
              hasValue={selectedSpecialPlans.length > 0}
              onClick={() => setShowSpecialPlanPanel((p) => !p)}
              icon={Award}
              label="专项计划"
              activeLabel={
                selectedSpecialPlans.length > 0 ? `已选 ${selectedSpecialPlans.length}` : undefined
              }
            />
            <AnimatePresence>
              {showSpecialPlanPanel && (
                <DropdownCard className="w-[280px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900">专项计划</h3>
                    <button onClick={() => setShowSpecialPlanPanel(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {options.special_plans.map((plan) => (
                      <TagCheckbox
                        key={plan}
                        checked={selectedSpecialPlans.includes(plan)}
                        onChange={() => toggleArrayFilter('specialPlans', plan)}
                        label={plan}
                      />
                    ))}
                  </div>
                </DropdownCard>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* More Filters drawer trigger */}
        <motion.button
          onClick={toggleMoreFilters}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            showMoreFilters || hasMoreFiltersApplied
              ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
              : 'bg-white text-gray-700 border-gray-200 hover:border-[#1e3a5f] hover:text-[#1e3a5f]'
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          <SlidersHorizontal size={14} />
          更多筛选
        </motion.button>

        {/* Sort */}
        <div className="flex items-center gap-2 ml-auto">
          <ArrowUpDown size={14} className="text-gray-400" />
          <select
            value={`${filters.sortBy}-${filters.sortOrder}`}
            onChange={(e) => handleSortChange(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-[#1e3a5f] bg-white"
          >
            <option value="min_score-desc">按最低分从高到低</option>
            <option value="min_score-asc">按最低分从低到高</option>
            <option value="enroll_count-desc">按招生人数从多到少</option>
            <option value="enroll_count-asc">按招生人数从少到多</option>
            <option value="name-asc">按学校名称</option>
            <option value="default-asc">默认排序（掌上考研）</option>
            <option value="school_code-asc">按国标代码排序（研招网）</option>
          </select>
        </div>
      </div>

      {/* Active chips */}
      <AnimatePresence>
        {activeChips.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              {activeChips.map((chip, idx) => (
                <span
                  key={`${chip.label}-${idx}`}
                  onClick={chip.onEdit}
                  title="点击重新编辑该筛选条件"
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-50 text-[#1e3a5f] border border-blue-100 rounded-full cursor-pointer hover:bg-blue-100 hover:border-blue-300 transition-colors"
                >
                  {chip.label}
                  <button
                    onClick={(e) => { e.stopPropagation(); chip.onRemove(); }}
                    className="hover:text-red-500"
                    aria-label="移除"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <button
                onClick={clearAllFilters}
                className="text-xs text-gray-500 hover:text-red-500 ml-1"
              >
                清除全部
              </button>
              <span className="text-xs text-gray-400 ml-auto">
                共 {resultCount ?? 0} 条结果
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!activeChips.length && resultCount !== undefined && (
        <div className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
          共 {resultCount} 条结果
        </div>
      )}

      {/* More Filters Drawer */}
      <AnimatePresence>
        {showMoreFilters && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/30 z-40"
              onClick={() => setShowMoreFilters(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="fixed top-0 right-0 h-full w-[420px] max-w-[calc(100vw-1rem)] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-900">更多筛选条件</h2>
                <button
                  onClick={() => setShowMoreFilters(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
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
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f]"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                          type="number"
                          placeholder="最高"
                          value={moreFiltersDraft.minScoreMax}
                          onChange={(e) =>
                            setMoreFiltersDraft((prev) => ({ ...prev, minScoreMax: e.target.value }))
                          }
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f]"
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
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f]"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                          type="number"
                          placeholder="最多"
                          value={moreFiltersDraft.enrollCountMax}
                          onChange={(e) =>
                            setMoreFiltersDraft((prev) => ({ ...prev, enrollCountMax: e.target.value }))
                          }
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f]"
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
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f]"
                            />
                            <span className="text-gray-400">-</span>
                            <input
                              type="number"
                              placeholder="最高"
                              value={moreFiltersDraft[maxKey as keyof typeof moreFiltersDraft]}
                              onChange={(e) =>
                                setMoreFiltersDraft((prev) => ({ ...prev, [maxKey]: e.target.value }))
                              }
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f]"
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
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e3a5f]"
                      />
                    ),
                  },
                ].map(({ key, label, summary, content }) => (
                  <div key={key} className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() =>
                        setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
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
                          <div className="px-4 pb-4 pt-1 border-t border-gray-100">{content}</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={resetMoreFilters}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  重置
                </button>
                <button
                  onClick={applyMoreFilters}
                  className="px-4 py-2 text-sm text-white bg-[#1e3a5f] hover:bg-[#162d4a] rounded-lg transition-colors"
                >
                  应用
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
