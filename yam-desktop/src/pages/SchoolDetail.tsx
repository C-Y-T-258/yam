import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Award, BookOpen, Clock, Star, Square, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

interface Department {
  name: string;
  researchDirection: string;
  examSubjects: string[];
  years: YearData[];
}

interface YearData {
  year: number;
  enrollCount: number;
  minScore: number;
  politics: number;
  english: number;
  math: number;
  specialized: number;
}

interface SchoolDetailProps {
  schoolId: string;
  schoolName: string;
  onClose: () => void;
  onAddFavorite?: () => void;
  onAddCompare?: () => void;
}

const MOCK_DEPARTMENTS: Department[] = [
  {
    name: '计算机科学与技术学院',
    researchDirection: '机器学习与智能系统、计算机视觉与模式识别、自然语言处理、数据挖掘与推荐系统等。',
    examSubjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
    years: [
      { year: 2026, enrollCount: 28, minScore: 681, politics: 70, english: 70, math: 110, specialized: 120 },
      { year: 2025, enrollCount: 26, minScore: 672, politics: 68, english: 68, math: 105, specialized: 115 },
      { year: 2024, enrollCount: 24, minScore: 663, politics: 67, english: 67, math: 105, specialized: 114 },
      { year: 2023, enrollCount: 26, minScore: 654, politics: 65, english: 65, math: 100, specialized: 110 },
    ],
  },
  {
    name: '电子工程系',
    researchDirection: '通信与信息系统、信号与信息处理、电路与系统等。',
    examSubjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
    years: [
      { year: 2026, enrollCount: 24, minScore: 663, politics: 67, english: 67, math: 105, specialized: 114 },
    ],
  },
  {
    name: '自动化系',
    researchDirection: '控制理论与控制工程、模式识别与智能系统等。',
    examSubjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
    years: [
      { year: 2026, enrollCount: 22, minScore: 658, politics: 65, english: 65, math: 102, specialized: 112 },
    ],
  },
  {
    name: '软件学院',
    researchDirection: '软件工程理论与方法、软件工程技术等。',
    examSubjects: ['① 101 思想政治理论', '② 201 英语（一）', '③ 301 数学（一）', '④ 408 计算机学科专业基础'],
    years: [
      { year: 2026, enrollCount: 30, minScore: 655, politics: 65, english: 65, math: 100, specialized: 110 },
    ],
  },
];

