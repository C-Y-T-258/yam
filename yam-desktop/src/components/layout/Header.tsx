import { Search, Download, BarChart2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface HeaderProps {
  majorCode: string
}

export function Header({ majorCode }: HeaderProps) {
  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4">
      {/* Left: Search */}
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索院校..."
            className={cn(
              'w-full pl-10 pr-4 py-2 rounded-lg',
              'bg-background border border-border',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'transition-all duration-200'
            )}
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg',
            'text-sm text-muted-foreground',
            'hover:bg-accent hover:text-accent-foreground',
            'transition-colors duration-150'
          )}
        >
          <BarChart2 className="w-4 h-4" />
          <span>统计</span>
        </button>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg',
            'text-sm text-primary',
            'bg-primary/10 hover:bg-primary/20',
            'transition-colors duration-150'
          )}
        >
          <Download className="w-4 h-4" />
          <span>导出</span>
        </button>
      </div>
    </header>
  )
}
