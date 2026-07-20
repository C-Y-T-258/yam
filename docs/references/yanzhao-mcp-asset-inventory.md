# 两个 MCP 项目资产清单

---

## 一、yanzhao-mcp（研招网 MCP）

路径：`D:\tools\yanzhao-mcp\`

### 1.1 代码文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `main.py` | 530 | MCP Server 入口，注册 22 个工具 |
| `yanzhao_scraper.py` | 749 | 核心爬虫，API 调用逻辑 |
| `yanzhao_searcher.py` | 528 | 搜索器：暴力搜索、关键词搜索、详情获取 |
| `dynamic_reader.py` | 307 | Playwright 浏览器自动化 |
| `yanzhao_login.py` | 275 | CAS 登录模块 |
| `test_mcp_tools.py` | - | MCP 工具测试 |

### 1.2 数据文件

| 文件 | 大小 | 内容 |
|------|------|------|
| `all_217_schools.json` | 74KB | 217 所院校基础信息 |
| `all_school_details.json` | 559KB | 532 条招生详情 |
| `cookies.json` | 7KB | 研招网登录 cookies |

### 1.3 22 个 MCP 工具

#### 通用网页读取（3 个）

| 工具 | 说明 |
|------|------|
| `read_dynamic_page` | 读取 JS 动态加载的网页 |
| `read_page_with_actions` | 带交互操作的页面读取 |
| `extract_page_content` | CSS 选择器提取内容 |

#### 研招网数据抓取（8 个）

| 工具 | 说明 |
|------|------|
| `query_yanzhao_directory` | 查询专业目录（zydws.do） |
| `get_yanzhao_school_detail` | 获取学校详情（HTML 页面） |
| `get_yanzhao_exam_subjects` | 获取考试科目范围 |
| `batch_query_yanzhao` | 批量查询专业目录 |
| `get_yanzhao_full_data` | 从 Vue 实例提取招生数据 |
| `get_yanzhao_school_departments` | 获取某校院系所和招生人数 |
| `batch_get_yanzhao_details` | 批量获取院系所和招生人数 |
| `get_yanzhao_major_details` | 获取某校专业详细招生信息 |
| `batch_get_yanzhao_major_details` | 批量获取所有学校详细招生信息 |

#### 登录管理（3 个）

| 工具 | 说明 |
|------|------|
| `yanzhao_login_browser` | 打开浏览器手动登录，保存 cookies |
| `yanzhao_verify_login` | 验证当前 cookies 是否有效 |
| `yanzhao_ensure_login` | 确保已登录，过期则触发登录 |

#### 学校搜索（6 个）

| 工具 | 说明 |
|------|------|
| `yanzhao_load_all_schools` | 加载本地 217 所学校列表 |
| `yanzhao_load_all_details` | 加载本地 532 条招生详情 |
| `yanzhao_search_by_school_code` | dwzys.do 按学校代码暴力搜索（aiohttp 并发 15） |
| `yanzhao_search_by_name` | zydws.do 按校名关键词搜索（Playwright） |
| `yanzhao_get_school_details` | yjfxs.do 获取单校详情（无需登录） |
| `yanzhao_batch_get_details` | yjfxs.do 批量获取详情（无需登录） |
| `yanzhao_merge_and_save` | 合并新学校与本地数据并保存 |

### 1.4 研招网 API 端点

| 端点 | 方法 | 需要登录 | 需要 ZSML session | 说明 |
|------|------|---------|------------------|------|
| `zydws.do` | POST | 是 | 是 | 院校列表，同一参数组合只能调一次 |
| `dwzys.do` | POST | 是（CAS） | 否 | 按学校代码查询，无翻页限制 |
| `yjfxs.do` | POST | 否 | 否 | 院系详情，可高并发 |
| `zys.do` | POST | - | - | 专业签名元数据 |
| `zydetail.do` | GET | - | - | 详情页，用于建立 ZSML session |

#### zydws.do 参数

```
zydm, zymc, dwmc, dwdm, ssdm, xxfs, dwlxs[0], tydxs, jsggjh, start, curPage, pageSize
```

限制：同一参数组合每次登录会话只能成功调用一次。不同 ssdm/dwlxs/tydxs/jsggjh 组合视为不同调用。pageSize 被忽略，固定返回 10 条。

#### dwzys.do 参数

```
dwdm, dwmc, zydm, zycm, xxfs, mldm, yjxkdm, start, pageSize
```

不需要 sign/sign2。返回 1 条记录。高并发（≥20）会封禁。

#### yjfxs.do 参数

```
zydm, dwdm, start, pageSize
```

无需登录。返回院系、招生人数、研究方向、考试科目。

### 1.5 数据采集流程（已验证）

```
193 所（zydws.do 省份扫描）
  + 19 所（zydws.do 校名关键词搜索，Playwright）
  +  5 所（dwzys.do 学校代码暴力遍历，aiohttp 并发 15）
  = 217 所（完整列表）