export function SchoolDetail({ schoolId, schoolName, onClose, onAddFavorite, onAddCompare }: SchoolDetailProps) {
  const [expandedDeptIndex, setExpandedDeptIndex] = useState<number | null>(0);
  const [activeYear, setActiveYear] = useState<number>(2026);
  const [showHistorical, setShowHistorical] = useState(false);

  const toggleDepartment = (index: number) => {
    if (expandedDeptIndex === index) {
      setExpandedDeptIndex(null);
    } else {
      setExpandedDeptIndex(index);
      setActiveYear(2026);
      setShowHistorical(false);
    }
  };

  const expandedDept = expandedDeptIndex !== null ? MOCK_DEPARTMENTS[expandedDeptIndex] : null;
  const yearData = expandedDept?.years.find(y => y.year === activeYear) || expandedDept?.years[0];

  return (
    <div className="flex h-full">
      {/* Left Panel - School Info */}
      <div className="w-64 border-r border-gray-200 p-6 bg-white flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-6"
        >
          <ChevronLeft size={16} />
          <span className="text-sm">返回</span>
        </button>

        <h2 className="text-2xl font-bold text-gray-900 mb-6">{schoolName}</h2>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-gray-600">
            <MapPin size={18} className="text-gray-400" />
            <span>北京</span>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <Award size={18} className="text-gray-400" />
            <span>985 / 211 / 双一流</span>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <BookOpen size={18} className="text-gray-400" />
            <span>学费：8000 元/年</span>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <Clock size={18} className="text-gray-400" />
            <span>学制：3 年</span>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <Clock size={18} className="text-gray-400" />
            <span>更新时间：2025-05-20</span>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <button
            onClick={onAddFavorite}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Star size={16} />
            收藏
          </button>
          <button
            onClick={onAddCompare}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Square size={16} />
            加入比较
          </button>
        </div>
      </div>

      {/* Right Panel - Department Details */}
      <div className="flex-1 overflow-auto p-6">
        {MOCK_DEPARTMENTS.map((dept, index) => (
          <div key={index} className="mb-4">
            {/* Department Header */}
            <button
              onClick={() => toggleDepartment(index)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span className="font-medium text-gray-900">
                {expandedDeptIndex === index && <ChevronLeft size={16} className="inline mr-2" />}
                {expandedDeptIndex !== index && <ChevronRight size={16} className="inline mr-2" />}
                {dept.name}
              </span>
              {expandedDeptIndex === index && <ChevronUp size={16} className="text-gray-400" />}
            </button>

            {/* Department Content */}
            <AnimatePresence>
              {expandedDeptIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-6 border border-gray-200 border-t-0 rounded-b-lg">
                    {/* Research Direction */}
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-gray-500 mb-2">研究方向</h4>
                      <p className="text-gray-700">{dept.researchDirection}</p>
                    </div>

                    {/* Exam Subjects */}
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-gray-500 mb-2">考试科目</h4>
                      <div className="flex flex-wrap gap-2">
                        {dept.examSubjects.map((subject, i) => (
                          <span key={i} className="text-gray-600">{subject}</span>
                        ))}
                      </div>
                    </div>

                    {/* Year Tabs */}
                    <div className="flex items-center gap-4 mb-4 border-b border-gray-200">
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

                    {/* Year Data */}
                    {yearData && !showHistorical && (
                      <div className="space-y-2">
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-gray-500">招生人数</span>
                          <span className="text-gray-900">{yearData.enrollCount}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-gray-500">最低分</span>
                          <span className="text-gray-900 font-medium">{yearData.minScore}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-gray-500">政治</span>
                          <span className="text-gray-900">{yearData.politics}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-gray-500">英语</span>
                          <span className="text-gray-900">{yearData.english}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-gray-500">数学</span>
                          <span className="text-gray-900">{yearData.math}</span>
                        </div>
                        <div className="flex justify-between py-2">
                          <span className="text-gray-500">专业课</span>
                          <span className="text-gray-900">{yearData.specialized}</span>
                        </div>
                      </div>
                    )}

                    {/* Historical Analysis */}
                    {showHistorical && (
                      <div>
                        {/* Historical Table */}
                        <div className="mb-6">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left py-2 text-gray-500 font-medium">年份</th>
                                <th className="text-right py-2 text-gray-500 font-medium">招生人数</th>
                                <th className="text-right py-2 text-gray-500 font-medium">最低分</th>
                                <th className="text-right py-2 text-gray-500 font-medium">政治</th>
                                <th className="text-right py-2 text-gray-500 font-medium">英语</th>
                                <th className="text-right py-2 text-gray-500 font-medium">数学</th>
                                <th className="text-right py-2 text-gray-500 font-medium">专业课</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dept.years.map((y) => (
                                <tr key={y.year} className="border-b border-gray-100">
                                  <td className="py-2 text-gray-900">{y.year}</td>
                                  <td className="py-2 text-right text-gray-900">{y.enrollCount}</td>
                                  <td className="py-2 text-right text-gray-900 font-medium">{y.minScore}</td>
                                  <td className="py-2 text-right text-gray-900">{y.politics}</td>
                                  <td className="py-2 text-right text-gray-900">{y.english}</td>
                                  <td className="py-2 text-right text-gray-900">{y.math}</td>
                                  <td className="py-2 text-right text-gray-900">{y.specialized}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Charts */}
                        <div className="grid grid-cols-2 gap-6">
                          {/* Score Trend */}
                          <div className="border border-gray-200 rounded-lg p-4">
                            <h4 className="text-sm font-medium text-gray-700 mb-4">最低分趋势</h4>
                            <div className="h-40 flex items-end justify-between gap-2">
                              {[...dept.years].reverse().map((y) => (
                                <div key={y.year} className="flex flex-col items-center">
                                  <div
                                    className="w-12 bg-[#1e3a5f] rounded-t"
                                    style={{ height: `${((y.minScore - 600) / 100) * 120}px` }}
                                  />
                                  <span className="text-xs text-gray-500 mt-1">{y.year}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Enrollment Trend */}
                          <div className="border border-gray-200 rounded-lg p-4">
                            <h4 className="text-sm font-medium text-gray-700 mb-4">招生人数趋势</h4>
                            <div className="h-40 flex items-end justify-between gap-2">
                              {[...dept.years].reverse().map((y) => (
                                <div key={y.year} className="flex flex-col items-center">
                                  <div
                                    className="w-12 bg-[#1e3a5f] rounded-t"
                                    style={{ height: `${(y.enrollCount / 40) * 120}px` }}
                                  />
                                  <span className="text-xs text-gray-500 mt-1">{y.year}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
