<!-- 过期时间：2026-08-24 或下次全流程测试完成后删除。本文件为测试执行提示词，非 bug 跟踪文档。 -->

# YAM 桌面端全流程 UI 测试提示词

> 把本文件全文复制粘贴给一个**有多模态能力**的 AI 会话（能看截图），即可执行全流程 UI 测试。本提示词自包含，不依赖会话历史。

---

## 你的角色与任务

你是 YAM 桌面端测试执行者。YAM 是一个 Tauri 2.x 桌面应用（研招网考研院校数据查询工具），前端 React + Vite，后端 Rust + SQLite + Python 采集。

你的任务：通过 **CDP（Chrome DevTools Protocol）** 对运行中的桌面端做**全流程、全方位** UI 测试，覆盖四层：
1. **功能层**：按钮点击、导航、筛选、分页、导出等交互是否正确
2. **数据层**：UI 显示的数据与 SQLite 数据库 / Tauri 命令直查结果是否一致
3. **视觉层**：截图后由你（多模态）亲自查看，判断布局、对齐、标签、空状态等是否正常
4. **体验层**：在真实操作流程中观察使用体验上的优化点（响应速度、反馈、一致性、容错、可发现性等），这是本次测试的**重点产出之一**

测完输出结构化报告 + 截图证据 + 新发现 bug 清单 + **体验优化建议清单**。

> **重要**：体验问题只能在真实交互中发现，不能脱离测试流程单独观察。你必须在执行每个 M 模块的过程中**主动留意**体验维度（见下方"体验观察维度清单"），发现即记录到体验清单，不要等全部测完再回想。

---

## 关键事实（必须牢记，踩过坑）

| 项 | 值 | 说明 |
|---|---|---|
| **CDP 端口** | **9223** | ⚠️ 不是 9222！项目里某 skill 文档写错了。tauri.conf.json 配置 `--remote-debugging-port=9223` |
| 桌面端工作目录 | `d:\yam\yam-desktop` | 启动命令在此目录执行 |
| 启动命令 | `npm run tauri dev` | debug 模式才会开 CDP；release 不开 |
| 前端 dev URL | `http://localhost:1420` | CDP 页面 url 含此地址 |
| 数据库路径 | `~/.yam/data/yam-desktop.db` | SQLite，可用 `sqlite3` 直查验证数据 |
| 项目根 | `d:\yam` | 已知 bug 文档在 `docs/known-issues.md` |
| CDP 截图目录 | `d:\yam\scripts\screenshots\` | 自己建子目录存本次测试截图 |
| 已有数据专业 | 081200(计算机)、083500(软件工程)、085410(人工智能)、030100(法学) 等 | 这些专业工作区有数据，可直接测展示层，无需采集 |

**Windows 环境注意**：用 PowerShell。不要用 `&&` 连接命令（PowerShell 不支持），用 `;` 或分开执行。中文输出需 `PYTHONIOENCODING=utf-8`。

---

## 第一步：环境准备

### 1.1 启动桌面端（后台）

在 `d:\yam\yam-desktop` 目录后台启动：

```powershell
npm run tauri dev
```

首次编译较慢（cargo build + vite），可能 2-5 分钟。**用后台运行方式启动**，不要阻塞会话。

### 1.2 轮询 CDP 端口就绪

```powershell
# 反复执行直到返回 JSON 数组
Invoke-WebRequest -Uri "http://localhost:9223/json" -UseBasicParsing
```

返回的 JSON 数组里找一个 `url` 含 `localhost:1420` 或 `tauri://localhost` 的 `type=page` 条目，记下它的 `webSocketDebuggerUrl`。

### 1.3 确认数据存在

连接前先确认数据库里有数据（避免测了半天发现是空库）：

```powershell
sqlite3 "$env:USERPROFILE\.yam\data\yam-desktop.db" "SELECT major_code, COUNT(*) FROM schools GROUP BY major_code;"
```

应看到 081200/083500/085410/030100 等专业各有几十到几百条。若库为空，停止测试，报告"数据库未初始化"。

---

## CDP 连接模板（直接复制使用）

把以下代码存为 `d:\yam\scripts\test-full-ui.cjs`，后续所有测试基于此模板扩展。依赖 `ws` 包在 `d:/yam/yam-desktop/node_modules/ws`。

