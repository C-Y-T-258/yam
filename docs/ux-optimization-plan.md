# YAM 桌面端用户体验优化计划

> 生成时间：2026-07-24  
> 来源：基于全流程 UI 测试与代码检查整理，经用户逐项确认后生成。

本文档记录当前确认采纳的用户体验优化项，并为每项标注 **状态**（已完成 / 待处理），避免跨会话查看时误判。未采纳的模块在文末「暂不处理模块」中说明原因。

---

## 采纳模块与优化项

### 1. 首次使用 / 空状态

#### 1.1 修复「了解软件工作流程」空链接
- **状态**：已完成
- **问题描述**：`WelcomePage.tsx:30-32` 的「了解软件工作流程」按钮未绑定 `onClick`，首次用户点击无响应，容易产生「软件坏了」的错觉。
- **实现方式**：`WelcomePage.tsx` 已引入 `OnboardingModal`，点击按钮打开新手引导弹窗。
- **涉及文件**：`yam-desktop/src/pages/WelcomePage.tsx`

#### 1.2 增加首次使用引导流程
- **状态**：已完成
- **问题描述**：首次打开仅有一个「添加专业」入口，没有解释「添加专业 → 采集数据 → 筛选院校」之间的关系。
- **实现方式**：通过 `OnboardingModal` 提供步骤式引导。
- **涉及文件**：`yam-desktop/src/pages/WelcomePage.tsx`、`yam-desktop/src/components/OnboardingModal.tsx`

---

### 2. 数据加载与反馈

#### 2.1 支持后台刷新或可取消
- **状态**：已完成
- **问题描述**：点击「刷新数据」后，页面中央显示「加载中…」，但旧列表仍显示在下方；刷新耗时较长（3 秒以上仍可能未结束），期间用户无法取消，也无法进行其他操作。
- **实现方式**：`WorkspacePage.tsx` 已引入 `isRefreshing`、`cancelRefreshRef`、`refreshProgress`，刷新中页面保持可交互并提供「取消」按钮。
- **涉及文件**：`yam-desktop/src/pages/WorkspacePage.tsx`

---

### 3. 筛选与搜索

#### 3.1 已选 Chip 支持点击重新编辑
- **状态**：已完成
- **问题描述**：当前筛选条件以 Chip 形式展示，用户只能点击「×」删除，不能直接点击 Chip 重新打开对应筛选面板调整已选项。
- **实现方式**：`WorkspaceFilterPanel.tsx` 中 `activeChips` 已带 `onEdit`，点击 Chip 可打开对应筛选面板。
- **涉及文件**：`yam-desktop/src/components/WorkspaceFilterPanel.tsx`

---

### 4. 数据展示（院校视图 / 招生计划视图）

#### 4.1 聚合展开状态持久化
- **状态**：已完成
- **问题描述**：在院校视图中展开某院校后，切换专业 Tab 或点击刷新，展开状态会被重置，用户需要重新展开查看详情。
- **实现方式**：`WorkspacePage.tsx` 已引入 `persistExpanded`、`restoreExpanded`、`EXPANDED_KEY`，通过 `localStorage` 持久化展开状态。
- **涉及文件**：`yam-desktop/src/pages/WorkspacePage.tsx`

#### 4.2 趋势图增加 hover tooltip 并优化视觉
- **状态**：已完成
- **问题描述**：`TrendChart` 中 Y 轴范围传参错误（`baseMin={600} baseMax={720}`）导致实际数据 335-370 全部挤在底部；数据标签常驻显示杂乱；图表尺寸小、字体小、无面积填充，整体视觉差。
- **实现方式**：`WorkspacePage.tsx` 的 `TrendChart` 重构：
  - 移除错误的 `baseMin/baseMax`，改为按实际数据自动计算 Y 轴范围并加 12% padding；
  - 数据全部相同时显示「无变化」标签并构造对称区间让点居中；
  - 移除常驻数据标签，改为 hover 显示 tooltip；
  - 增加面积填充 + 蓝色渐变；
  - 折线改用平滑贝塞尔曲线；
  - 图表尺寸从 128px 加高到 192px，字体从 8-10px 放大到 11-12px；
  - 数据点改为白底蓝边，hover 放大高亮。
