import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Calendar, X, Cloud, Loader2, AlertCircle, Database, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { TopNav } from '../components/TopNav';
import { LoginRequiredModal } from '../components/LoginRequiredModal';
import { getCrawlStatusLabel } from '../lib/workspace-utils';
import {
  runCrawl,
  getCrawlProgress,
  fetchAvailableMajors,
  cancelCrawl,
  checkLoginStatus,
  loginYanzhao,
  getCrawlErrorPresentation,
  normalizeAppError,
  type CrawlProgress,
} from '../lib/db';

type PageCrawlStatus = 'idle' | 'checking' | 'running' | 'syncing' | 'completed' | 'failed' | 'cancelled' | 'no-target';

function getNowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

function isLoginError(message: string | null): boolean {
  if (!message) return false;
  return message.includes('登录') || message.toLowerCase().includes('loginrequired');
}

/// 从最新日志解析当前采集阶段（第一轮 / 第二轮 / 第三轮 / 阶段 2 分数线 / 限流冷却 / 同步中 / 完成）
function detectStage(logs: Array<{ message: string; level?: string }> | undefined): { label: string; kind: 'idle' | 'round1' | 'round2' | 'round3' | 'cooldown' | 'scores' | 'syncing' | 'done' | 'error' } {
  if (!logs || logs.length === 0) return { label: '准备中', kind: 'idle' };
  // 从后往前找最近一条阶段日志
  for (let i = logs.length - 1; i >= 0; i--) {
    const msg = logs[i].message;
    if (msg.includes('采集结束') || msg.includes('采集失败')) return { label: '采集完成', kind: 'done' };
    if (msg.includes('同步数据') || msg.includes('同步完成') || msg.includes('同步失败')) return { label: '同步数据中', kind: 'syncing' };
    if (msg.includes('阶段 2') || msg.includes('分数线')) return { label: '阶段 2/2 · 分数线采集', kind: 'scores' };
    if (msg.includes('等待') && msg.includes('冷却')) {
      // 区分第几轮冷却
      if (msg.includes('第二轮')) return { label: '限流冷却 · 等待第二轮', kind: 'cooldown' };
      if (msg.includes('第三轮')) return { label: '限流冷却 · 等待第三轮', kind: 'cooldown' };
      return { label: '限流冷却中', kind: 'cooldown' };
    }
    if (msg.includes('第三轮')) return { label: '第三轮 · 1 并发兜底', kind: 'round3' };
    if (msg.includes('第二轮')) return { label: '第二轮 · 3 并发保守', kind: 'round2' };
    if (msg.includes('第一轮')) return { label: '第一轮 · 15 并发快速', kind: 'round1' };
    if (msg.includes('启动采集')) return { label: '启动中', kind: 'idle' };
  }
  return { label: '准备中', kind: 'idle' };
}

