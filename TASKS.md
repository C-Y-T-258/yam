# YAM 任务跟踪

## 进行中
- [ ] 任务包 4：数据审计脚本完善

## 待开始
- [ ] 任务包 5：NiceGUI 桌面 UI
- [ ] 任务包 6：打包与发布准备

## 已完成
- [x] 任务包 1：项目骨架搭建
  - [x] pyproject.toml、README、majors.yaml
  - [x] config、utils、storage/db、storage/models
  - [x] crawler/base、yanzhao、zhangshangkaoyan 占位
  - [x] audit、cli 基础命令
  - [x] 安装测试与 CLI 可运行验证
  - [x] 确定项目方向：本地优先、Python + SQLite + NiceGUI
  - [x] 确定名称：YAM / 研喵
  - [x] 确定目录：d:\考研信息整理\yam\
- [x] 任务包 2：研招网数据爬取（院校列表 + 院系所 + 招生人数 + 考试科目）
  - [x] 实现 `YanZhaoCrawler` 抓取院系、招生人数、考试科目
  - [x] 实现 `DynamicYanZhaoCrawler` + `fetch-seeds` 命令，支持登录后翻页更新种子
  - [x] 种子文件已补齐至 217 所
- [x] 任务包 3：掌上考研分数线爬取（2023–2026）
  - [x] 实现 `ZhangShangKaoYanCrawler`（schoolScore / schoolList）
  - [x] 接入 CLI fetch 流程，支持 `--skip-scores`
  - [x] 本地 school_id 缓存
  - [x] 全量跑通（217 所种子院校）
  - [x] 数据：514 个院系，约 2200+ 条分数线，约 190 所院校有分数线
- [x] 任务包 4：数据审计与招生计划补全
  - [x] 实现掌上考研招生计划抓取（`fetch-plans`）
  - [x] 增强 `audit` 命令：覆盖度、来源追溯、数值合理性、一致性、重复、失败
  - [x] 修复南京理工大学 school_id 为空导致的数据不一致
  - [x] 数据：招生计划覆盖 208 所院校

## 已知问题
- 掌上考研未收录部分院校，导致无分数线/无招生计划（如中国矿业大学(北京)、中国石油大学(北京)、湖州师范学院等）
- 掌上考研接口偶发"专硕获取国家线数据异常"（武汉大学、北方民族大学）
- `fetch-seeds` 代码已实现，但登录流程需在用户环境手动验证
