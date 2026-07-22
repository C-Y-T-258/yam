import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Calendar, X, Cloud, Loader2, AlertCircle, Database } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { TopNav } from '../components/TopNav';
import { LoginRequiredModal } from '../components/LoginRequiredModal';
import {
  runCrawl,
  getCrawlProgress,
  syncWorkspaceData,
  fetchAvailableMajors,
  cancelCrawl,
  resetCrawl,
  loginYanzhao,
  type CrawlProgress,
} from '../lib/db';

type CrawlStatus = 'idle' | 'checking' | 'running' | 'done' | 'error' | 'cancelled' | 'no-target';

function getNowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

function isLoginError(message: string | null): boolean {
  if (!message) return false;
  return message.includes('登录') || message.toLowerCase().includes('loginrequired');
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
  const [status, setStatus] = useState<CrawlStatus>('idle');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const lastSchoolRef = useRef<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLaunchingRef = useRef<boolean>(false);

  const startCrawl = async () => {
    if (!crawlTarget) return;
    if (isLaunchingRef.current) return;
    isLaunchingRef.current = true;
    try {
      await resetCrawl();
      await runCrawl(crawlTarget.code);
      setStatus('running');
      addCrawlingLog(`启动采集任务：${crawlTarget.code}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addCrawlingLog(`启动采集失败：${msg}`);
      if (isLoginError(msg)) {
        setShowLoginModal(true);
      }
    }
  };

  // Initialize: check backend state and start crawling atomically
  useEffect(() => {
    if (!crawlTarget) {
      // crawlTarget 为 null 时，检查后端是否有正在进行的采集任务
      // 如果有，从 crawledMajors 恢复 crawlTarget 并继续显示进度
      // 如果没有，显示友好的空状态页面（而非静默重定向）
      getCrawlProgress()
        .then((p) => {
          if (p.running && p.major_code) {
            const major = crawledMajors.find((m) => m.code === p.major_code);
            if (major) {
              setCrawlTarget({ code: major.code, name: major.name });
              return; // crawlTarget 更新后 useEffect 会重新执行
            }
          }
          setStatus('no-target');
        })
        .catch(() => {
          setStatus('no-target');
        });
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
    setStatus('checking');

    getCrawlProgress()
      .then((p) => {
        if (p.running) {
          if (p.major_code === crawlTarget.code) {
            // 后端正在采集同一专业：直接恢复监听，不打印"检测到已有..."日志。
            // 这样切出 CrawlingPage 再切回不会出现冗余提示（ISSUE-021）。
            // 用户从 MajorSelectPage 选了正在采集的专业进入时，UI 也会直接显示进度条，符合直觉。
            setStatus('running');
          } else {
            const msg = `已有其他采集任务在运行（${p.major_code}）`;
            setStatus('error');
            setError(msg);
            addCrawlingLog(msg);
          }
          return;
        }

        if (p.done) {
          if (p.major_code === crawlTarget.code) {
            addCrawlingLog(`检测到上次采集已完成：成功 ${p.success} 所，失败 ${p.failed} 所，跳过 ${p.skipped} 所`);
            if (p.error) {
              setStatus('error');
              setError(p.error);
              addCrawlingLog(`上次采集错误：${p.error}`);
              if (isLoginError(p.error)) {
                setShowLoginModal(true);
              }
            } else if (p.success > 0) {
              addCrawlingLog('正在同步数据到工作区...');
              handleSync();
            } else {
              setStatus('error');
              setError('上次采集未取得数据，请取消后重新选择专业');
            }
          } else {
            // 不同专业：重置后启动新采集
            startCrawl();
          }
          return;
        }

        // 初始状态：启动新采集
        startCrawl();
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        addCrawlingLog(`检查采集状态失败：${msg}`);
        startCrawl();
      });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawlTarget]);

  // Poll progress when running
  useEffect(() => {
    if (!crawlTarget || status !== 'running') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(async () => {
      try {
        const p: CrawlProgress = await getCrawlProgress();
        const percent = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;

        let displaySchool = '准备中...';
        if (p.done) {
          displaySchool = p.error ? '采集已结束' : '采集完成';
        } else if (p.total > 0) {
          displaySchool = p.current_name || `进度 ${p.current}/${p.total}`;
        } else if (p.current_name) {
          displaySchool = p.current_name;
        } else if (p.running) {
          displaySchool = '正在获取院校列表...';
        }

        updateCrawlingProgress({
          school: displaySchool,
          percent,
        });

        // 不再为每个院校追加日志（阶段日志由 crawl-log 事件推送，避免 700+ 条冗余）
        // 仅跟踪 lastSchoolRef 用于"采集结束"时显示最后处理的学校
        if (p.current_name) {
          lastSchoolRef.current = p.current_name;
        }

        if (p.error && p.error !== error) {
          setError(p.error);
          addCrawlingLog(`错误：${p.error}`, 'error');
        }

        if (p.done) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          const successLevel = p.failed === 0 ? 'success' : (p.success > 0 ? 'info' : 'error');
          addCrawlingLog(`采集结束：成功 ${p.success} 所，失败 ${p.failed} 所，跳过 ${p.skipped} 所`, successLevel);
          if (p.error) {
            setStatus('error');
            setError(p.error);
            addCrawlingLog(`采集失败：${p.error}，专业未添加到管理列表`, 'error');
            if (isLoginError(p.error)) {
              setShowLoginModal(true);
            }
          } else if (p.success === 0) {
            const msg = '采集未取得任何数据，专业未添加到管理列表';
            setStatus('error');
            setError(msg);
            addCrawlingLog(msg, 'error');
          } else {
            await handleSync();
          }
        }
      } catch (err) {
        addCrawlingLog(`获取进度失败：${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawlTarget, status]);

  // 监听后端 crawl-log 事件（YAM_LOG 协议推送的阶段日志，ISSUE-029）
  useEffect(() => {
    if (!crawlTarget || status !== 'running') return;
    let unlisten: (() => void) | null = null;
    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<{ level: string; message: string }>('crawl-log', (event) => {
        const { level, message } = event.payload;
        const lvl = (['info', 'warn', 'success', 'error'].includes(level) ? level : 'info') as 'info' | 'warn' | 'success' | 'error';
        addCrawlingLog(message, lvl);
      });
    })();
    return () => {
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawlTarget, status]);

  // Auto scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [crawlingProgress?.logs]);

  const handleSync = async () => {
    if (!crawlTarget) return;
    setSyncing(true);
    setStatus('done');
    addCrawlingLog('正在同步数据到工作区...');
    try {
      await syncWorkspaceData(crawlTarget.code);
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
        addCrawlingLog(`同步完成，但专业 ${crawlTarget.code} 无数据，未添加到管理列表`);
        setStatus('error');
        setError('同步后无数据，请确认采集任务是否成功完成');
        setSyncing(false);
        return;
      }

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
      setStatus('error');
      setError(msg);
      setSyncing(false);
    }
  };

  const handleLogin = async () => {
    if (!crawlTarget) return;
    setIsLoggingIn(true);
    try {
      addCrawlingLog('正在打开研招网登录窗口...');
      const result = await loginYanzhao(crawlTarget.code);
      if (result.success) {
        addCrawlingLog(`登录成功，已抓取 ${result.school_count} 所院校种子`);
        setShowLoginModal(false);
        setError(null);
        isLaunchingRef.current = false;
        await startCrawl();
      } else {
        const msg = result.error || '登录失败';
        setError(msg);
        addCrawlingLog(`登录失败：${msg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addCrawlingLog(`登录异常：${msg}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleCancelLogin = () => {
    setShowLoginModal(false);
    setStatus('error');
    setError('已取消登录，采集未完成');
    addCrawlingLog('用户取消登录');
  };

  const handleCancel = async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    addCrawlingLog('正在取消采集任务...');
    try {
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
    // crawlTarget 为 null 且确认无活跃采集任务时，显示友好的空状态
    if (status === 'no-target') {
      return (
        <div className="min-h-screen bg-white">
          <TopNav activeTab="crawling" />
          <div className="max-w-4xl mx-auto px-6 py-8">
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Database size={48} className="text-gray-300 mb-4" />
              <h2 className="text-xl text-gray-700 mb-2">请先选择要采集的专业</h2>
              <p className="text-sm text-gray-500 mb-6">
                数据采集需要先指定目标专业。请前往专业管理页面选择已有专业进行更新，或添加新专业。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setPage('major-management')}
                  className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152d4a] transition-colors"
                >
                  去专业管理
                </button>
                <button
                  onClick={() => setPage('major-select')}
                  className="px-4 py-2 border border-[#1e3a5f] text-[#1e3a5f] text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
                >
                  添加新专业
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    // 正在检查后端是否有活跃采集任务
    return (
      <div className="min-h-screen bg-white">
        <TopNav activeTab="crawling" />
        <div className="max-w-4xl mx-auto px-6 py-8 flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[#1e3a5f]" />
          <span className="ml-2 text-gray-500">正在检查采集状态...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <TopNav activeTab="crawling" />

      <AnimatePresence>
        {showLoginModal && (
          <LoginRequiredModal
            majorCode={crawlTarget.code}
            onLogin={handleLogin}
            onCancel={handleCancelLogin}
            isLoggingIn={isLoggingIn}
          />
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Error Banner */}
        {error && (
          <div className={`mb-6 rounded-lg px-4 py-3 border ${isLoginError(error) ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-start gap-2">
              {isLoginError(error) ? <AlertCircle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" /> : <X size={18} className="text-red-500 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">
                <div className={`text-sm font-medium ${isLoginError(error) ? 'text-amber-700' : 'text-red-700'}`}>
                  {isLoginError(error) ? '需要登录' : '采集失败'}
                </div>
                <div className={`text-sm mt-1 ${isLoginError(error) ? 'text-amber-600' : 'text-red-600'}`}>
                  {error}
                </div>
              </div>
            </div>
          </div>
        )}

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
            {crawlingProgress?.logs.map((log, index) => {
              const levelColors: Record<string, string> = {
                info: 'text-gray-700',
                warn: 'text-amber-600',
                success: 'text-emerald-600',
                error: 'text-red-600',
              };
              const levelPrefix: Record<string, string> = {
                info: '',
                warn: '⚠ ',
                success: '✓ ',
                error: '✗ ',
              };
              const lvl = log.level || 'info';
              return (
                <div key={index} className={`py-1 ${levelColors[lvl]}`}>
                  <span className="text-gray-400">[{log.time}]</span>
                  <span className="ml-2">{levelPrefix[lvl]}{log.message}</span>
                </div>
              );
            })}
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
