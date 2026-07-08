import { motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { FilterParams } from '../../../shared/types'

interface FilterPanelProps {
  majorCode: string
  filters: FilterParams
  onFilterChange: (filters: FilterParams) => void
}

export function FilterPanel({ majorCode, filters, onFilterChange }: FilterPanelProps) {
  const levels = [
    { value: '985', label: '985' },
    { value: '211', label: '211' },
    { value: '一流', label: '双一流' },
    { value: '普通', label: '普通本科' },
  ]

  const provinces = [
    '北京', '上海', '江苏', '浙江', '广东', '湖北', '四川', '陕西',
    '辽宁', '山东', '天津', '重庆', '湖南', '福建', '安徽', '吉林',
    '黑龙江', '甘肃', '山西', '河南', '河北', '云南', '贵州', '广西',
  ]

  const handleLevelChange = (level: string, checked: boolean) => {
    const currentLevels = filters.levels || []
    const newLevels = checked
      ? [...currentLevels, level]
      : currentLevels.filter(l => l !== level)
    onFilterChange({ ...filters, levels: newLevels })
  }

  const handleProvinceChange = (province: string, checked: boolean) => {
    const currentProvinces = filters.provinces || []
    const newProvinces = checked
      ? [...currentProvinces, province]
      : currentProvinces.filter(p => p !== province)
    onFilterChange({ ...filters, provinces: newProvinces })
  }

  const handleReset = () => {
    onFilterChange({
      keyword: '',
      levels: [],
      provinces: [],
      favorites_only: false,
    })
  }

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 260, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="h-full border-r border-border bg-card overflow-hidden"
    >
      <div className="w-[260px] h-full p-4 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">筛选</h2>
          <button
            onClick={handleReset}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md',
              'text-xs text-muted-foreground',
              'hover:bg-accent hover:text-accent-foreground',
              'transition-colors duration-150'
            )}
          >
            <RotateCcw className="w-3 h-3" />
            重置
          </button>
        </div>

        {/* Favorites Only */}
        <div className="mb-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.favorites_only || false}
              onChange={(e) => onFilterChange({ ...filters, favorites_only: e.target.checked })}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-foreground">只显示收藏</span>
          </label>
        </div>

        {/* Levels */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-foreground mb-3">学校层次</h3>
          <div className="space-y-2">
            {levels.map((level) => (
              <label
                key={level.value}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={filters.levels?.includes(level.value) || false}
                  onChange={(e) => handleLevelChange(level.value, e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-foreground">{level.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Provinces */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-foreground mb-3">所在地区</h3>
          <div className="flex flex-wrap gap-1.5">
            {provinces.map((province) => (
              <button
                key={province}
                onClick={() => handleProvinceChange(province, !filters.provinces?.includes(province))}
                className={cn(
                  'px-2 py-1 rounded-md text-xs',
                  'transition-colors duration-150',
                  filters.provinces?.includes(province)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                )}
              >
                {province}
              </button>
            ))}
          </div>
        </div>

        {/* Current Major */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-foreground mb-3">专业</h3>
          <div className="text-sm text-muted-foreground">
            当前: {majorCode}
          </div>
        </div>

        {/* Sort */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-foreground mb-3">排序方式</h3>
          <select
            value={filters.sort || 'name'}
            onChange={(e) => onFilterChange({ ...filters, sort: e.target.value as any })}
            className={cn(
              'w-full px-3 py-2 rounded-lg',
              'bg-background border border-border',
              'text-sm text-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring',
              'transition-colors duration-150'
            )}
          >
            <option value="name">按名称</option>
            <option value="province">按省份</option>
            <option value="level">按层次</option>
          </select>
        </div>
      </div>
    </motion.aside>
  )
}