```javascript
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');

const CDP_PORT = 9223;
const SHOT_DIR = path.join(__dirname, 'screenshots', 'full-ui-' + Date.now());
fs.mkdirSync(SHOT_DIR, { recursive: true });

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

function connect() {
  return new Promise(async (resolve, reject) => {
    const targets = await getTargets();
    const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!page) return reject(new Error('NO PAGE TARGET'));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.setMaxListeners(50);
    let id = 1;
    const pending = new Map();
    ws.on('message', (m) => {
      const o = JSON.parse(m.toString());
      if (o.id && pending.has(o.id)) { const {res, rej} = pending.get(o.id); pending.delete(o.id); o.error ? rej(o.error) : res(o.result); }
    });
    const api = {
      eval(expr, awaitPromise = false, timeout = 15000) {
        return new Promise((resolve, reject) => {
          const cur = id++;
          pending.set(cur, {res: r => resolve(r.result?.value ?? JSON.stringify(r)), rej});
          ws.send(JSON.stringify({ id: cur, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise, userGesture: true } }));
          setTimeout(() => { if (pending.has(cur)) { pending.delete(cur); resolve('__TIMEOUT__'); } }, timeout);
        });
      },
      async invoke(cmd, args = {}) {
        const r = await this.eval(`(async () => { try { return JSON.stringify(await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})); } catch(e) { return JSON.stringify({__error: String(e)}); } })()`, true, 60000);
        try { return JSON.parse(r); } catch { return r; }
      },
      async screenshot(name) {
        const r = await new Promise((res, rej) => { const cur = id++; pending.set(cur, {res, rej}); ws.send(JSON.stringify({ id: cur, method: 'Page.captureScreenshot', params: { format: 'png' } })); });
        const p = path.join(SHOT_DIR, name + '.png');
        fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
        return p;
      },
      close() { try { ws.close(); } catch {} }
    };
    ws.on('open', async () => { await api.eval('1+1', false); resolve(api); });
    ws.on('error', (e) => reject(new Error('WS error: ' + e.message)));
  });
}

// 便捷点击工具
async function clickByText(api, text, exact = false) {
  return api.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button,a'));
    const t = ${JSON.stringify(text)};
    const target = exact ? btns.find(b => b.textContent.trim() === t) : btns.find(b => b.textContent.trim().includes(t));
    if (target) { target.scrollIntoView({block:'center'}); target.click(); return 'clicked'; }
    return 'NOT_FOUND|avail=' + btns.map(b=>b.textContent.trim().slice(0,20)).filter(Boolean).slice(0,15).join(',');
  })()`, false);
}

async function clickByTitle(api, title) {
  return api.eval(`(() => {
    const b = document.querySelector('button[title=${JSON.stringify(title)}]');
    if (b) { b.scrollIntoView({block:'center'}); b.click(); return 'clicked'; }
    return 'NOT_FOUND';
  })()`, false);
}

