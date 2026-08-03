# YAM 技术债务清单（Tech Debt）

> 本文档系统整理项目中散落的清理项、废弃代码、中低优先级技术任务和文档缺失。
> 日常开发以 `docs/roadmap.md` 为主，本文档作为补充的“待办池”。
> 每完成一项，同步更新 `docs/progress.md` 并在本文件标记状态。

---

## 1. 废弃/未使用的前端代码（已清理）

**清理时间**：2026-07-25（本轮代码健康清理）

这些代码**之前**未被主流程引用（`App.tsx` 和 `WorkspacePage.tsx` 未导入），属于早期实验或备用实现。

| 模块 | 原路径 | 原状态 | 处理结果 | 备注 |
|------|--------|--------|----------|------|
| 院校列表页（卡片式） | `src/pages/SchoolsPage.tsx` | 未使用 | ✅ 已删除 | 依赖 schools/SchoolCard + FilterPanel |
| 院校详情页（Tab 式） | `src/pages/SchoolDetailPage.tsx` | 未使用 | ✅ 已删除 | 含 mock 数据 + TODO |
| 旧版学校卡片 | `src/components/SchoolCard.tsx` | 未使用 | ✅ 已删除 | 与 schools/SchoolCard 重复 |
| 旧版筛选面板 | `src/components/FilterPanel.tsx` | 未使用 | ✅ 已删除 | 可能被旧页引用 |
| schools 子目录 | `src/components/schools/` | 未使用 | ✅ 已删除 | 包含 SchoolCard.tsx + FilterPanel.tsx |
| layout 子目录 | `src/components/layout/` | 部分未使用 | ✅ 已删除 | 多套 Sidebar / Header |
| Electron 遗留目录 | `electron/` | 未使用 | ✅ 已删除（含所有子文件） | 当前完全走 Tauri |

**原代码内 TODO（均已随文件删除）**：
- `SchoolsPage.tsx:39` — `// TODO: Replace with actual API call`
- `components/schools/SchoolCard.tsx:15` — `// TODO: Implement favorite toggle`
- `SchoolDetailPage.tsx:94,108` — `// TODO: Replace with actual API call` + favorite

**行动建议（已完成）**：
- 在“代码清理”阶段统一处理（已于 2026-07-25 直接删除，无需归档）。
- 删除前已通过 grep 确认无其他引用。

**验证**：
- `npm run build` ✅
- `cargo check` ✅（仅预存 warning）
- grep 确认全项目无残留引用

---

## 2. 文档缺失与引用问题

| 问题 | 当前状态 | 修复建议 | 优先级 |
|------|----------|----------|--------|
| `README.md` 引用 `docs/session-handoff.md` 但文件不存在 | 已于 2026-07-25 补建 | 保持并更新引用 | 已处理 |
| 部分研究文档散落在 `.trae/documents/` | 历史残留 | 按需迁移到 `docs/` 或归档 | 中 |
| 发布流程说明不足（如何整理 `release/`、签名、校验） | 仅在 roadmap 提及 | 补充 `docs/release-guide.md` | 中 |

**已补文件**：
- [docs/session-handoff.md](session-handoff.md) — 方案 A（登录向导 + 原子锁 + 状态机）设计摘要。

---

## 3. TypeScript 历史错误（全量 `tsc --noEmit`）

以下错误在多次验证中持续存在，**非本轮引入**，属于技术债务：

- `src/lib/db.ts` 多处 `as WorkspaceSchool` 强制转换（类型不匹配）
- `src/lib/utils.ts` 缺失 `clsx` / `tailwind-merge`
- `src/main.tsx` 无法解析 `./index.css`
- `src/pages/Modals.tsx` 未使用参数 `onClose`
- `src/stores/toastStore.ts` `duration` / `type` 重复声明
- `src/pages/DataReadyPage.tsx`、`MajorSelectPage.tsx`、`Header.tsx` 等未使用导入
- `src/components/SplashScreen.tsx` 未使用 `Database`
- `src/pages/SettingsPage.tsx` `__TAURI_INTERNALS__` 类型缺失
- `src/pages/SchoolDetail.tsx` 未使用 `ChevronDown` / `schoolId`

**建议**：
- 开一个独立的“TypeScript 债务清理” PR，逐个修复或 `@ts-ignore` + 注释说明原因。
- 优先修复会影响未来重构的类型问题。

---

## 4. 中低优先级功能任务

这些已在 `roadmap.md` 中归类为 P2 或“长期”，但为避免遗忘，集中列出：

