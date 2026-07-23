import { create } from 'zustand';

// UX-6.1：全局 toast 通知。替代/补充原顶部错误横幅，支持自动消失 + 可选操作按钮（如「重试」「撤销」）。
// 由 App.tsx 挂载的 <ToastContainer /> 渲染。任意组件通过 useToastStore.getState().showToast(...) 调用。

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
  /// 自动消失时长（ms）。0 = 不自动消失（sticky）。
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  showToast: (t: Omit<Toast, 'id'> & { id?: string }) => string;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  showToast: (t) => {
    const id = t.id ?? `toast-${Date.now()}-${++counter}`;
    // 先展开 t（可能含 duration/type），再用计算出的 id 兜底，避免 t.id 为 undefined 覆盖
    const toast: Toast = { duration: 4000, type: 'info', ...t, id };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (toast.duration > 0) {
      setTimeout(() => get().dismissToast(id), toast.duration);
    }
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clearAll: () => set({ toasts: [] }),
}));

/// 便捷方法：非 hook 上下文（如事件回调、catch 块）也能调用。
export const toast = {
  show: (t: Omit<Toast, 'id'> & { id?: string }) => useToastStore.getState().showToast(t),
  success: (message: string, action?: ToastAction) =>
    useToastStore.getState().showToast({ message, type: 'success', action, duration: 4000 }),
  error: (message: string, action?: ToastAction) =>
    useToastStore.getState().showToast({ message, type: 'error', action, duration: 6000 }),
  info: (message: string, action?: ToastAction) =>
    useToastStore.getState().showToast({ message, type: 'info', action, duration: 4000 }),
  warning: (message: string, action?: ToastAction) =>
    useToastStore.getState().showToast({ message, type: 'warning', action, duration: 5000 }),
  dismiss: (id: string) => useToastStore.getState().dismissToast(id),
};