532 条详情（yjfxs.do 批量获取，无需登录）
```

### 1.6 认证流程

```
1. Playwright 打开 https://yz.chsi.com.cn/zsml/
2. 调用 zys.do 获取 sign/sign2
3. 访问 zydetail.do 建立 ZSML session
4. 提取 cookies（关键：CASTGC + JSESSIONID）
5. 转用 requests.Session 或 aiohttp 调用 API
```

关键 Cookie：
- `CASTGC`（account.chsi.com.cn 域）：CAS 登录票据
- `JSESSIONID`（path=/zsml）：ZSML 应用 session
- `JSESSIONID`（path=/）：主站点 session

### 1.7 搜索策略详情

#### 策略 A：zydws.do 省份扫描

- 文件：`yanzhao_scraper.py`
- 流程：访问 zydetail.do → 提取 cookies → 对 34 个省份调用 zydws.do
- 结果：193 所

#### 策略 B：zydws.do 校名关键词搜索

- 文件：`yanzhao_searcher.py:263-379`
- 关键词：大学、学院、研究院、研究所、理工、工业、科技、师范、农业、医学、财经、政法、民族、航空、航天、军事、交通、邮电、建筑、工程、科学、电子、信息、机械、中国、北方、南方、华东、华南、华北、华中、西南、东南、东北、西北、首都、市、省（38 个）
- 流程：每个省份 × 每个关键词调用一次 zydws.do，每完成一个省份重新访问 zydetail.do 刷新 session
- 结果：+19 所

#### 策略 C：dwzys.do 学校代码暴力遍历

- 文件：`yanzhao_searcher.py:157-259`
- 遍历范围：`10001-19999`（普通高校）、`80001-82999`（科研院所）、`90001-92999`（军事院校）
- 参数：并发 15，批大小 150，批间 sleep 0.05 秒，单请求超时 15 秒，失败重试 3 次（间隔 0.5 秒）
- 结果：+5 所

### 1.8 开发历程关键发现

| 发现 | 说明 |
|------|------|
| zydws.do 需要 ZSML session | CAS 登录成功后仍返回"请登录"，因为需要 path=/zsml 的 JSESSIONID |
| dwzys.do 不需要 ZSML session | 只需 CAS 登录即可调用 |
| yjfxs.do 无需登录 | 可高并发批量获取详情 |
| zydws.do 每参数组合只能调一次 | 不同 ssdm/dwlxs/tydxs/jsggjh 组合视为不同调用 |
| dwzys.do 高并发会封禁 | 并发 ≥20 全部失败 |
| 两个 JSESSIONID 冲突 | path=/zsml 和 path=/ 的 JSESSIONID 可能冲突 |

---

## 二、zhangshangkaoyan-mcp（掌上考研 MCP）

路径：`D:\tools\zhangshangkaoyan-mcp\`

### 2.1 代码文件

| 文件 | 大小 | 说明 |
|------|------|------|
| `kaoyan_client.py` | 5KB | API 客户端，封装 4 个接口 |
| `server.py` | 5KB | MCP Server 入口，注册 5 个工具 |
| `pyproject.toml` | - | 包配置 |
| `requirements.txt` | - | 依赖：httpx, mcp |

### 2.2 5 个 MCP 工具

| 工具 | 说明 |
|------|------|
| `search_schools` | 按省份/类型/名称搜索院校列表 |
| `get_provinces` | 返回省份代码字典（31 项） |
| `get_admission_plans` | 获取某校招生专业列表（招生计划） |
| `get_plan_detail` | 获取某招生专业的初试科目、参考书目 |
| `get_score_lines` | 获取某校某年复试分数线 |

### 2.3 API 端点

基础 URL：`https://api.kaoyan.cn/pc`

| 端点 | 方法 | 需要登录 | 说明 |
|------|------|---------|------|
| `/school/schoolList` | POST | 否 | 院校列表 |
| `/school/planListV2` | POST | 否 | 招生专业列表 |
| `/school/planDetail` | POST | 否 | 招生专业详情 |
| `/school/schoolScore` | POST | 否 | 复试分数线 |

所有接口无需登录，返回 JSON。

### 2.4 API 参数详情

#### search_schools

```
page, limit(最大50), province_id, type(院校类型), feature(985/211/双一流/自划线), school_name
```

返回：`{total, data: [{school_id, school_name, is_985, is_211, is_zihuaxian, province_name, major_number, recruit_number, ...}]}`

#### get_admission_plans

```
school_id, keyword, degree_type(1=专硕/2=学硕), recruit_type(1=全日制/2=非全日制), page, limit
```

返回：`{total, data: [{plan_id, spe_id, special_code, special_name, depart_name, recruit_number, degree_type_name, recruit_type_name, exam_class_name, year, ...}]}`

#### get_plan_detail

```
school_id, plan_id, spe_id, year(默认2026)
```

返回：单个 dict，含 exam_class_name、exam_book、政治/英语/专业课科目代码与名称、备注。

#### get_score_lines

```
school_id, year(必填), page, limit
```

