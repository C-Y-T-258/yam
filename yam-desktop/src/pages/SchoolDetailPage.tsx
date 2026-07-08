import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Star, MapPin, Building2, BookOpen, Users } from 'lucide-react'
import { cn } from '../lib/utils'
import type { School, SchoolDetail, Department, ScoreLine } from '../../shared/types'

interface SchoolDetailPageProps {
  school: School
  majorCode: string
  onBack: () => void
}

export function SchoolDetailPage({ school, majorCode, onBack }: SchoolDetailPageProps) {
  const [detail, setDetail] = useState<SchoolDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'departments' | 'scores' | 'plans'>('departments')
  const [isFavorite, setIsFavorite] = useState(school.is_favorite || false)

  useEffect(() => {
    loadDetail()
  }, [school.school_id, majorCode])

  const loadDetail = async () => {
    setLoading(true)
    try {
      // In development, use mock data
      const mockDetail: SchoolDetail = {
        school,
        departments: [
          {
            id: 1,
            department_id: 'dept1',
            school_id: school.school_id,
            major_code: majorCode,
            name: '计算机科学与技术学院',
            research_direction: '人工智能',
            enrollment_count: 50,
            enrollment_text: '全日制',
            exam_subjects: '["政治","英语一","数学一","计算机专业基础"]',
            exam_type: '学术型',
            advisor: null,
            source: 'yanzhao',
            updated_at: '2026-01-15',
          },
          {
            id: 2,
            department_id: 'dept2',
            school_id: school.school_id,
            major_code: majorCode,
            name: '软件学院',
            research_direction: '软件工程',
            enrollment_count: 80,
            enrollment_text: '全日制',
            exam_subjects: '["政治","英语二","数学二","软件工程基础"]',
            exam_type: '专业型',
            advisor: null,
            source: 'yanzhao',
            updated_at: '2026-01-15',
          },
        ],
        score_lines: [
          {
            school_id: school.school_id,
            department_id: 'dept1',
            major_code: majorCode,
            year: 2026,
            total: 350,
            politics: 55,
            english: 55,
            special_one: 85,
            special_two: 85,
            note: null,
            source: 'yanzhao',
            updated_at: '2026-01-15',
          },
          {
            school_id: school.school_id,
            department_id: 'dept1',
            major_code: majorCode,
            year: 2025,
            total: 345,
            politics: 50,
            english: 50,
            special_one: 80,
            special_two: 80,
            note: null,
            source: 'yanzhao',
            updated_at: '2025-01-15',
          },
        ],
        admission_plans: [],
      }

      // TODO: Replace with actual API call
      // const data = await window.api.getSchoolDetail(school.school_id, majorCode)
      // setDetail(data)
      
      setDetail(mockDetail)
    } catch (error) {
      console.error('Failed to load school detail:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFavoriteToggle = async () => {
    try {
      // TODO: Implement with actual API
      // if (isFavorite) {
      //   await window.api.removeFavorite(school.school_id, majorCode)
      // } else {
      //   await window.api.addFavorite(school.school_id, majorCode)
      // }
      setIsFavorite(!isFavorite)
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }

  const tabs = [
    { id: 'departments' as const, label: '院系信息', icon: Building2 },
    { id: 'scores' as const, label: '分数线', icon: BookOpen },
    { id: 'plans' as const, label: '招生计划', icon: Users },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p>未找到院校信息</p>
        <button onClick={onBack} className="mt-2 text-primary hover:underline">
          返回列表
        </button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="h-full overflow-auto"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className={cn(
                'p-2 rounded-lg',
                'text-muted-foreground',
                'hover:bg-accent hover:text-accent-foreground',
                'transition-colors duration-150'
              )}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{school.name}</h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {school.province || '未知'}
                </span>
                {school.level && (
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {school.level}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleFavoriteToggle}
            className={cn(
              'p-2 rounded-lg',
              'transition-colors duration-150',
              isFavorite
                ? 'text-yellow-500 hover:text-yellow-600'
                : 'text-muted-foreground hover:text-yellow-500'
            )}
          >
            <Star
              className="w-6 h-6"
              fill={isFavorite ? 'currentColor' : 'none'}
            />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-t-lg',
                'text-sm font-medium',
                'transition-colors duration-150',
                activeTab === tab.id
                  ? 'bg-background text-foreground border border-border border-b-transparent -mb-px'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'departments' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {detail.departments.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                暂无院系信息
              </div>
            ) : (
              detail.departments.map((dept) => (
                <DepartmentCard key={dept.id} department={dept} />
              ))
            )}
          </motion.div>
        )}

        {activeTab === 'scores' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {detail.score_lines.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                暂无分数线信息
              </div>
            ) : (
              <ScoreTable scores={detail.score_lines} />
            )}
          </motion.div>
        )}

        {activeTab === 'plans' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-muted-foreground py-8"
          >
            暂无招生计划信息
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

function DepartmentCard({ department }: { department: Department }) {
  let examSubjects: string[] = []
  try {
    examSubjects = JSON.parse(department.exam_subjects || '[]')
  } catch {}

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'p-5 rounded-xl',
        'bg-card border border-border',
        'hover:shadow-md transition-shadow duration-200'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{department.name}</h3>
          {department.research_direction && (
            <p className="text-sm text-muted-foreground mt-1">
              研究方向: {department.research_direction}
            </p>
          )}
        </div>
        {department.enrollment_count && (
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{department.enrollment_count}</div>
            <div className="text-xs text-muted-foreground">招生人数</div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {department.exam_type && (
          <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
            {department.exam_type}
          </span>
        )}
        {department.enrollment_text && (
          <span className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs">
            {department.enrollment_text}
          </span>
        )}
      </div>

      {examSubjects.length > 0 && (
        <div>
          <div className="text-sm font-medium text-foreground mb-2">考试科目</div>
          <div className="flex flex-wrap gap-1.5">
            {examSubjects.map((subject, i) => (
              <span
                key={i}
                className="px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs"
              >
                {subject}
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

function ScoreTable({ scores }: { scores: ScoreLine[] }) {
  return (
    <div className={cn(
      'rounded-xl border border-border overflow-hidden',
      'bg-card'
    )}>
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium text-foreground">年份</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-foreground">总分</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-foreground">政治</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-foreground">英语</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-foreground">专业一</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-foreground">专业二</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((score, index) => (
            <motion.tr
              key={`${score.year}-${score.department_id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.05 }}
              className="border-t border-border hover:bg-muted/30 transition-colors"
            >
              <td className="px-4 py-3 text-sm text-foreground font-medium">{score.year}</td>
              <td className="px-4 py-3 text-sm text-foreground font-bold text-primary">
                {score.total || '-'}
              </td>
              <td className="px-4 py-3 text-sm text-foreground">{score.politics || '-'}</td>
              <td className="px-4 py-3 text-sm text-foreground">{score.english || '-'}</td>
              <td className="px-4 py-3 text-sm text-foreground">{score.special_one || '-'}</td>
              <td className="px-4 py-3 text-sm text-foreground">{score.special_two || '-'}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
