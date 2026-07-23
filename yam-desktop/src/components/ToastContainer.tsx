import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useToastStore, type ToastType } from '../stores/toastStore';

// UX-6.1：全局 toast 容器，固定右上角。由 App.tsx 挂载一次。
const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};
const ICON_COLORS: Record<ToastType, string> = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-[#1e3a5f]',
};

export function ToastContainer() {
  const { toasts, dismissToast } = useToastStore();
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[360px] pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.92 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-3 flex items-start gap-3"
            >
              <Icon size={18} className={`${ICON_COLORS[t.type]} flex-shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 break-words leading-relaxed">{t.message}</p>
                {t.action && (
                  <button
                    onClick={() => {
                      t.action!.onClick();
                      dismissToast(t.id);
                    }}
                    className="mt-1.5 text-xs font-medium text-[#1e3a5f] hover:underline"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => dismissToast(t.id)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                aria-label="关闭"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