- **验证结果**：`npm run build` 通过；CDP 截图确认最低分趋势图 345→370→335→360 变化清晰，招生人数趋势图显示「无变化」。
- **涉及文件**：`yam-desktop/src/pages/WorkspacePage.tsx`

#### 4.3 招生计划视图行信息密度优化
- **状态**：已完成
- **问题描述**：招生计划视图每行包含院校、专业、院系、方向、考试科目、分数线等信息，列数过多时在小屏上换行严重。
- **实现方式**：`WorkspacePage.tsx` 已引入 `planCompact` 紧凑/舒适视图切换。
- **涉及文件**：`yam-desktop/src/pages/WorkspacePage.tsx`

---

### 5. 收藏与最近查看

#### 5.1 简化取消收藏路径
- **状态**：已完成
- **问题描述**：当前取消收藏需要先到「收藏」页，找到对应红星再点击；在工作区多专业聚合行上点击收藏星的语义不清晰。
- **实现方式**：`WorkspacePage.tsx` 已引入 `toggleFavoriteMajor`，在展开区的专业分组标题旁显示收藏星，支持直接切换并带撤销 toast。
- **涉及文件**：`yam-desktop/src/pages/WorkspacePage.tsx`

---

### 6. 错误处理与恢复

#### 6.1 错误提示同时用 toast + 局部重试按钮
- **状态**：已完成
- **问题描述**：当前错误仅通过页面顶部横幅展示，当用户滚动到列表下方时可能看不到错误信息。
- **实现方式**：`WorkspacePage.tsx` 已引入 `reportError` + toast，错误同时显示 toast 和局部重试按钮。
- **涉及文件**：`yam-desktop/src/pages/WorkspacePage.tsx`

#### 6.2 同步失败支持单独重试
- **状态**：已完成
- **问题描述**：`handleSync` 中单个专业同步失败仅打印 `console.warn`，用户不知道哪个专业失败，也无法单独重试。
- **实现方式**：`WorkspacePage.tsx` 已引入 `syncFailures`、`handleRetrySyncOne`，失败专业 Tab 显示红点并支持单独重试。
- **涉及文件**：`yam-desktop/src/pages/WorkspacePage.tsx`

---

## 实施优先级总览

| 优先级 | 状态 | 优化项 |
|--------|------|--------|
| 高 | 已完成 | 1.1 修复 WelcomePage 空链接 |
| 高 | 已完成 | 2.1 后台/可取消刷新 |
| 高 | 已完成 | 6.1 toast + 局部重试 |
| 高 | 已完成 | 6.2 失败单独重试 |
| 中 | 已完成 | 1.2 首次引导 |
| 中 | 已完成 | 3.1 Chip 点击编辑 |
| 中 | 已完成 | 4.1 展开状态持久化 |
| 中 | 已完成 | 4.2 趋势图 tooltip |
| 中 | 已完成 | 5.1 简化取消收藏 |
| 低 | 已完成 | 4.3 招生计划视图行密度 |

---

## 补充：真实用户反馈（2026-07-24）

以下 5 条来自实际使用体验的反馈已调查代码根因，并补充进本文档。这些问题**之前未在自动化测试脚本中被覆盖**，说明现有测试更偏功能正确性，对交互直觉和细节反馈不足。

### A. 管理显示专业 — 进度条显示不正确
- **状态**：待处理
- **用户反馈**：点击「确定并刷新」后，进度条进度看起来不对，有跳变感。
- **根因分析**：`yam-desktop/src/pages/Modals.tsx:220-222` 中进度条宽度计算为：
  ```tsx
  width: `${((refreshProgress.current + 1) / refreshProgress.total) * 100}%`
  ```
  而 `refreshProgress.current` 在同步开始前就已设为 `i + 1`（从 1 开始），导致同步第一个专业时进度条就已经显示到 `2 / total`，视觉上明显超前。
- **修复建议**：
  1. 进度宽度改为 `(current / total) * 100%`；
  2. 将 `current` 的更新时机放在 `await syncWorkspaceData(code)` 完成后，或文字改为「正在同步第 X 个：专业名」。
- **优先级**：高
- **涉及文件**：`yam-desktop/src/pages/Modals.tsx`

