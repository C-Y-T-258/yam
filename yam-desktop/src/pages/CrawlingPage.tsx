import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Calendar, X, Cloud, Loader2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { TopNav } from '../components/TopNav';
import { runCrawl, getCrawlProgress, syncWorkspaceData, fetchAvailableMajors, cancelCrawl, type CrawlProgress } from '../lib/db';

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
    updateMajor,
    addMajor,
    crawledMajors,
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

    // 先检查是否已有进行中的采集任务，避免重复启动
    getCrawlProgress()
      .then((p) => {
        if (p.running) {
          if (p.major_code === crawlTarget.code) {
            addCrawlingLog('检测到已有进行中的同专业采集任务，继续监听进度...');
          } else {
            const msg = `已有其他采集任务在运行（${p.major_code}）`;
            setError(msg);
            addCrawlingLog(msg);
          }
        } else if (p.done) {
          // 后端采集已结束（用户从"后台运行"回来，或残留状态）
          // 不自动重启采集，避免覆盖已完成的结果
          if (p.major_code === crawlTarget.code) {
            addCrawlingLog(`检测到上次采集已完成：成功 ${p.success} 所，失败 ${p.failed} 所，跳过 ${p.skipped} 所`);
            if (p.error) {
              setError(p.error);
              addCrawlingLog(`上次采集错误：${p.error}`);
            } else if (p.success > 0) {
              // 采集成功但尚未同步（用户从后台回来），自动同步并跳转
              addCrawlingLog('正在同步数据到工作区...');
              handleSync();
            } else {
              // 异常状态（success=0 且无 error），提示用户重新采集
              setError('上次采集未取得数据，请取消后重新选择专业');
            }
          } else {
            // 不同专业，启动新采集
            addCrawlingLog(`启动新采集任务：${crawlTarget.code}`);
            runCrawl(crawlTarget.code).catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              setError(msg);
              addCrawlingLog(`启动采集失败：${msg}`);
            });
          }
        } else {
          // 初始状态（done=false, running=false），启动新采集
          addCrawlingLog(`启动采集任务：${crawlTarget.code}`);
          runCrawl(crawlTarget.code).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            addCrawlingLog(`启动采集失败：${msg}`);
          });
        }
      })
      .catch((err) => {
        addCrawlingLog(`检查采集状态失败：${err instanceof Error ? err.message : String(err)}`);
        runCrawl(crawlTarget.code).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          addCrawlingLog(`启动采集失败：${msg}`);
        });
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

        // 根据后端状态显示更详细的进度信息
        let displaySchool = '准备中...';
        if (p.done) {
          displaySchool = p.error ? '采集已结束' : '采集完成';
        } else if (p.total > 0) {
          displaySchool = p.current_name || `进度 ${p.current}/${p.total}`;
        } else if (p.current_name) {
          // total=0 但有 current_name，说明 Python 正在输出（如获取院校列表）
          displaySchool = p.current_name;
        } else if (p.running) {
          displaySchool = '正在获取院校列表...';
        }

        updateCrawlingProgress({
          school: displaySchool,
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
          // ISSUE-011: 采集失败时不添加专业到管理列表
          if (p.error) {
            setError(p.error);
            addCrawlingLog(`采集失败：${p.error}，专业未添加到管理列表`);
          } else if (p.success === 0) {
            const msg = '采集未取得任何数据，专业未添加到管理列表';
            setError(msg);
            addCrawlingLog(msg);
          } else {
            await handleSync();
          }
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
      // ISSUE-011: 同步后检查实际数据量，无数据则不添加专业
      let schoolCount = 0;
      try {
        const available = await fetchAvailableMajors();
        const info = available.find((m) => m.major_code === crawlTarget.code);
        if (info) {
          schoolCount = info.school_count;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addCrawlingLog(`更新专业统计失败：${msg}`);
      }

      if (schoolCount === 0) {
        // 同步后仍无数据，不添加到管理列表
        addCrawlingLog(`同步完成，但专业 ${crawlTarget.code} 无数据，未添加到管理列表`);
        setError('同步后无数据，请确认采集任务是否成功完成');
        setSyncing(false);
        return;
      }

      // 有数据才添加到管理列表
      const exists = crawledMajors.some((m) => m.code === crawlTarget.code);
      if (!exists) {
        addMajor({
          code: crawlTarget.code,
          name: crawlTarget.name,
          dataVersion: '2026',
          lastUpdated: '刚刚',
          schoolCount,
          dbSize: '-',
        });
      } else {
        updateMajor(crawlTarget.code, {
          schoolCount,
          lastUpdated: '刚刚',
        });
      }
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

  const handleCancel = async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    addCrawlingLog('正在取消采集任务...');
    try {
      // 调用 Rust 端的 cancel_crawl，kill Python 子进程并重置 running 状态
      await cancelCrawl();
      addCrawlingLog('已取消采集任务');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addCrawlingLog(`取消失败：${msg}（前端状态仍会清除）`);
    }
    setCrawlingProgress(null);
    setCrawlTarget(null);
    setPage('major-management');
  };

  const handleBackground = () => {
    // 后台运行：不取消采集任务，仅返回工作区页面
    // 采集任务在 Rust 端继续执行，用户回到本页时仍可看到进度
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
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
