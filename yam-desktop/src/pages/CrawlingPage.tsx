import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Calendar, X, Cloud, Loader2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { TopNav } from '../components/TopNav';
import { runCrawl, getCrawlProgress, syncWorkspaceData, type CrawlProgress } from '../lib/db';

function getNowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

export function CrawlingPage() {
  const {
    crawlingProgress,
    setCrawlingProgress,
    updateCrawlingProgress,
    addCrawlingLog,
    setPage,
    crawlTarget,
    setCrawlTarget,
  } = useAppStore();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const lastSchoolRef = useRef<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize and start crawling
  useEffect(() => {
    if (!crawlTarget) {
      setPage('major-management');
      return;
    }

    setCrawlingProgress({
      major: crawlTarget.name,
      school: '准备中...',
      department: '',
      year: 2026,
      percent: 0,
      logs: [{ time: getNowTime(), message: '开始数据采集任务...' }],
      isPaused: false,
    });
    lastSchoolRef.current = '';

    runCrawl(crawlTarget.code).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addCrawlingLog(`启动采集失败：${msg}`);
    });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Poll progress
  useEffect(() => {
    if (!crawlTarget) return;

    intervalRef.current = setInterval(async () => {
      try {
        const p: CrawlProgress = await getCrawlProgress();
        const percent = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;

        updateCrawlingProgress({
          school: p.current_name || '准备中...',
          percent,
        });

        if (p.current_name && p.current_name !== lastSchoolRef.current) {
          lastSchoolRef.current = p.current_name;
          addCrawlingLog(`正在处理：${p.current_name} (${p.current}/${p.total})`);
        }

        if (p.error && p.error !== error) {
          setError(p.error);
          addCrawlingLog(`错误：${p.error}`);
        }

        if (p.done && !syncing) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          addCrawlingLog(`采集结束：成功 ${p.success} 所，失败 ${p.failed} 所，跳过 ${p.skipped} 所`);
          await handleSync();
        }
      } catch (err) {
        addCrawlingLog(`获取进度失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [crawlTarget, syncing, error]);

  // Auto scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [crawlingProgress?.logs]);

  const handleSync = async () => {
    if (!crawlTarget) return;
    setSyncing(true);
    addCrawlingLog('正在同步数据到工作区...');
    try {
      await syncWorkspaceData(crawlTarget.code);
      addCrawlingLog('数据同步完成，即将进入数据就绪页面');
      setTimeout(() => {
        setCrawlingProgress(null);
        setCrawlTarget(null);
        setPage('data-ready');
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addCrawlingLog(`同步失败：${msg}`);
      setSyncing(false);
    }
  };

  const handleCancel = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCrawlingProgress(null);
    setCrawlTarget(null);
    setPage('major-management');
  };

  const handleBackground = () => {
    setPage('data-ready');
  };

  const handleClearLogs = () => {
    if (crawlingProgress) {
      setCrawlingProgress({ ...crawlingProgress, logs: [] });
    }
  };

  if (!crawlTarget) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      <TopNav activeTab="crawling" />

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Current Major */}
        <h1 className="text-xl text-gray-700 mb-6">
          当前专业：<span className="text-[#1e3a5f] font-medium">{crawlingProgress?.major || crawlTarget.name}</span>
        </h1>

        {/* Current Info Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg px-6 py-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Building2 size={16} />
              当前学校
            </div>
            <div className="font-medium text-gray-900 truncate">{crawlingProgress?.school || '准备中...'}</div>
          </div>
          <div className="bg-gray-50 rounded-lg px-6 py-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              {syncing ? <Loader2 size={16} className="animate-spin" /> : <span className="w-4 h-4 rounded-full bg-[#1e3a5f]" />}
              当前状态
            </div>
            <div className="font-medium text-gray-900">
              {syncing ? '同步数据中' : crawlingProgress?.percent === 100 ? '采集完成' : '采集中'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg px-6 py-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Calendar size={16} />
              目标年份
            </div>
            <div className="font-medium text-gray-900">{crawlingProgress?.year || 2026}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-gray-50 rounded-lg px-6 py-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-gray-700">整体进度</span>
            <span className="text-gray-600">{crawlingProgress?.percent || 0}%</span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              animate={{ width: `${crawlingProgress?.percent || 0}%` }}
              transition={{ duration: 0.5 }}
              className="h-full bg-[#1e3a5f] rounded-full"
            />
          </div>
        </div>

        {/* Logs */}
        <div className="bg-gray-50 rounded-lg px-6 py-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-gray-700">采集日志</span>
            <button
              onClick={handleClearLogs}
              disabled={syncing}
              className="text-sm text-[#1e3a5f] hover:underline disabled:opacity-50"
            >
              清空日志
            </button>
          </div>
          <div
            ref={logContainerRef}
            className="h-64 overflow-y-auto font-mono text-sm bg-white rounded border border-gray-200 p-3"
          >
            {crawlingProgress?.logs.map((log, index) => (
              <div key={index} className="py-1">
                <span className="text-gray-500">[{log.time}]</span>
                <span className="ml-2 text-gray-700">{log.message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleBackground}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Cloud size={16} />
            后台运行
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCancel}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 text-red-500 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <X size={16} />
            取消
          </motion.button>
        </div>
      </div>
    </div>
  );
}