返回：`[{school_name, depart_name, code, name, total, politics, english, special_one, special_two, degree_type, year, note, ...}]`

### 2.5 省份代码

31 个省级行政区（不含港澳台）：

```
11=北京, 12=天津, 13=河北, 14=山西, 15=内蒙古,
21=辽宁, 22=吉林, 23=黑龙江, 31=上海, 32=江苏,
33=浙江, 34=安徽, 35=福建, 36=江西, 37=山东,
41=河南, 42=湖北, 43=湖南, 44=广东, 45=广西,
46=海南, 50=重庆, 51=四川, 52=贵州, 53=云南,
54=西藏, 61=陕西, 62=甘肃, 63=青海, 64=宁夏,
65=新疆
```

### 2.6 典型调用链

```
search_schools(province_id="11")
  → school_id
    → get_admission_plans(school_id=5)
      → plan_id, spe_id
        → get_plan_detail(school_id=5, plan_id=..., spe_id=...)
    → get_score_lines(school_id=5, year=2024)
```

---

## 三、两个 MCP 对比

| 维度 | yanzhao-mcp | zhangshangkaoyan-mcp |
|------|-------------|---------------------|
| 数据源 | 研招网（yz.chsi.com.cn） | 掌上考研（kaoyan.cn） |
| 需要登录 | 是（CAS） | 否 |
| 工具数量 | 22 | 5 |
| 数据深度 | 院系、招生人数、研究方向、考试科目 | 招生计划、考试科目、分数线 |
| 数据广度 | 217 所（085410 人工智能） | 全专业、全院校 |
| 并发限制 | zydws.do 严格，dwzys.do 中等 | 无明显限制 |
| 代码复杂度 | 高（Playwright + aiohttp + CAS） | 低（httpx 直调） |
| 维护状态 | 2026-07-02 最后更新 | 2026-07-05 最后更新 |

---

## 四、YAM 项目中已集成的部分

YAM（`D:\yam`）已集成的 MCP 工具：

| 来源 | 工具 | 集成位置 |
|------|------|---------|
| zhangshangkaoyan-mcp | search_schools, get_provinces, get_admission_plans, get_plan_detail, get_score_lines | `zhangshangkaoyan.py` |
| yanzhao-mcp | yanzhao_load_all_schools, yanzhao_load_all_details, yanzhao_search_by_school_code, yanzhao_search_by_name, yanzhao_get_school_details, yanzhao_batch_get_details, yanzhao_merge_and_save | `dynamic.py`（部分） |

YAM 未集成的 yanzhao-mcp 工具：

| 工具 | 说明 |
|------|------|
| read_dynamic_page | 通用网页读取 |
| read_page_with_actions | 交互式页面读取 |
| extract_page_content | CSS 选择器提取 |
| query_yanzhao_directory | 专业目录查询 |
| get_yanzhao_school_detail | 学校详情 |
| get_yanzhao_exam_subjects | 考试科目 |
| batch_query_yanzhao | 批量查询 |
| get_yanzhao_full_data | Vue 实例数据 |
| get_yanzhao_school_departments | 院系所 |
| batch_get_yanzhao_details | 批量院系所 |
| get_yanzhao_major_details | 专业详情 |
| batch_get_yanzhao_major_details | 批量专业详情 |
| yanzhao_login_browser | 浏览器登录 |
| yanzhao_verify_login | 验证登录 |
| yanzhao_ensure_login | 确保登录 |

---

## 五、数据文件交叉索引

### yanzhao-mcp 数据

| 文件 | 路径 | 内容 |
|------|------|------|
| `all_217_schools.json` | `D:\tools\yanzhao-mcp\` | 217 所基础信息 |
| `all_school_details.json` | `D:\tools\yanzhao-mcp\` | 532 条详情 |
| `cookies.json` | `D:\tools\yanzhao-mcp\` | 登录 cookies |

### 考研信息整理项目数据

| 文件 | 路径 | 内容 |
|------|------|------|
| `schools_detail.json` | `D:\考研信息整理\data\` | 217 所整合数据 |
| `yan_zhao_085410_all_regions.json` | `D:\考研信息整理\data\` | 193 所省份扫描结果 |
| `all_school_details.json` | `D:\考研信息整理\data\` | 532 条详情副本 |
| `score_lines_2023~2026.json` | `D:\考研信息整理\data\` | 历年分数线 |
| `university_levels.json` | `D:\考研信息整理\data\` | 985/211/双一流分类 |
| `schools_北京.json` ~ `schools_云南.json` | `D:\考研信息整理\data\` | 各省院校列表 |

### YAM 项目数据

| 文件 | 路径 | 内容 |
|------|------|------|
| `yan_zhao_085410_all_regions.json` | `D:\yam\data\seeds\` | 193 所种子数据 |
| `yan_zhao_081200_all_regions.json` | `D:\yam\data\seeds\` | 081200 计算机科学与技术 |
| `majors.yaml` | `D:\yam\data\` | 专业配置 |