/// 格式化耗时（秒 → M:SS 或 H:MM:SS）
function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
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
    setSelectedMajorCodes,
  } = useAppStore();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<PageCrawlStatus>('idle');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const lastSchoolRef = useRef<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLaunchingRef = useRef<boolean>(false);
  const isFinalizingRef = useRef<boolean>(false);
  // ISSUE-029 日志细节优化：已耗时显示 + 折叠日志面板 + 复制日志
  const startTimeRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [logsCollapsed, setLogsCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const startCrawl = async () => {
    if (!crawlTarget) return;
    if (isLaunchingRef.current) return;
    isLaunchingRef.current = true;
    try {
      const loginStatus = await checkLoginStatus();
      if (!loginStatus.logged_in) {
        isLaunchingRef.current = false;
        setStatus('checking');
        setErrorCode('LOGIN_REQUIRED');
        setError('未检测到有效登录凭证');
        setShowLoginModal(true);
        addCrawlingLog('未检测到有效登录凭证，请先登录研招网');
        return;
      }

      await runCrawl(crawlTarget.code, crawlTarget.force === true);
      setErrorCode(null);
      setError(null);
      setStatus('running');
      if (crawlTarget.force) {
        setCrawlTarget({ ...crawlTarget, force: false });
      }
      startTimeRef.current = Date.now();
      setElapsed(0);
      addCrawlingLog(`启动采集任务：${crawlTarget.code}`);
    } catch (err) {
      isLaunchingRef.current = false;
      const appError = normalizeAppError(err, '启动采集失败');
      setStatus('failed');
      setErrorCode(appError.code === 'UNKNOWN' ? null : appError.code);
      setError(appError.message);
      addCrawlingLog(`启动采集失败：${appError.message}`);
      if (appError.code === 'LOGIN_REQUIRED' || (appError.code === 'UNKNOWN' && isLoginError(appError.message))) {
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
          if (p.status === 'running' && p.major_code) {
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
    setErrorCode(null);
    setError(null);
    setStatus('checking');

    getCrawlProgress()
      .then((p) => {
        if (p.status === 'running') {
          if (p.major_code === crawlTarget.code) {
            // 后端正在采集同一专业：直接恢复监听，不打印"检测到已有..."日志。
            // 这样切出 CrawlingPage 再切回不会出现冗余提示（ISSUE-021）。
            // 用户从 MajorSelectPage 选了正在采集的专业进入时，UI 也会直接显示进度条，符合直觉。
            setStatus('running');
          } else {
            const msg = `已有其他采集任务在运行（${p.major_code}）`;
            setStatus('failed');
            setError(msg);
            addCrawlingLog(msg);
          }
          return;
        }

        if (p.status === 'completed' || p.status === 'failed' || p.status === 'cancelled') {
          if (p.major_code === crawlTarget.code) {
            addCrawlingLog(`检测到上次采集已结束：成功 ${p.success} 所，失败 ${p.failed} 所，跳过 ${p.skipped} 所`);
            if (p.status === 'failed' || p.status === 'cancelled') {
              const progressError = p.error || (p.status === 'cancelled' ? '采集已取消' : '采集失败，未返回错误详情');
              setStatus(p.status);
              setErrorCode(p.error_code);
              setError(progressError);
              addCrawlingLog(`上次采集错误：${progressError}`);
              if (p.error_code === 'LOGIN_REQUIRED' || (!p.error_code && isLoginError(progressError))) {
                setShowLoginModal(true);
              }
            } else if (p.success > 0) {
              addCrawlingLog('正在同步数据到工作区...');
              void finalizeCompletedCrawl();
            } else {
              setStatus('failed');
              setErrorCode(p.error_code);
              setError('上次采集未取得数据，请取消后重新选择专业');
            }
          } else {
            // 不同专业的旧任务已结束：启动当前专业。
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
        if (p.status === 'completed') {
          displaySchool = '采集完成';
        } else if (p.status === 'failed' || p.status === 'cancelled') {
          displaySchool = '采集已结束';
        } else if (p.total > 0) {
          displaySchool = p.current_name || `进度 ${p.current}/${p.total}`;
        } else if (p.current_name) {
          displaySchool = p.current_name;
        } else if (p.status === 'running') {
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

        if (p.error_code !== errorCode) {
          setErrorCode(p.error_code);
        }
        if (p.error && p.error !== error) {
          setError(p.error);
          addCrawlingLog(`错误：${p.error}`, 'error');
        }

        if (p.status !== 'running' && p.status !== 'idle') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          const successLevel = p.status === 'completed' ? 'success' : 'error';
          addCrawlingLog(`采集结束：成功 ${p.success} 所，失败 ${p.failed} 所，跳过 ${p.skipped} 所`, successLevel);
          if (p.status === 'failed' || p.status === 'cancelled') {
            const progressError = p.error || (p.status === 'cancelled' ? '采集已取消' : '采集失败，未返回错误详情');
            setStatus(p.status);
            setErrorCode(p.error_code);
            setError(progressError);
            addCrawlingLog(`采集失败：${progressError}，专业未添加到管理列表`, 'error');
            if (p.error_code === 'LOGIN_REQUIRED' || (!p.error_code && isLoginError(progressError))) {
              setShowLoginModal(true);
            }
          } else {
            await finalizeCompletedCrawl();
          }
        }
      } catch (err) {
        const appError = normalizeAppError(err, '获取采集进度失败');
        addCrawlingLog(`获取进度失败：${appError.message}`, 'error');
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
        if (message.includes('正在同步数据到工作区')) {
          setSyncing(true);
        }
        addCrawlingLog(message, lvl);
      });
    })();
    return () => {
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawlTarget, status]);

  // 已耗时定时器：每秒更新 elapsed（ISSUE-029 日志细节优化）
  useEffect(() => {
    if (status !== 'running' || !startTimeRef.current) return;
    const timer = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  // Auto scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [crawlingProgress?.logs]);

  const finalizeCompletedCrawl = async () => {
    if (!crawlTarget || isFinalizingRef.current) return;
    isFinalizingRef.current = true;
    setSyncing(true);
    setStatus('syncing');
    try {
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
        addCrawlingLog(`同步完成，但专业 ${crawlTarget.code} 无数据，未添加到管理列表`, 'error');
        setStatus('failed');
        setError('同步后无数据，请确认采集任务是否成功完成');
        setSyncing(false);
        isFinalizingRef.current = false;
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
      setSelectedMajorCodes([crawlTarget.code]);
      addCrawlingLog('数据同步完成，正在进入工作区', 'success');
      setStatus('completed');
      setSyncing(false);
      setCrawlingProgress(null);
      setCrawlTarget(null);
      setPage('workspace');
    } catch (err) {
      const appError = normalizeAppError(err, '加载已同步数据失败');
      addCrawlingLog(`加载已同步数据失败：${appError.message}`, 'error');
      setStatus('failed');
      setErrorCode(appError.code === 'UNKNOWN' ? 'FAILED' : appError.code);
      setError(appError.message);
      setSyncing(false);
      isFinalizingRef.current = false;
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
        setErrorCode(null);
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

  const handleRetryFailed = async () => {
    setErrorCode(null);
    setError(null);
    setStatus('checking');
    isLaunchingRef.current = false;
    addCrawlingLog('正在从上次成功位置继续采集...');
    await startCrawl();
  };

  const handleCancelLogin = () => {
    setShowLoginModal(false);
    setStatus('cancelled');
    setErrorCode(null);
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

  const errorPresentation = error
    ? getCrawlErrorPresentation(
        errorCode,
        status === 'cancelled' ? 'cancelled' : 'failed',
        error,
      )
    : null;

  const handleErrorAction = () => {
    if (!errorPresentation) return;
    if (errorPresentation.actionType === 'login') {
      setShowLoginModal(true);
    } else if (errorPresentation.actionType === 'retry') {
      void handleRetryFailed();
    } else {
      setCrawlingProgress(null);
      setCrawlTarget(null);
      setPage(errorPresentation.actionType);
    }
  };

  const handleClearLogs = () => {
    if (crawlingProgress) {
      setCrawlingProgress({ ...crawlingProgress, logs: [] });
    }
  };

  // 复制全部日志到剪贴板（ISSUE-029 日志细节优化，方便用户反馈错误）
  // 优先用 navigator.clipboard，不可用时回退到 textarea + document.execCommand
  const handleCopyLogs = async () => {
    if (!crawlingProgress) return;
    const text = crawlingProgress.logs
      .map((log) => {
        const prefix = { info: '', warn: '⚠ ', success: '✓ ', error: '✗ ' }[log.level || 'info'] || '';
        return `[${log.time}] ${prefix}${log.message}`;
      })
      .join('\n');
    let success = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        success = true;
      }
    } catch (err) {
      console.warn('clipboard API 复制失败，回退到 execCommand:', err);
    }
    if (!success) {
      // 兜底：临时 textarea + execCommand('copy')
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (err) {
        console.warn('execCommand 复制也失败:', err);
      }
    }
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
        {error && errorPresentation && (
          <div className={`mb-6 rounded-lg px-4 py-3 border ${
            errorPresentation.tone === 'error'
              ? 'bg-red-50 border-red-200'
              : errorPresentation.tone === 'info'
                ? 'bg-blue-50 border-blue-200'
                : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className={`flex-shrink-0 mt-0.5 ${
                errorPresentation.tone === 'error'
                  ? 'text-red-500'
                  : errorPresentation.tone === 'info'
                    ? 'text-blue-500'
                    : 'text-amber-500'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">{errorPresentation.title}</div>
                <div className="text-sm mt-1 text-gray-700">发生了什么：{error}</div>
                <div className="text-sm mt-1 text-gray-600">影响：{errorPresentation.impact}</div>
                <div className="text-sm mt-1 text-gray-600">下一步：{errorPresentation.action}</div>
                <button
                  onClick={handleErrorAction}
                  className="mt-3 px-3 py-1.5 text-sm font-medium rounded border border-current text-[#1e3a5f] hover:bg-white transition-colors"
                >
                  {errorPresentation.actionLabel}
                </button>
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
              {getCrawlStatusLabel(syncing ? 'syncing' : status)}
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
          {/* 第一行：阶段标识 + 已耗时 + 整体进度百分比 */}
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-medium text-gray-700">整体进度</span>
              {/* 当前阶段徽章（ISSUE-029 日志细节优化） */}
              {(() => {
                const stage = detectStage(crawlingProgress?.logs);
                const stageColors: Record<string, string> = {
                  idle: 'bg-gray-100 text-gray-600',
                  round1: 'bg-blue-100 text-blue-700',
                  round2: 'bg-amber-100 text-amber-700',
                  round3: 'bg-orange-100 text-orange-700',
                  cooldown: 'bg-amber-100 text-amber-700',
                  scores: 'bg-indigo-100 text-indigo-700',
                  syncing: 'bg-purple-100 text-purple-700',
                  done: 'bg-emerald-100 text-emerald-700',
                  error: 'bg-red-100 text-red-700',
                };
                return (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageColors[stage.kind] || stageColors.idle}`}>
                    {stage.label}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-4 text-sm">
              {/* 已耗时（ISSUE-029 日志细节优化） */}
              {elapsed > 0 && (
                <span className="text-gray-500 font-mono">
                  已耗时 <span className="text-gray-700 font-medium">{formatElapsed(elapsed)}</span>
                </span>
              )}
              <span className="text-gray-600 font-medium">{crawlingProgress?.percent || 0}%</span>
            </div>
          </div>
          {/* 进度条：限流冷却时变色提示 */}
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              animate={{ width: `${crawlingProgress?.percent || 0}%` }}
              transition={{ duration: 0.5 }}
              className={`h-full rounded-full transition-colors ${
                detectStage(crawlingProgress?.logs).kind === 'cooldown'
                  ? 'bg-amber-400'
                  : 'bg-[#1e3a5f]'
              }`}
            />
          </div>
        </div>

        {/* Logs */}
        <div className="bg-gray-50 rounded-lg px-6 py-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setLogsCollapsed((c) => !c)}
              className="flex items-center gap-1 font-medium text-gray-700 hover:text-[#1e3a5f] transition-colors"
              title={logsCollapsed ? '展开日志面板' : '折叠日志面板'}
            >
              {logsCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              采集日志
              {crawlingProgress && crawlingProgress.logs.length > 0 && (
                <span className="ml-1 text-xs text-gray-500 font-normal">({crawlingProgress.logs.length})</span>
              )}
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCopyLogs}
                disabled={!crawlingProgress || crawlingProgress.logs.length === 0}
                className="flex items-center gap-1 text-sm text-[#1e3a5f] hover:underline disabled:opacity-50"
                title="复制全部日志到剪贴板"
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                {copied ? '已复制' : '复制日志'}
              </button>
              <button
                onClick={handleClearLogs}
                disabled={syncing}
                className="text-sm text-[#1e3a5f] hover:underline disabled:opacity-50"
              >
                清空日志
              </button>
            </div>
          </div>
          {!logsCollapsed && (
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
          )}
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
