import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, AlertCircle, CheckCircle2, X, Loader2, LogIn } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { TopNav } from '../components/TopNav';
import {
  updateMajorsCatalog,
  cancelCatalogUpdate,
  getCatalogUpdateProgress,
  resetCatalogUpdate,
  type UpdateCatalogProgress,
} from '../lib/db';

/**
 * 设置页面：放置"更新专业目录"等不常用功能。
 *
 * 更新专业目录：后台一次性抓取研招网全部 219 个一级学科，
 * 写入 data/majors_realtime.json 供桌面端 MajorSelectPage 读取，
 * 避免每次选择专业时都实时查询。耗时 1-2 小时。
 */
export function SettingsPage() {
  const { setPage } = useAppStore();
  const [progress, setProgress] = useState<UpdateCatalogProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useLogin, setUseLogin] = useState(false);

  // 拉取初始进度 + 监听事件
  useEffect(() => {
    let active = true;
    const unlistens: Array<() => void> = [];

    (async () => {
      try {
        const initial = await getCatalogUpdateProgress();
        if (!active) return;
        setProgress(initial);
      } catch {
        // ignore
      }

      if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
        const { listen } = await import('@tauri-apps/api/event');
        const unlistenProgress = await listen<UpdateCatalogProgress>(
          'catalog-update-progress',
          (event) => {
            setProgress(event.payload);
          }
        );
        const unlistenDone = await listen<UpdateCatalogProgress>(
          'catalog-update-done',
          (event) => {
            setProgress(event.payload);
          }
        );
        unlistens.push(unlistenProgress, unlistenDone);
      }
    })();

    return () => {
      active = false;
      unlistens.forEach((fn) => fn());
    };
  }, []);

  const handleStart = async () => {
    setError(null);
    try {
      await resetCatalogUpdate();
      await updateMajorsCatalog(useLogin);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCancel = async () => {
    try {
      await cancelCatalogUpdate();
    } catch (e) {
      setError(String(e));
    }
  };

  const isRunning = !!progress?.running;
  const isDone = progress?.done && !progress?.running;
  const hasError = !!progress?.error;
  const percent =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-white">
      <TopNav activeTab="settings" />

      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">设置</h1>
        <p className="text-gray-500 mb-8">应用功能与数据维护。</p>

        {/* 更新专业目录卡片 */}
        <section className="border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-5 h-5 text-[#1e3a5f]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">更新专业目录</h2>
              <p className="text-sm text-gray-500 mb-4 leading-relaxed">
                从研招网一次性抓取全部 219 个一级学科（含 J/Z 自设交叉学科）的专业列表，
                写入本地 JSON 文件供专业选择页面读取。完成后选择专业时无需再等待实时查询。
                <br />
                耗时约 1-2 小时，可在后台运行；中途离开页面不会中断任务。
              </p>

              {/* 首次登录复选框 */}
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useLogin}
                  onChange={(e) => setUseLogin(e.target.checked)}
                  disabled={isRunning}
                  className="rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
                />
                <LogIn size={14} className="text-gray-400" />
                首次需要登录研招网（勾选后会打开可见浏览器窗口完成登录）
              </label>

              {/* 操作按钮 */}
              <div className="flex items-center gap-3">
                {!isRunning && !isDone && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStart}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#162d4a] transition-colors"
                  >
                    <RefreshCw size={16} />
                    开始更新
                  </motion.button>
                )}

                {isRunning && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={handleCancel}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-lg font-medium hover:bg-red-100 transition-colors"
                  >
                    <X size={16} />
                    取消更新
                  </motion.button>
                )}

                {isDone && !hasError && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={async () => {
                      await resetCatalogUpdate();
                      setProgress(null);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    <RefreshCw size={16} />
                    重新更新
                  </motion.button>
                )}

                {isDone && hasError && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={async () => {
                      await resetCatalogUpdate();
                      setProgress(null);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    清除错误
                  </motion.button>
                )}

                {progress && (isRunning || isDone) && (
                  <button
                    onClick={() => setPage('major-select')}
                    className="text-sm text-[#1e3a5f] hover:underline"
                  >
                    前往选择专业 →
                  </button>
                )}
              </div>

              {/* 进度展示 */}
              <AnimatePresence>
                {progress && (isRunning || isDone) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-5 overflow-hidden"
                  >
                    {/* 状态行 */}
                    <div className="flex items-center gap-2 mb-2 text-sm">
                      {isRunning && <Loader2 className="w-4 h-4 animate-spin text-[#1e3a5f]" />}
                      {isDone && !hasError && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      )}
                      {isDone && hasError && (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-gray-700 font-medium">
                        {isRunning && '正在更新专业目录...'}
                        {isDone && !hasError && '更新完成'}
                        {isDone && hasError && '更新失败'}
                      </span>
                      {progress.total > 0 && (
                        <span className="text-gray-500 ml-auto">
                          {progress.current} / {progress.total}（{percent}%）
                        </span>
                      )}
                    </div>

                    {/* 进度条 */}
                    {progress.total > 0 && (
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${
                            hasError ? 'bg-red-400' : 'bg-[#1e3a5f]'
                          }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${percent}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}

                    {/* 当前学科 */}
                    {isRunning && progress.current_yjxkdm && (
                      <div className="mt-2 text-xs text-gray-500">
                        当前：{progress.current_yjxkdm} {progress.current_yjxkmc}
                      </div>
                    )}

                    {/* 完成统计 */}
                    {isDone && !hasError && (
                      <div className="mt-2 text-xs text-gray-500">
                        成功 {progress.success_count} 个，失败 {progress.failed_count} 个
                        {progress.failed_count > 0 && '（失败的学科将沿用本地静态数据）'}
                      </div>
                    )}

                    {/* 错误信息 */}
                    {hasError && (
                      <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                        {progress.error}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 同步错误（invoke 失败） */}
              {error && (
                <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {error}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