// 示例：连接 + 读状态
(async () => {
  const api = await connect();
  console.log('connected');
  const majors = await api.invoke('fetch_available_majors');
  console.log('available majors:', JSON.stringify(majors).slice(0, 300));
  await api.screenshot('00-init');
  api.close();
})().catch(e => { console.error(e.message); process.exit(1); });
```

**运行**：`node d:\yam\scripts\test-full-ui.cjs`

---

## Tauri 命令清单（直接 invoke 调用 Rust 后端）

| 命令 | 参数 | 用途 |
|---|---|---|
| `fetch_available_majors` | 无 | 列出已同步到桌面端的专业（数组） |
| `fetch_workspace_data` | `{ schoolId, majorCode/majorCodes, ...filters }` | 院校视图数据 |
| `fetch_workspace_plans` | `{ majorCodes, ...filters }` | 招生计划视图扁平行 |
| `fetch_workspace_filter_options` | `{ majorCodes }` | 筛选项可选项 |
| `fetch_favorites` | `{ majorCode? }` | 收藏列表 |
| `toggle_favorite` | `{ schoolId, majorCode, majorName }` | 切换收藏 |
| `fetch_recent_views` | `{ majorCode? }` | 最近查看 |
| `add_recent_view` | `{ schoolId, majorCode, majorName }` | 记录最近查看 |
| `sync_workspace_data` | `{ majorCode }` | 从用户库同步到桌面 SQLite |
| `get_crawl_progress` | 无 | 采集状态 |
| `check_login_status` | 无 | 研招网登录态 |
| `get_catalog_update_progress` | 无 | 目录更新进度 |
| `export_file` | `{ defaultFilename, content, ext }` | 导出 CSV/JSON（返回保存路径） |
| `export_excel` | `{ defaultFilename, sheetName, headers, rows }` | 导出 xlsx |

> ⚠️ 参数名用 camelCase（Tauri 自动转 snake_case）。`fetch_workspace_data` 的完整 filters 签名见 `d:\yam\yam-desktop\src\lib\db.ts`。

---

## 测试矩阵

每个 case 记录：**步骤 / 功能断言 / 视觉断言（截图名 + 看点）/ 体验观察 / 结果**。

### 体验观察维度清单（跑每个 case 时对照留意，发现即记入体验清单）

| 维度 | 要看什么 | 典型问题示例 |
|---|---|---|
| **响应延迟** | 点击到反馈的间隔。> 500ms 无反馈就要记，注明大致毫秒数 | 切专业 Tab 后白屏 1.5s 才出数据；展开院校卡顿 |
| **加载态反馈** | 耗时操作有没有 loading/skeleton/禁用态。点了没反应最差 | 点"刷新数据"后按钮没禁用，不知道在跑；表格没骨架屏直接空白 |
| **状态残留** | 切走再回来、切换专业/视图后，筛选/页码/搜索/展开是否该重置未重置 | 切到招生计划视图还留着院校视图的页码；换专业后搜索框还留着旧关键词 |
| **错误反馈** | 失败时用户能否看清发生了什么、能否恢复 | 导出失败只弹一句"导出失败"无原因；采集报错是一长串 traceback |
| **可发现性** | 功能是否难找、有没有提示 | "管理显示专业"入口隐蔽；导出下拉要点小箭头才发现 |
| **一致性** | 同类操作交互模式是否统一 | 院校视图分页在底、计划视图分页位置不同；收藏星标和收藏页操作不一致 |
| **空/边界态** | 空数据、超长文本、极端值、0 分、单结果 | 院校名过长截断无 tooltip；min_score=0 显示成空白；只有 1 条结果还显示分页 |
| **键盘可达** | Tab 导航、回车确认、Esc 关闭 | 搜索框回车不触发；导出菜单打开后 Tab 跑到别处；Esc 关不掉弹层 |
| **信息密度** | 太挤/太疏、关键信息是否突出 | 表格列太多挤一起；最低分这种关键列不够醒目 |
| **文案** | 术语、错别字、歧义、中英混排 | "刷新数据"vs"同步"混用；"暂无专业数据"歧义；按钮文案过长 |
| **动画/过渡** | 动画是否必要、是否干扰、是否卡顿 | framer-motion 动画过多导致切页卡；展开动画挡住点击 |
| **移动/缩放** | 窗口缩放、窄屏下的表现 | 窗口缩到 800 宽表格溢出；侧栏遮挡内容 |

**记录格式**：每条体验问题记为 `{模块: 维度, 严重度: 高/中/低, 现象, 复现步骤, 建议}`。严重度判断：高=影响功能可用性/误导用户；中=明显别扭但不阻塞；低=锦上添花。

### M1 启动与健康检查
- **步骤**：CDP 连接 → `invoke('fetch_available_majors')` → 截图
- **功能断言**：返回数组，长度 ≥ 1，含 081200 等
- **视觉断言**：截图 `01-init.png`，看首屏是否正常渲染（TopNav 可见、无白屏、无报错弹窗）
- **预期**：数组非空，首屏正常

### M2 导航切换
- **步骤**：依次点击 TopNav：`专业管理` → `数据采集` → `工作区` → `设置` → `帮助` → 回 `工作区`。每次点击后等 1s 截图。
- **功能断言**：每次点击后 `document.body.innerText` 含对应页面特征文本（设置页含"更新专业目录"、工作区含"院校视图"等）
- **视觉断言**：截图 `02-nav-*`，看激活态（蓝色下划线）是否正确跟随
- **预期**：5 个导航项均可切换，激活态正确

### M3 工作区下拉菜单
- **步骤**：hover `工作区` 导航项（用 `dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}))`），等下拉出现后依次点 `收藏` / `最近查看` / `工作区`
- **功能断言**：下拉三项文本为 `工作区`/`收藏`/`最近查看`
- **视觉断言**：截图 `03-dropdown.png`，看下拉是否展开
- **预期**：下拉正常显示三项

### M4 院校视图（核心）
前置：在工作区，确保有专业 Tab（如"计算机科学与技术"）。若无，先点"管理显示专业"添加。

#### M4.1 表格渲染
- **步骤**：点 `工作区` → 点专业 Tab `计算机科学与技术`（单选聚焦）→ 等 3s 数据加载
- **功能断言**：`document.querySelectorAll('table tbody tr, [class*="grid"]')` 行数 > 0；表头含"学校名称""院校层次""地区""最低分""招生人数""操作"；调 `invoke('fetch_workspace_data',{schoolId:'',majorCode:'081200',...})` 行数与 UI 一致
- **视觉断言**：截图 `04-1-school-list.png`，看表格对齐、985/211/双一流标签颜色（红/蓝/绿）、最低分列数字
- **预期**：UI 行数 = 命令返回行数

#### M4.2 专业 Tab 切换（多选 toggle）
- **步骤**：点 `全部` → 再点 `计算机科学与技术` → 再点 `软件工程`（多选）
- **功能断言**：多选时出现"已选 N 个"文本；切回单专业时 `aggregatedSchools` 行数变化
- **视觉断言**：截图 `04-2-multi-major.png`，看选中 Tab 蓝色高亮、多专业院校行显示"(N 个专业)"徽标
- **预期**：多选徽标正确显示

#### M4.3 搜索
- **步骤**：在搜索框（placeholder="搜索学校名称"）输入"大学" → 等 500ms
- **功能断言**：表格行数减少，所有行院校名含"大学"
- **视觉断言**：截图 `04-3-search.png`
- **预期**：实时过滤生效

#### M4.4 排序
- **步骤**：通过 WorkspaceFilterPanel 切换 sortBy（min_score/enroll_count/name）和 sortOrder（asc/desc）
- **功能断言**：首行最低分变化符合排序方向
- **视觉断言**：截图 `04-4-sort.png`
- **预期**：排序生效

#### M4.5 分页
- **步骤**：切 pageSize 到 10 → 翻到第 2 页 → 翻回第 1 页
- **功能断言**：底部"共 N 条"文本；页码按钮激活态；上一页/下一页 disabled 状态正确
- **视觉断言**：截图 `04-5-page.png`
- **预期**：分页正确

#### M4.6 展开院校详情
- **步骤**：点第一行的展开按钮（ChevronRight）→ 等加载 → 切换年份 Tab → 点"历年分析"
- **功能断言**：展开后含"研究方向""考试科目"文本；年份 Tab 切换后招生人数/最低分变化；"历年分析"显示表格 + 趋势图 SVG
- **视觉断言**：截图 `04-6-expand.png`（展开初态）、`04-6-year.png`（切年份）、`04-6-history.png`（历年分析+趋势图），看趋势图折线是否绘制
- **预期**：详情正确展开，趋势图渲染

### M5 招生计划视图
- **步骤**：点 `招生计划视图` → 等 2s
- **功能断言**：表头含"院校""专业""院系""研究方向""考试科目""年份""最低分""招生""操作"；调 `invoke('fetch_workspace_plans',{majorCodes:['081200'],...})` 行数与 UI 一致
- **视觉断言**：截图 `05-plan-list.png`
- **步骤**：点某行展开按钮 → 看历年分数表
- **视觉断言**：截图 `05-plan-expand.png`，看展开的历年分数表
- **预期**：计划视图数据与命令一致，展开正常

### M6 筛选面板
- **步骤**：展开 WorkspaceFilterPanel，逐项测试：省份、层次、学习方式、考试方式、自划线、博士点、双一流、特殊计划、单科分数区间
- **功能断言**：每项筛选后 `filteredData.length` 变化且符合筛选条件（用 invoke 直查比对）
- **视觉断言**：截图 `06-filter-*.png`
- **预期**：筛选生效且与后端一致

### M7 收藏
- **步骤**：在工作区点第一行星标 → 切到 `收藏` 页 → 回工作区看星标变黄 → 再点取消
- **功能断言**：点星标后 `invoke('fetch_favorites')` 含该 school_id；收藏页显示该院校；取消后消失
- **视觉断言**：截图 `07-fav-on.png`（星标黄色填充）、`07-fav-page.png`（收藏页列表）
- **预期**：收藏增删一致

### M8 导出（CSV/Excel/JSON × 双视图）
**关键技巧**：用 monkey-patch 拦截 `export_file`/`export_excel`，避免真弹保存对话框卡住。参考 `d:\yam\scripts\test_issue028_cdp.cjs`。

```javascript
// 安装拦截（仅拦截导出命令，其他委托真实 invoke）
await api.eval(`(() => {
  window.__capturedInvokes = [];
  if (!window.__origInvoke) window.__origInvoke = window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke = function(cmd, args, options) {
    if (cmd === 'export_file' || cmd === 'export_excel') {
      window.__capturedInvokes.push({ cmd: String(cmd), args: args || {} });
      const ext = cmd === 'export_excel' ? 'xlsx' : ((args && args.ext) || 'bin');
      return Promise.resolve('C:\\\\fake\\\\test.' + ext);
    }
    return window.__origInvoke(cmd, args, options);
  };
  return 'patched';
})()`);
```

- **步骤**：院校视图下依次点 `导出` → `导出为 CSV` / `导出为 Excel` / `导出为 JSON`；再切招生计划视图重复
- **功能断言**（每个组合）：
  - CSV: cmd=export_file, ext=csv, content 以 BOM `\uFEFF` 开头，含表头"院校代码"
  - Excel: cmd=export_excel, sheetName 为"院校列表"或"招生计划", headers 数组长度正确（院校13/计划15），rows 非空，分数列为 number 类型
  - JSON: cmd=export_file, ext=json, content 是合法 JSON，含 view_mode/rows/row_count
- **视觉断言**：截图 `08-export-menu.png`（下拉菜单展开）
- **清理**：测完恢复 invoke：`window.__TAURI_INTERNALS__.invoke = window.__origInvoke; delete window.__origInvoke;`
- **预期**：6 组合全部拦截到正确参数

### M9 最近查看
- **步骤**：在工作区单专业模式展开某院校（触发 add_recent_view）→ 切 `最近查看` 页
- **功能断言**：`invoke('fetch_recent_views')` 含刚展开的 school_id；最近查看页显示该院校
- **视觉断言**：截图 `09-recent.png`
- **预期**：记录一致

### M10 设置页登录态
- **步骤**：切 `设置` → 点 `检查状态`（不要点"刷新登录"，那会开浏览器）
- **功能断言**：显示"已登录"或"未登录"标签；`invoke('check_login_status')` 返回值与 UI 一致
- **视觉断言**：截图 `10-settings.png`，看登录状态卡片 + 更新专业目录卡片
- **预期**：登录态正确展示

### M11 空状态
- **步骤**：进 `管理显示专业`，把所有专业取消显示 → 回工作区
- **功能断言**：显示"未选择显示专业"或"暂无专业数据"文本；导出/刷新按钮 disabled
- **视觉断言**：截图 `11-empty.png`
- **预期**：空状态正确，按钮正确禁用
- **清理**：恢复至少一个显示专业

### M12（人工介入）目录更新 / 数据采集
这两项依赖研招网登录，**无法全自动**。执行到此时**暂停，用问答框询问用户**是否进行：
- 目录更新：设置页 → 勾"首次需要登录研招网" → 开始更新（耗时 1-2 小时，建议跳过或仅验证按钮可点）
- 数据采集：专业管理 → 选专业 → 采集（需登录态）

若用户选择跳过，仅验证按钮可点击 + 进度组件存在即可，不实际运行。

---

## 已知 bug 清单（不要重复报告）

以下问题项目已知，测试时**不要重复报**（但若发现新表现可补充）：

| ISSUE | 严重程度 | 状态 | 说明 |
|---|---|---|---|
| ISSUE-022 | medium | open | disabled 专业相关，数据层已不可达，留待重新定义方向 |
| ISSUE-028 | low | in-progress | 导出格式扩展（CSV/Excel/JSON）代码已实现，待完整测试 ← **本次测试重点验证此项** |

其余 ISSUE-001~021/023~027/029 均已 fixed。完整清单见 `d:\yam\docs\known-issues.md`。

**已知限制（非 bug，不要报）**：
- 专业学位（0854 等）研招网按一级学科招生，zys.do 返回 totalCount=0 是真实情况
- 9 所科研院所/军事院校掌上考研不公开分数线（如中国航空研究院各所），属数据源限制
- 085400 电子信息 seed 完整但列表 totalCount=0 是真实情况

---

## 报告格式

测完输出 `d:\yam\docs\test-report-YYYYMMDD.md`，结构：

```markdown
# YAM 桌面端全流程测试报告（YYYY-MM-DD）

