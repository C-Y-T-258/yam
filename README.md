# 研喵 YAM

本地优先的考研择校数据工具。

## 快速开始

### 开发 / 测试入口
```powershell
cd d:\yam\yam-desktop
npm install                 # 首次需要
npm run desktop:dev         # 启动 Tauri 桌面端（会打开窗口 + CDP 9223）
```

- 纯前端（不推荐用于功能测试）：`npm run dev`（仅浏览器，`http://localhost:1420`）
- 全量 UI 测试脚本：`npm run test:ui` / `npm run test:ux`

### 构建 / 分发入口
```powershell
npm run release:dry-run        # 校验版本并预览发布命令，不生成 bundle
npm run release:build          # 测试并生成 Windows NSIS、MSI、便携版及 SHA256
```

推送 `v<semver>` tag（须与项目版本和发布说明一致）会触发 Windows 发布工作流；日常 `main` push / PR 只运行测试和版本一致性检查。

构建产物位于：
```text
yam-desktop/src-tauri/target/release/bundle/
```

建议整理到稳定发布目录：
```text
release/
├── YAM-Setup-*.exe
├── YAM-Portable-*.exe
├── checksums.txt
└── RELEASE-NOTES.md
```

**注意**：安装包（Setup / MSI）会在 WebView2 缺失时自动引导下载官方 bootstrapper 进行安装。便携版需要用户自行确保系统已安装 WebView2。

### 数据库位置
```
%USERPROFILE%\.yam\data\yam-desktop.db
```

## 当前状态

桌面端已完成内置登录向导、采集状态机、工作区服务端分页、后台导出、数据库恢复、本地诊断日志和Windows发布流水线。发布构建会将Python采集后端及运行依赖嵌入桌面程序，首次使用相关功能时释放到 `%USERPROFILE%\.yam\runtime`；用户无需安装Python。

浏览器自动化复用系统Microsoft Edge，安装包会处理WebView2 Runtime。Cookie、数据库、运行时文件和诊断日志均保存在用户本机，不会自动上传。

后续产品决策集中在应用内自动更新和用户明确同意后的远程错误上报。历史设计和踩坑记录见 [`docs/session-handoff.md`](docs/session-handoff.md) 与 [`docs/data-collection-handoff-prompt.md`](docs/data-collection-handoff-prompt.md)。

## 技术栈

Tauri 2.x + React + TypeScript + Tailwind CSS v4 + Framer Motion，Python 后端负责研招网爬虫与 `yam.db`。

## 路线图与文档

- [docs/roadmap.md](docs/roadmap.md)：项目总路线图（P0/P1/P2 + 五阶段）
- [docs/tech-debt.md](docs/tech-debt.md)：技术债务清单（废弃代码、文档缺失、中低优先级任务、发布验证）
- [docs/known-issues.md](docs/known-issues.md)：Bug 跟踪与已知问题
- [docs/progress.md](docs/progress.md)：已完成里程碑与上下文恢复
- [docs/full-ui-test-prompt.md](docs/full-ui-test-prompt.md)：全流程 UI 测试提示词
- [docs/session-handoff.md](docs/session-handoff.md)：方案 A（登录向导 + 原子锁 + 状态机）设计摘要
- [docs/data-collection-handoff-prompt.md](docs/data-collection-handoff-prompt.md)：数据采集历史踩坑记录

## 免责声明

数据来自公开渠道，仅供学习参考，不保证完全准确。使用本工具产生的任何决策，由用户自行承担责任。
