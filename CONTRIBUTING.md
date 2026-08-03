# 贡献指南

## 开发环境

- Windows 10/11
- Node.js 22
- Rust stable
- Python 3.10+
- WebView2 Runtime

```powershell
pip install -e .
cd yam-desktop
npm ci
npm run desktop:dev
```

`desktop:dev` 会加载仅开发环境使用的 CDP 9223 配置。发布构建不会启用该端口。

## 修改原则

- 先阅读 `docs/roadmap.md`、`docs/known-issues.md` 和相关调用链。
- 保持本地优先：数据库、Cookie、日志和导出文件不得自动上传。
- 不提交 Cookie、数据库、诊断日志、截图中的个人信息或 `.env`。
- 数据模型变更必须提供旧库迁移或兼容回退，并使用隔离数据库验证。
- 采集错误通过结构化错误码传递；完整 traceback 只能进入本地脱敏日志。
- UI 修改需兼顾 1200×800、1024×700、800×600 及 80%–150% 缩放。

## 提交前检查

```powershell
cd yam-desktop
npm run test:release:auto
```

涉及 Python 时另执行：

```powershell
cd ..
python -m compileall -q yam
```

涉及真实 Tauri 命令或工作区流程时：

```powershell
cd yam-desktop
npm run desktop:dev
npm run test:e2e:stage4
```

E2E 必须恢复收藏等可变状态，不得清除用户正式 Cookie 或数据库。

## Pull Request

PR 应保持单一目的，并说明：

- 问题和用户影响
- 实现方案及兼容性
- 数据库/IPC/UI 行为变化
- 执行过的测试及结果
- 未覆盖风险和后续项

不要在同一 PR 中混入无关重构、生成产物或用户数据。

## 问题反馈

普通问题请使用 GitHub Issue 模板。附上复现步骤、期望/实际结果、YAM 版本和 Windows 版本。诊断日志位于设置页“诊断日志”，提交前必须检查并移除个人信息。

安全问题不要创建公开 Issue，按 `SECURITY.md` 处理。
