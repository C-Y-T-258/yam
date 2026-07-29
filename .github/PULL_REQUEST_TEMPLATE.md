## 变更目的

<!-- 解决什么问题，对用户有什么影响？ -->

## 实现与兼容性

<!-- 说明关键实现、数据库/IPC/UI变化、旧数据兼容或回退策略。 -->

## 验证

- [ ] `npm run test:release:auto`
- [ ] 涉及 Python：`python -m compileall -q yam`
- [ ] 涉及真实 Tauri 流程：`npm run test:e2e:stage4`
- [ ] 未提交 Cookie、数据库、日志、安装包或其他用户数据

## 风险与未覆盖项

<!-- 说明失败态、边界条件和后续工作。 -->
