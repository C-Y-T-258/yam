import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';

interface LoginRequiredModalProps {
  majorCode: string;
  onLogin: () => void;
  onCancel: () => void;
  isLoggingIn: boolean;
}

export function LoginRequiredModal({
  majorCode,
  onLogin,
  onCancel,
  isLoggingIn,
}: LoginRequiredModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-amber-100 p-3">
            <ExternalLink size={24} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">需要登录研招网</h3>
            <p className="mt-2 text-sm text-gray-600">
              采集专业 <span className="font-mono font-medium">{majorCode}</span> 需要研招网登录，点击下方按钮打开浏览器完成登录。
            </p>
            <p className="mt-1 text-xs text-gray-500">
              浏览器将打开研招网首页，请点击右上角“登录”完成登录。登录成功后系统会自动关闭浏览器并继续采集流程。
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoggingIn}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onLogin}
            disabled={isLoggingIn}
            className="flex items-center gap-2 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#162d4a] disabled:opacity-50"
          >
            {isLoggingIn ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                登录窗口已打开…
              </>
            ) : (
              <>
                <ExternalLink size={16} />
                打开登录窗口
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
