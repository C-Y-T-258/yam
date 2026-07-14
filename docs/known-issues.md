# 已知问题与 Bug 跟踪

## 记录规范

- 编号：ISSUE-001 递增
- 严重程度：blocker / high / medium / low
- 状态：open / in-progress / fixed
- 每个问题包含：描述、复现步骤、期望行为、实际行为、建议修复方向

---

## ISSUE-001：桌面端“同步”概念不符合用户直觉

- **严重程度**：high
- **状态**：open
- **描述**：用户抓取数据后打开桌面端，需要手动执行同步脚本或点击“同步后端数据”按钮才能看到数据。这不符合“打开即用”的默认直觉。
- **复现步骤**：
  1. `python -m yam.cli fetch -m 085410`
  2. 启动桌面端 `npm run tauri dev`
  3. 工作区为空，必须手动同步
- **期望行为**：桌面端启动后自动加载 Python 后端已抓取的数据。
- **实际行为**：必须手动执行 `python -m yam.scripts.sync_to_tauri` 或点击同步按钮。
- **建议修复方向**：
  - 短期：桌面端启动/切换专业时自动调用 `syncWorkspaceData`，界面中隐藏“同步”一词，改为“刷新数据”。
  - 长期：让 Tauri 直接读取 `~/.yam/data/yam.db`，彻底消除双 DB。

---

## ISSUE-002：网页端 Workspace 页面在浏览器自动化工具中快照超时

- **严重程度**：medium
- **状态**：open
- **描述**：使用 Playwright/浏览器工具访问 `http://localhost:1420/#workspace` 时页面加载超时，Welcome 页正常。带 `TopNav` 的页面似乎都受影响。
- **复现步骤**：
  1. `cd yam-desktop; npm run dev`
  2. 浏览器访问 `/#workspace`
  3. 快照/等待超时
- **期望行为**：网页端应能正常渲染 Workspace 页面用于 UI 调试。
- **实际行为**：页面加载卡住，无法完成快照。
- **建议修复方向**：
  - 检查 `TopNav` 组件是否有无限渲染或循环请求。
  - 检查 mock 数据加载路径是否有阻塞。
  - 考虑给浏览器环境补充更完整的 mock 数据初始化。

---

## ISSUE-003：Tauri v2 环境判断错误导致桌面端长期运行在没有真实数据的状态

- **严重程度**：high
- **状态**：fixed
- **描述**：代码中使用 `'__TAURI__' in window` 判断是否在 Tauri 中，但 Tauri v2 实际使用 `window.isTauri`。导致桌面端一直走浏览器 mock 分支，无法读取真实 DB。
- **修复位置**：`yam-desktop/src/lib/db.ts`、`yam-desktop/src/App.tsx`
- **修复内容**：将判断改为 `(window as any).isTauri === true`。

---