| 任务 | 来源 | 优先级 | 当前状态 | 建议时机 |
|------|------|--------|----------|----------|
| 抽象 `SessionStore` 接口（支持研招网 + 掌上考研） | ISSUE-024 | 中 | 未实现 | 稳定采集版本之后 |
| 登录态过期前自动刷新 | ISSUE-024 | 低 | 未实现 | 同上 |
| 掌上考研登录态接入 | ISSUE-024 | 低 | 未实现 | 按需 |
| `score_lines` 表增加 `department_name` 列（院系精确匹配） | ISSUE-025 | 中 | 未实现 | 工作区分析增强时 |
| 接入研招网 `scoreLines.do` 作为补充数据源 | ISSUE-025 | 低 | 未实现 | 同上 |
| `fetch_school_list`（省份扫描 + 多筛选）的 httpx 并发优化 | ISSUE-029 | 低 | 仅首次种子阶段需要 | 大部分专业已有种子后可延后 |
| 发布前验收矩阵（窗口尺寸、缩放、失败态、空库、登录失效等） | Roadmap | 高 | 部分脚本存在，需系统化 | 可分发版本阶段 |
| 数据库迁移机制 + 备份恢复 | Roadmap P2 | 中 | 未实现 | 正式发布前 |
| 崩溃日志 + 错误上报 | Roadmap P2 | 中 | 未实现 | 同上 |
| 自动更新机制 | Roadmap P2 | 低 | 未实现 | 成熟后 |

---

## 5. 发布与分发相关待办

| 事项 | 现状 | 目标 | 优先级 |
|------|------|------|--------|
| 固定 `release/` 目录结构 | ✅ 已实现（Setup / Portable + checksums + RELEASE-NOTES） | 保持此结构 | P0（已推进） |
| 生成并验证 NSIS 安装包 | ✅ 已产出并复制到 release/ | 干净 Windows 环境双击安装成功 | P0（待验证） |
| 生成 MSI（可选） | 脚本支持（`desktop:build:msi`），未本次执行 | 按需产出 | 中 |
| WebView2 依赖检查与提示 | ✅ 配置为 `downloadBootstrapper`（tauri.conf.json）；安装器缺失时自动引导下载安装。应用层主动检测/引导仍可作为增强 | 安装前检测或引导安装（已通过安装器实现基础保障） | P0（基础已完成） |
| 发布前验收矩阵跑通 | 脚本分散（`test_full_ui_v3.cjs` 等） | 文档化 + 定期执行 | P1 |
| 版本号与 Git tag 规范 | 已有语义，但未强制 | 建立 release checklist | P1 |
| 便携版 vs 安装版差异说明 | ✅ 已在 RELEASE-NOTES 提及 | 保持更新 | 中 |

---

## 6. 其他清理项

- **历史脚本归档**：`scripts/` 下一次性探针脚本已在 2026-07-24 清理，保留可复用脚本清单见 `progress.md`。
- **冗余 mock 数据**：`src/data/mock-schools.ts` 等仅在废弃页面使用，可随废弃代码一起处理。
- **端口说明一致性**：`9223` 已修正（tauri.conf + main.rs 注释），保持关注。
- **多套布局组件**：`src/components/layout/`（已于 2026-07-25 随废弃代码一起删除）。
- **Cargo warning**：`db.rs:1315` 未读赋值（`idx += 1`），属于 harmless，可在重构时清理。

---

## 7. 建议处理节奏

1. **立即**（P0 相关）
   - 补齐 `session-handoff.md`（已完成）
   - 建立 `release/` 整理流程 + 验证安装包

2. **近期**（代码健康）— 已完成部分
   - 删除/归档 `electron/` 目录 ✅（2026-07-25）
   - 清理或隔离 `SchoolsPage` / `SchoolDetailPage` 相关代码 ✅（2026-07-25）
   - 修复关键 TypeScript 错误（影响重构的那些） — 待后续

3. **中期**（产品能力）
   - 按 roadmap 推进 SessionStore、score_lines 精确匹配等

4. **长期**
   - 发布流水线、自动更新、崩溃上报

3. **中期**（产品能力）
   - 按 roadmap 推进 SessionStore、score_lines 精确匹配等

4. **长期**
   - 发布流水线、自动更新、崩溃上报

---

## 维护规则

- 新发现的债务必须同时更新本文件 + 指明优先级。
- 完成一项后在本文件打 `✅ 已处理` 并记录 commit / PR。
- 避免在本文件堆砌已解决的 Bug（Bug 留在 `known-issues.md`）。

---

**最后更新**：2026-07-26（可分发版本完成：NSIS + MSI 产出并整理到 release/ + RELEASE-NOTES 更新 + WebView2 配置修正为 `{ "type": "downloadBootstrapper" }` + 文档同步）