### B. 工作区院校行 — 仅右侧箭头可点击，但 hover 阴影覆盖整行
- **状态**：待处理
- **用户反馈**：鼠标放在学校行任何地方都有阴影，但点学校名、点中间都点不开，只有点右边箭头才能展开，很不符合直觉。
- **根因分析**：`WorkspacePage.tsx:1268-1352` 的院校行 `<motion.div>` 设置了 `hover:bg-gray-50`，但 `onClick={() => handleToggleExpand(...)}` 只绑定在最后一列的箭头按钮上，导致 hover 反馈与可点击区域不一致。
- **修复建议**：
  1. 将展开/收起事件绑定到整行 `<motion.div>`；
  2. 收藏星、复选框等可交互元素内部用 `e.stopPropagation()` 阻止冒泡，避免误触；
  3. 将行内文字、院校名也设为可点击，并添加 `cursor-pointer` 提示。
- **优先级**：高
- **涉及文件**：`yam-desktop/src/pages/WorkspacePage.tsx`

### C. 展开详情时闪烁出现「加载中…」
- **状态**：待处理
- **用户反馈**：点击展开院校详情时，会突然闪一下「加载中…」标记，很烦人。
- **根因分析**：`handleToggleExpand` 调用 `loadWorkspaceData(id)`，该函数内部会 `setIsLoading(true)`，触发页面顶部的全局「加载中…」提示（`WorkspacePage.tsx:1215-1219`）。但展开面板本身已经渲染，全局 loading 提示与面板内容同时出现，造成闪烁感。
- **修复建议**：
  1. 展开详情时的院系加载不再使用全局 `isLoading`，改为局部状态 `isLoadingDepartments`；
  2. 或预加载：首次进入工作区时就把当前页所有院校的院系数据一并查好；
  3. 若必须加载，使用骨架屏替代全局 loading 提示。
- **优先级**：中
- **涉及文件**：`yam-desktop/src/pages/WorkspacePage.tsx`

### D. 展开详情后右侧只有院系名列表，信息量不足
- **状态**：待处理
- **用户反馈**：展开后专业下面只有一堆院系名，根本看不出参考价值。
- **根因分析**：`WorkspacePage.tsx:1425-1650` 展开面板右侧按专业分组列出院系，但每个院系默认收起，需要再点击一次才能看到研究方向、考试科目、招生人数、分数线等核心信息。首次展开时用户只能看到院系名列表，价值密度低。
- **修复建议**：
  1. 默认展开第一个院系，让用户立即看到高价值内容；
  2. 院系列表本身显示关键字段摘要：招生人数、最低分、考试科目；
  3. 或改为表格视图，一行一个院系，直接展示核心字段。
- **优先级**：高
- **涉及文件**：`yam-desktop/src/pages/WorkspacePage.tsx`

### E. 院校详情不能再次点击关闭，且同时只能展开一个院校
- **状态**：待处理
- **用户反馈**：点开院校名之后有信息了，但没法再点一次关上；点开别的，这个就会关上，很难受。
- **根因分析**：
  1. `handleToggleExpand` 只绑定在箭头按钮上，院校名不可点击；
  2. `expandedSchoolId` 是单一字符串状态，展开新院校会自动覆盖旧值，无法同时展开多个，也没有「再次点击关闭」的语义（虽然代码里有 `if (expandedSchoolId === id)` 分支，但触发点只在箭头）。
- **修复建议**：
  1. 整行/院校名支持再次点击关闭；
  2. 将 `expandedSchoolId` 改为 `Set<string>`，支持同时展开多个院校；
  3. 提供「展开全部 / 收起全部」的快捷操作。
- **优先级**：高
- **涉及文件**：`yam-desktop/src/pages/WorkspacePage.tsx`

---

## 暂不处理模块

| 模块 | 原因 |
|------|------|
| 导航与全局交互 | 用户确认当前 hover 下拉与前两个点问题不大；返回工作区重置专业的问题在实际测试中未复现。 |
| 专业选择与管理 | 用户确认当前状态可接受，暂不调整。 |
| 导出功能 | 用户要求延后处理，待 ISSUE-028 后续测试时再评估。 |

---

## 关联文档

- `docs/full-ui-test-prompt.md`：UI 测试矩阵与成功标准
- `docs/known-issues.md`：现有 Bug 与修复状态跟踪
- `docs/progress.md`：项目进度与里程碑记录
