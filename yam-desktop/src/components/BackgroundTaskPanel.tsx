import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { getCrawlProgress, type CrawlProgress } from '../lib/db';

/**
 * 后台任务面板：固定在左下角，显示当前后台采集任务的状态。
 * 用户离开采集页面后仍可在任意页面看到进度，点击可跳转到采集页。
 */
export function BackgroundTaskPanel() {
  const { setPage, crawlTarget } = useAppStore();
  const [progress, setProgress] = useState<CrawlProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const p = await getCrawlProgress();
        if (active) {
          setProgress(p);
          // 如果任务结束（done=true），3 秒后自动隐藏
          if (p.done) {
            setTimeout(() => active && setProgress(null), 3000);
          }
        }
      } catch {
        // 忽略错误
      }
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // 不显示面板的条件：无进度信息 / 非运行中 / 已隐藏
  if (!progress || dismissed) return null;
  // 只在有采集任务时显示（running=true 或 done 但有 error）
  if (!progress.running && !progress.done) return null;
  // 如果采集已完成且无错误，不显示（正常流程会自动跳转）
  if (progress.done && !progress.error && progress.success > 0) return null;

  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const majorName = crawlTarget?.name || progress.major_code || '未知专业';

  const handleJumpToCrawling = () => {
    setPage('crawling');
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={handleJumpToCrawling}
        className="fixed bottom-4 left-4 z-40 w-72 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <Activity size={12} className={progress.running ? 'text-blue-500 animate-pulse' : 'text-gray-400'} />
            {progress.running ? '后台采集任务' : '采集任务已结束'}
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="隐藏"
          >
            <X size={12} />
          </button>
        </div>

        {/* Content */}
        <div className="px-3 py-2.5">
          {/* Major name */}
          <div className="text-sm font-medium text-gray-800 truncate mb-1.5">{majorName}</div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1.5">
            <motion.div
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.4 }}
              className={`h-full rounded-full ${progress.error ? 'bg-red-400' : 'bg-blue-500'}`}
            />
          </div>

          {/* Status text */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {progress.running ? (
                progress.total > 0
                  ? `${progress.current} / ${progress.total} 所`
                  : progress.current_name || '准备中...'
              ) : progress.error ? (
                <span className="text-red-500 truncate">{progress.error}</span>
              ) : (
                `完成：${progress.success} 所`
              )}
            </span>
            <span>{percent}%</span>
          </div>

          {/* Current school (only when running) */}
          {progress.running && progress.current_name && progress.total > 0 && (
            <div className="mt-1.5 text-xs text-gray-400 truncate">
              正在处理：{progress.current_name}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