## 汇总
- 测试时间：
- 桌面端版本：
- 已有数据专业：
- 通过：M1..Mxx 共 N 项
- 失败：Mxx 共 K 项
- 体验问题：共 X 条（高 N / 中 M / 低 L）
- 截图目录：scripts/screenshots/full-ui-xxxx/

## 测试矩阵结果
| 模块 | Case | 结果 | 截图 | 备注 |
|---|---|---|---|---|
| M1 | 启动健康检查 | PASS | 01-init.png |  |
| M4.1 | 院校表格渲染 | PASS | 04-1-school-list.png | 081200 共 267 行 |
| ... | | | | |

## 失败项详情
### Mxx 失败
- 步骤：
- 预期：
- 实际：
- 截图：
- 命令直查结果：
- 建议排查方向：

## 新发现 bug
### NEW-1：xxx
- 严重程度：
- 复现步骤：
- 期望：
- 实际：
- 截图：
- 建议修复：

## 视觉问题（非功能）
- 截图 xx.png：xxx 对齐/颜色/留白问题

## 体验优化建议（重点产出）
按严重度排序。每条含：模块/维度/严重度/现象/复现步骤/建议。

### 高严重度
- [Mxx:维度] 现象描述
  - 复现：
  - 建议：

### 中严重度
- ...

