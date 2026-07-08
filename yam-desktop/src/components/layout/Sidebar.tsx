import { motion } from 'framer-motion'
import { 
  School, 
  Star, 
  Settings, 
  Moon, 
  Sun,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useState } from 'react'

interface SidebarProps {
  majorCode: string
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function Sidebar({ majorCode, collapsed = false, onToggleCollapse }: SidebarProps) {
  const [isDarkMode, setIsDarkMode] = useState(false)

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
    document.documentElement.classList.toggle('dark')
  }

  const menuItems = [
    { icon: School, label: '院校列表', active: true },
    { icon: Star, label: '我的收藏', active: false },
    { icon: Settings, label: '设置', active: false },
  ]

  return (
    <motion.aside
      initial={{ width: collapsed ? 64 : 240 }}
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className={cn(
        'h-full bg-card border-r border-border flex flex-col',
        'transition-colors duration-200'
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        <motion.div
          className="flex items-center gap-2 overflow-hidden"
          animate={{ opacity: 1 }}
        >
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">Y</span>
          </div>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="font-semibold text-foreground whitespace-nowrap"
            >
              研喵 YAM
            </motion.span>
          )}
        </motion.div>
      </div>

      {/* Major Code Badge */}
      {!collapsed && (
        <div className="px-4 py-3">
          <div className="text-xs text-muted-foreground">当前专业</div>
          <div className="text-sm font-medium text-foreground">{majorCode}</div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.label}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg',
              'transition-colors duration-150',
              item.active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && (
              <span className="whitespace-nowrap">{item.label}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="px-2 py-2 border-t border-border space-y-1">
        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg',
            'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            'transition-colors duration-150'
          )}
        >
          {isDarkMode ? (
            <Sun className="w-5 h-5 flex-shrink-0" />
          ) : (
            <Moon className="w-5 h-5 flex-shrink-0" />
          )}
          {!collapsed && (
            <span className="whitespace-nowrap">
              {isDarkMode ? '亮色模式' : '暗色模式'}
            </span>
          )}
        </button>

        {/* Collapse Toggle */}
        <button
          onClick={onToggleCollapse}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg',
            'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            'transition-colors duration-150'
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5 flex-shrink-0" />
          ) : (
            <ChevronLeft className="w-5 h-5 flex-shrink-0" />
          )}
          {!collapsed && (
            <span className="whitespace-nowrap">收起侧边栏</span>
          )}
        </button>
      </div>
    </motion.aside>
  )
}
