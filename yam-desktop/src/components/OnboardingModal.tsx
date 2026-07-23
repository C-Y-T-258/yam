import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronLeft, ChevronRight, Check,
  Sparkles, GraduationCap, Download, Filter,
} from 'lucide-react';

// UX-1.1 / 1.2：新手引导弹窗。4 步说明「添加专业 → 采集数据 → 筛选院校」的工作流程。
// 1.1：WelcomePage「了解软件工作流程」按钮打开此弹窗。
// 1.2：App.tsx 首次启动自动打开（localStorage 标记 `yam-onboarding-seen` 控制只显示一次）。
interface OnboardingStep {
  icon: React.ElementType;
  title: string;
  description: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    icon: Sparkles,
    title: '欢迎使用研喵',
    description: '研喵帮你把研招网与掌上考研的招生数据汇聚到本地，按专业横向比较院校分数线、招生人数与考试科目。下面用 3 步了解如何开始。',
  },
  {
    icon: GraduationCap,
    title: '添加需要采集的专业',
    description: '进入「专业管理」→「添加专业」，搜索并选择你关注的专业（如 081200 计算机科学与技术）。可同时添加多个专业，便于后续横向比较。',
  },
  {
    icon: Download,
    title: '启动数据采集',
    description: '点击顶部「数据采集」，选择专业后启动采集。首次采集需要登录研招网（会打开浏览器），完成后数据会自动同步到本地数据库。',
  },
  {
    icon: Filter,
    title: '在工作区筛选与比较院校',
    description: '进入「工作区」，按地区、层次、考试科目等条件筛选院校，展开查看历年分数趋势，收藏心仪院校并加入对比。支持导出 CSV / Excel / JSON。',
  },
];

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const [step, setStep] = useState(0);

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  const handleFinish = () => {
    setStep(0);
    onClose();
  };

  const isLast = step === ONBOARDING_STEPS.length - 1;
  const current = ONBOARDING_STEPS[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl w-[480px] max-w-full overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <span className="text-xs font-medium text-gray-400">
                软件工作流程 · {step + 1} / {ONBOARDING_STEPS.length}
              </span>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>

            {/* Step progress dots */}
            <div className="flex items-center gap-1.5 px-6 pb-4">
              {ONBOARDING_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i === step ? 'w-8 bg-[#1e3a5f]' : i < step ? 'w-4 bg-[#1e3a5f]/40' : 'w-4 bg-gray-200'
                  }`}
                />
              ))}
            </div>

            {/* Step content */}
            <div className="px-6 pb-2 min-h-[220px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="w-14 h-14 rounded-2xl bg-[#1e3a5f]/10 flex items-center justify-center mb-4">
                    <Icon size={26} className="text-[#1e3a5f]" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{current.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{current.description}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 mt-2">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft size={16} />
                  上一步
                </button>
              )}
              {isLast ? (
                <button
                  onClick={handleFinish}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-white bg-[#1e3a5f] hover:bg-[#162d4a] rounded-lg transition-colors"
                >
                  <Check size={16} />
                  开始使用
                </button>
              ) : (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-white bg-[#1e3a5f] hover:bg-[#162d4a] rounded-lg transition-colors"
                >
                  下一步
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
