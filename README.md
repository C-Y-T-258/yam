# 研喵 YAM

本地优先的考研择校数据工具。

## 当前下一步目标

S001–S012 前端流程、综合筛选、数据采集流程修复均已完成。
当前全力推进 **内置研招网登录向导 + 采集任务启动锁优化**（方案 A），目标：

1. **内置登录向导**：桌面端检测到未登录研招网时，自动弹出浏览器窗口引导用户登录并保存 cookie，无需手动打开终端执行 `yam fetch-seeds -m <code> --login`。
2. **原子启动锁**：Rust 后端用原子操作确保同一时间只有一个采集任务在运行，避免前端重复调用导致"已有采集任务在运行"与正常流程日志并存。
3. **采集流程状态机重构**：明确区分"准备中/运行中/已完成/失败/取消"五种状态，消除 CrawlingPage 重复启动和日志混乱。

详见 [`docs/session-handoff.md`](docs/session-handoff.md) 与 [`docs/data-collection-handoff-prompt.md`](docs/data-collection-handoff-prompt.md)。

## 技术栈

Tauri 2.x + React + TypeScript + Tailwind CSS v4 + Framer Motion，Python 后端负责研招网爬虫与 `yam.db`。

## 免责声明

数据来自公开渠道，仅供学习参考，不保证完全准确。使用本工具产生的任何决策，由用户自行承担责任。
