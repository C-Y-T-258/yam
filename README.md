# 研喵 YAM

本地优先的考研择校数据工具。

## 快速开始

```bash
pip install kaoyan-yam[ui]
yam serve
```

打开浏览器访问 http://localhost:8080，在启动画面选择专业即可开始使用。

## 功能

- 多专业支持（085410 人工智能等）
- 217 所院校数据（研招网 + 掌上考研双源）
- 院校搜索、筛选（省份/层次/招生人数）
- 院校详情：院系所、历年分数线、招生计划
- 2-3 所院校并排对比
- 收藏关注的院校
- 数据异常提醒（双源交叉校验）
- CSV 导出
- 本地 SQLite 存储，数据不离开你的电脑

## CLI 命令

```bash
yam list-majors              # 列出支持的专业
yam fetch --major 085410     # 抓取数据
yam fetch-plans --major 085410  # 抓取招生计划
yam stats --major 085410     # 查看数据统计
yam audit --major 085410     # 数据审计
yam cross-check --major 085410  # 交叉校验
yam serve                    # 启动 UI（从启动画面选择专业）
```

## 数据来源

- [研招网](https://yz.chsi.com.cn)：院校列表、院系所、招生人数、考试科目
- [掌上考研](https://www.kaoyan.cn)：历年分数线、招生计划

## 免责声明

数据来自公开渠道，仅供学习参考，不保证完全准确。使用本工具产生的任何决策，由用户自行承担责任。

## 许可证

MIT
