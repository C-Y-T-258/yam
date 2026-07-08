import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { SchoolCard } from '../components/schools/SchoolCard'
import { FilterPanel } from '../components/schools/FilterPanel'
import type { School, FilterParams } from '../../shared/types'

interface SchoolsPageProps {
  majorCode: string
  onSchoolSelect: (school: School) => void
}

export function SchoolsPage({ majorCode, onSchoolSelect }: SchoolsPageProps) {
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterParams>({})
  const [showFilters, setShowFilters] = useState(true)

  useEffect(() => {
    loadSchools()
  }, [majorCode, filters])

  const loadSchools = async () => {
    setLoading(true)
    try {
      // In development, use mock data
      const mockSchools: School[] = [
        { school_id: '1', name: '清华大学', province: '北京', level: '985', major_code: majorCode, is_favorite: false },
        { school_id: '2', name: '北京大学', province: '北京', level: '985', major_code: majorCode, is_favorite: true },
        { school_id: '3', name: '浙江大学', province: '浙江', level: '985', major_code: majorCode, is_favorite: false },
        { school_id: '4', name: '复旦大学', province: '上海', level: '985', major_code: majorCode, is_favorite: false },
        { school_id: '5', name: '上海交通大学', province: '上海', level: '985', major_code: majorCode, is_favorite: true },
        { school_id: '6', name: '南京大学', province: '江苏', level: '985', major_code: majorCode, is_favorite: false },
        { school_id: '7', name: '中国科学技术大学', province: '安徽', level: '985', major_code: majorCode, is_favorite: false },
        { school_id: '8', name: '武汉大学', province: '湖北', level: '985', major_code: majorCode, is_favorite: false },
        { school_id: '9', name: '华中科技大学', province: '湖北', level: '985', major_code: majorCode, is_favorite: false },
        { school_id: '10', name: '中山大学', province: '广东', level: '985', major_code: majorCode, is_favorite: false },
      ]
      
      // TODO: Replace with actual API call
      // const data = await window.api.getSchools(majorCode, filters)
      // setSchools(data)
      
      // Apply mock filters
      let filtered = mockSchools
      if (filters.keyword) {
        filtered = filtered.filter(s => s.name.includes(filters.keyword!))
      }
      if (filters.levels && filters.levels.length > 0) {
        filtered = filtered.filter(s => 
          s.level && filters.levels!.some(l => s.level!.includes(l))
        )
      }
      if (filters.favorites_only) {
        filtered = filtered.filter(s => s.is_favorite)
      }
      
      setSchools(filtered)
    } catch (error) {
      console.error('Failed to load schools:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (newFilters: FilterParams) => {
    setFilters(newFilters)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex h-full"
    >
      {/* Filter Panel */}
      {showFilters && (
        <FilterPanel
          majorCode={majorCode}
          filters={filters}
          onFilterChange={handleFilterChange}
        />
      )}

      {/* Schools Grid */}
      <div className="flex-1 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">院校列表</h1>
            <p className="text-sm text-muted-foreground">
              共 {schools.length} 所院校
            </p>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-sm text-primary hover:underline"
          >
            {showFilters ? '隐藏筛选' : '显示筛选'}
          </button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-48 rounded-lg bg-muted animate-pulse"
              />
            ))}
          </div>
        ) : schools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p className="text-lg">没有找到符合条件的院校</p>
            <p className="text-sm">请调整筛选条件</p>
          </div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {schools.map((school, index) => (
              <SchoolCard
                key={school.school_id}
                school={school}
                index={index}
                onSelect={onSchoolSelect}
              />
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
