import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Building2, GraduationCap, Calendar, Pause, Play, X, Cloud } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { TopNav } from '../components/TopNav';

export function CrawlingPage() {
  const { crawlingProgress, setCrawlingProgress, addCrawlingLog, setPage } = useAppStore();
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Initialize mock crawling progress
  useEffect(() => {
    if (!crawlingProgress) {
      setCrawlingProgress({
        major: '人工智能',
        school: '北京大学',
        department: '信息科学技术学院',
        year: 2026,
        percent: 68,
        logs: [
          { time: '10:24:18', message: '开始数据采集任务...' },
          { time: '10:24:18', message: '正在获取学校列表...' },
          { time: '10:24:21', message: '已获取 287 所学校' },
          { time: '10:24:22', message: '正在处理：北京大学' },
          { time: '10:24:23', message: '正在解析招生目录...' },
          { time: '10:24:25', message: '正在解析专业信息...' },
          { time: '10:24:27', message: '正在解析考试科目...' },
          { time: '10:24:29', message: '正在写入数据库...' },
          { time: '10:24:31', message: '北京大学 - 信息科学技术学院 - 2026：采集完成' },
          { time: '10:24:31', message: '正在处理下一所学校：清华大学' },
        ],
        isPaused: false,
      });
    }
  }, []);

  // Auto scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [crawlingProgress?.logs]);

  const handlePause = () => {
    if (crawlingProgress) {
      setCrawlingProgress({ ...crawlingProgress, isPaused: !crawlingProgress.isPaused });
    }
  };

  const handleCancel = () => {
    setCrawlingProgress(null);
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

  return (
    <div className="min-h-screen bg-white">
      <TopNav activeTab="crawling" />

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Current Major */}
        <h1 className="text-xl text-gray-700 mb-6">
          当前专业：<span className="text-[#1e3a5f] font-medium">{crawlingProgress?.major || '人工智能'}</span>
        </h1>

        {/* Current Info Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg px-6 py-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Building2 size={16} />
              当前学校
            </div>
            <div className="font-medium text-gray-900">{crawlingProgress?.school || '北京大学'}</div>
          </div>
          <div className="bg-gray-50 rounded-lg px-6 py-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <GraduationCap size={16} />
              当前学院
            </div>
            <div className="font-medium text-gray-900">{crawlingProgress?.department || '信息科学技术学院'}</div>
          </div>
          <div className="bg-gray-50 rounded-lg px-6 py-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Calendar size={16} />
              当前年份
            </div>
            <div className="font-medium text-gray-900">{crawlingProgress?.year || 2026}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-gray-50 rounded-lg px-6 py-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-gray-700">整体进度</span>
            <span className="text-gray-600">{crawlingProgress?.percent || 68}%</span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${crawlingProgress?.percent || 68}%` }}
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
              className="text-sm text-[#1e3a5f] hover:underline"
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
            className="flex items-center gap-2 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Cloud size={16} />
            后台运行
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePause}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {crawlingProgress?.isPaused ? <Play size={16} /> : <Pause size={16} />}
            {crawlingProgress?.isPaused ? '继续' : '暂停'}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCancel}
            className="flex items-center gap-2 px-4 py-2 text-red-500 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            <X size={16} />
            取消
          </motion.button>
        </div>
      </div>
    </div>
  );
}
