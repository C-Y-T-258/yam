import { motion } from 'framer-motion'
import { Star, MapPin, Building2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { School } from '../../../shared/types'

interface SchoolCardProps {
  school: School
  index: number
  onSelect: (school: School) => void
}

export function SchoolCard({ school, index, onSelect }: SchoolCardProps) {
  const handleFavoriteToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    // TODO: Implement favorite toggle
    console.log('Toggle favorite:', school.school_id)
  }

  const getLevelBadge = (level: string | null) => {
    if (!level) return null
    
    const badges = []
    if (level.includes('985')) badges.push({ text: '985', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' })
    if (level.includes('211')) badges.push({ text: '211', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' })
    if (level.includes('一流')) badges.push({ text: '双一流', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' })
    
    return badges
  }

  const badges = getLevelBadge(school.level)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ 
        duration: 0.3,
        delay: index * 0.05,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(school)}
      className={cn(
        'relative p-5 rounded-xl cursor-pointer',
        'bg-card border border-border',
        'hover:shadow-lg hover:border-primary/50',
        'transition-all duration-200',
        'group'
      )}
    >
      {/* Favorite Button */}
      <button
        onClick={handleFavoriteToggle}
        className={cn(
          'absolute top-4 right-4 p-1.5 rounded-full',
          'transition-colors duration-150',
          school.is_favorite
            ? 'text-yellow-500 hover:text-yellow-600'
            : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-yellow-500'
        )}
      >
        <Star
          className="w-5 h-5"
          fill={school.is_favorite ? 'currentColor' : 'none'}
        />
      </button>

      {/* School Name */}
      <h3 className="text-lg font-semibold text-foreground pr-8 mb-2 line-clamp-1">
        {school.name}
      </h3>

      {/* Location */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
        <MapPin className="w-4 h-4" />
        <span>{school.province || '未知'}</span>
      </div>

      {/* Level Badges */}
      {badges && badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge.text}
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                badge.color
              )}
            >
              {badge.text}
            </span>
          ))}
        </div>
      )}

      {/* Hover Indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-200 rounded-b-xl" />
    </motion.div>
  )
}
