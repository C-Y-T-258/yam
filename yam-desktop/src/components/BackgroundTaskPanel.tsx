import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
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
  // 用于触发"最后更新"时间显示
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  // 记录开始时间用于显示已用时
  const startTimeRef = useRef<number | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const p = await getCrawlProgress();
        if (!active) return;
        setProgress(p);
        setLastUpdate(new Date());
        // 记录任务开始时间
        if (p.running && startTimeRef.current === null) {
          startTimeRef.current = Date.now();
        }
        // 任务结束（done=true）后 8 秒自动隐藏（仅当无错误时）
        if (p.done && !p.error && p.success > 0) {
          setTimeout(() => active && setProgress(null), 8000);
        }
      } catch {
        // 忽略错误
      }
    };
    poll();
    const interval = setInterval(poll, 1500);
    // 每秒刷新一次"已用时"显示
    const tickInterval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => {
      active = false;
      clearInterval(interval);
      clearInterval(tickInterval);
    };
  }, []);

  // 不显示面板的条件：无进度信息 / 已隐藏
  if (!progress || dismissed) return null;
  // 只在有采集任务时显示（running=true 或 done 但有 error）
  if (!progress.running && !progress.done) return null;
  // 如果采集已完成且无错误，不显示（正常流程会自动跳转）
  if (progress.done && !progress.error && progress.success > 0) return null;

  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const majorName = crawlTarget?.name || '未知专业';
  const majorCode = progress.major_code || crawlTarget?.code || '';

  // 已用时计算
  const elapsedMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const elapsedStr = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}`;

  // 状态判断
  const isError = !!progress.error;
  const isRunning = progress.running;
  const isDoneNoData = progress.done && !progress.error && progress.success === 0;

  // 头部样式
  const headerBg = isError
    ? 'bg-red-50 border-red-100'
    : isRunning
      ? 'bg-blue-50 border-blue-100'
      : 'bg-amber-50 border-amber-100';
  const headerText = isError ? 'text-red-600' : isRunning ? 'text-blue-600' : 'text-amber-600';

  // 状态文本
  let statusText: string;
  if (isRunning) {
    if (progress.total > 0) {
      statusText = `${progress.current} / ${progress.total} 所`;
    } else if (progress.current_name) {
      statusText = progress.current_name;
    } else {
      statusText = '正在获取院校列表...';
    }
  } else if (isError) {
    statusText = progress.error!.length > 30 ? progress.error!.slice(0, 30) + '...' : progress.error!;
  } else if (isDoneNoData) {
    statusText = '采集未取得数据';
  } else {
    statusText = `完成：${progress.success} 所`;
  }

  const handleJumpToCrawling = () => {
    setPage('crawling');
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
  };

  // 最后更新时间显示
  const lastUpdateStr = lastUpdate
    ? `${String(lastUpdate.getHours()).padStart(2, '0')}:${String(lastUpdate.getMinutes()).padStart(2, '0')}:${String(lastUpdate.getSeconds()).padStart(2, '0')}`
    : '--:--:--';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={handleJumpToCrawling}
        className="fixed bottom-4 left-4 z-40 w-80 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-3 py-2 border-b ${headerBg}`}>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${headerText}`}>
            {isRunning ? (
              <Loader2 size={12} className="animate-spin" />
            ) : isError ? (
              <AlertCircle size={12} />
            ) : (
              <CheckCircle2 size={12} />
            )}
            {isRunning ? '后台采集任务' : isError ? '采集任务出错' : '采集任务已结束'}
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
          {/* Major name + code */}
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-sm font-medium text-gray-800 truncate">{majorName}</span>
            {majorCode && (
              <span className="text-xs text-gray-400 font-mono flex-shrink-0">{majorCode}</span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1.5">
            <motion.div
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.4 }}
              className={`h-full rounded-full ${isError ? 'bg-red-400' : isRunning ? 'bg-blue-500' : 'bg-amber-400'}`}
            />
          </div>

          {/* Status row */}
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span className={isError ? 'text-red-500' : ''}>{statusText}</span>
            <span className="font-medium">{percent}%</span>
          </div>

          {/* Counts (only when total > 0 or done) */}
          {(progress.total > 0 || progress.done) && (
            <div className="flex items-center gap-3 text-[11px] text-gray-500 mb-1">
              <span className="text-green-600">✓ {progress.success}</span>
              <span className="text-red-500">✗ {progress.failed}</span>
              {progress.skipped > 0 && <span className="text-gray-400">↷ {progress.skipped}</span>}
            </div>
          )}

          {/* Current school (only when running) */}
          {isRunning && progress.current_name && progress.total > 0 && (
            <div className="mt-1 text-xs text-gray-400 truncate">
              正在处理：{progress.current_name}
            </div>
          )}

          {/* Footer: elapsed time + last update */}
          <div className="mt-2 pt-1.5 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
            <span>
              {isRunning ? `已用时 ${elapsedStr}` : `更新于 ${lastUpdateStr}`}
            </span>
            <span className="text-blue-500">点击查看 →</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