### 低严重度
- ...

## 人工介入项
- 目录更新：用户选择跳过/完成
- 数据采集：用户选择跳过/完成
```

---

## 注意事项

1. **端口是 9223**，不是 9222。若连接失败先 `Invoke-WebRequest http://localhost:9223/json` 确认端口。
2. **每个 case 后截图**，截图是你做视觉断言的依据，也是给用户的证据。
3. **monkey-patch 后必须恢复** invoke，否则后续数据加载失败。测完 M8 立即恢复。
4. **Tauri 命令直查是数据断言的关键**：UI 行数 vs invoke 返回行数 vs SQLite count，三者对齐才算 PASS。
5. **不要实际运行采集/目录更新**（耗时且需登录），除非用户在问答框确认。
6. **测试结束清理**：恢复 invoke（若 patch 残留）、回工作区、关闭后台采集任务（若有）。
7. **遇到 NOT_FOUND**：用 `Array.from(document.querySelectorAll('button,a')).map(b=>b.textContent.trim()).filter(Boolean)` 列出可用按钮再适配选择器，不要硬编码。
8. **Windows GBK 问题**：Python 子进程输出中文需 `PYTHONIOENCODING=utf-8`，但 CDP eval 不受影响。
9. **每步等待**：点击后给 1-3s 渲染时间（framer-motion 动画 + 数据加载），不要立即断言。
10. **报告写 docs/ 下**，文件名 `test-report-YYYYMMDD.md`，标注过期时间 30 天。

---

## 执行顺序建议

M1 → M2 → M3 → M4（核心，耗时最长）→ M5 → M6 → M7 → M8 → M9 → M10 → M11 → M12（人工，最后）

M4 是重点，多花时间。M8 是 ISSUE-028 的验证重点。M12 放最后，避免阻塞。

**体验观察贯穿全程**：每跑一个模块就同步记录体验问题（边测边记，不要事后回想）。全部测完后，把体验清单按严重度（高/中/低）排序整理到报告"体验优化建议"section——这是和测试结果同等重要的产出。

开始执行。每完成一个模块，在报告里记录结果。全部完成后输出报告文件路径。
