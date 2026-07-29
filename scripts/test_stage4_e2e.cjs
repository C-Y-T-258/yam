// 阶段 4 核心链路 Tauri CDP E2E（非破坏：收藏状态测试后恢复）
const WebSocket = require('../yam-desktop/node_modules/ws');
const http = require('http');

const CDP_PORT = 9223;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function connect() {
  const targets = await getTargets();
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!page) throw new Error('未找到 Tauri 页面');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 1;
    const pending = new Map();
    ws.on('message', (message) => {
      const payload = JSON.parse(message.toString());
      if (!payload.id || !pending.has(payload.id)) return;
      const { resolve: done, reject: fail } = pending.get(payload.id);
      pending.delete(payload.id);
      payload.error ? fail(payload.error) : done(payload.result);
    });
    ws.on('error', reject);
    ws.on('open', async () => {
      const send = (method, params = {}) => new Promise((done, fail) => {
        const current = id++;
        pending.set(current, { resolve: done, reject: fail });
        ws.send(JSON.stringify({ id: current, method, params }));
      });
      await send('Runtime.enable');
      resolve({
        async eval(expression, awaitPromise = true) {
          const result = await send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise,
            userGesture: true,
          });
          if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
          return result.result?.value;
        },
        async invoke(command, args = {}) {
          const value = await this.eval(`(async () => {
            try {
              return JSON.stringify({ ok: true, value: await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)}) });
            } catch (error) {
              return JSON.stringify({ ok: false, error: String(error) });
            }
          })()`);
          const parsed = JSON.parse(value);
          if (!parsed.ok) throw new Error(`${command}: ${parsed.error}`);
          return parsed.value;
        },
        close() { ws.close(); },
      });
    });
  });
}

(async () => {
  const api = await connect();
  let toggledPlan = null;
  let originalFavorite = false;
  try {
    const majors = await api.invoke('fetch_available_majors');
    assert(Array.isArray(majors) && majors.length > 0, '应至少有一个已同步专业');
    const target = majors.find((item) => item.major_code === '081200') || majors[0];
    const majorCode = target.major_code;
    console.log(`专业：${majorCode}，学校数：${target.school_count}`);

    const plans = await api.invoke('fetch_workspace_plans', {
      majorCodes: [majorCode], province: null, provinces: null, regionGroup: null,
      levels: null, sortBy: 'research_direction', sortOrder: 'asc',
      minScoreMin: null, minScoreMax: null, enrollCountMin: null, enrollCountMax: null,
      departmentName: null, researchDirection: null, studyModes: null, examTypes: null,
      selfScoring: null, doctoralProgram: null, doubleFirstClass: null, specialPlans: null,
      englishMin: null, englishMax: null, businessOneMin: null, businessOneMax: null,
      businessTwoMin: null, businessTwoMax: null, foreignSubjects: null,
      businessOneSubjects: null, businessTwoSubjects: null,
    });
    assert(plans.length > 0, '计划查询不应为空');
    const plan = plans[0];
    assert(plan.plan_key && !plan.plan_key.startsWith('legacy:'), '计划应使用稳定 plan_key');
    assert(plan.source_department_id, '计划应保留源院系 ID');
    assert(plan.department_source && plan.department_updated_at, '计划来源元数据应完整');
    assert(plan.school_source && plan.school_updated_at, '院校来源元数据应完整');
    assert(plan.years.length > 0, '计划应有年份数据');
    assert(plan.years[0].score_scope && plan.years[0].source, '年份分数可信度元数据应完整');
    console.log(`计划：${plan.school_name} / ${plan.department_name} / ${plan.plan_key.slice(0, 12)}...`);

    const filtered = await api.invoke('fetch_workspace_plans', {
      majorCodes: [majorCode], province: null, provinces: null, regionGroup: null,
      levels: null, sortBy: 'department_name', sortOrder: 'asc',
      minScoreMin: null, minScoreMax: null, enrollCountMin: null, enrollCountMax: null,
      departmentName: plan.department_name.slice(0, 2), researchDirection: null,
      studyModes: null, examTypes: null, selfScoring: null, doctoralProgram: null,
      doubleFirstClass: null, specialPlans: null, englishMin: null, englishMax: null,
      businessOneMin: null, businessOneMax: null, businessTwoMin: null, businessTwoMax: null,
      foreignSubjects: null, businessOneSubjects: null, businessTwoSubjects: null,
    });
    assert(filtered.some((item) => item.plan_key === plan.plan_key), '院系关键词筛选应包含目标计划');

    const favoritesBefore = await api.invoke('fetch_plan_favorites');
    const stableKey = (item) => JSON.stringify([item.school_id, item.major_code, item.department_name, item.research_direction, item.exam_subjects]);
    originalFavorite = favoritesBefore.some((item) => stableKey(item) === stableKey(plan));
    toggledPlan = plan;
    await api.invoke('toggle_plan_favorite', {
      schoolId: plan.school_id, schoolName: plan.school_name, majorCode: plan.major_code,
      departmentName: plan.department_name, researchDirection: plan.research_direction,
      examSubjects: plan.exam_subjects, studyMode: plan.study_mode, examType: plan.exam_type,
      specialPlans: plan.special_plans,
    });
    const favoritesAfter = await api.invoke('fetch_plan_favorites');
    const nowFavorite = favoritesAfter.some((item) => stableKey(item) === stableKey(plan));
    assert(nowFavorite !== originalFavorite, '计划收藏切换应改变状态');
    console.log(`计划收藏往返：${originalFavorite} -> ${nowFavorite}`);

    const ui = JSON.parse(await api.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const workspace = buttons.find((button) => button.textContent.includes('数据工作区'));
      if (workspace) workspace.click();
      return JSON.stringify({ title: document.title, body: document.body.textContent.slice(0, 500) });
    })()`, false));
    assert(ui.title.includes('YAM'), '桌面窗口标题应包含 YAM');
    console.log('桌面 WebView UI 可交互');

    console.log('PASS: 阶段 4 Tauri E2E 核心链路');
  } finally {
    if (toggledPlan) {
      const favorites = await api.invoke('fetch_plan_favorites');
      const stableKey = (item) => JSON.stringify([item.school_id, item.major_code, item.department_name, item.research_direction, item.exam_subjects]);
      const currentFavorite = favorites.some((item) => stableKey(item) === stableKey(toggledPlan));
      if (currentFavorite !== originalFavorite) {
        await api.invoke('toggle_plan_favorite', {
          schoolId: toggledPlan.school_id, schoolName: toggledPlan.school_name,
          majorCode: toggledPlan.major_code, departmentName: toggledPlan.department_name,
          researchDirection: toggledPlan.research_direction, examSubjects: toggledPlan.exam_subjects,
          studyMode: toggledPlan.study_mode, examType: toggledPlan.exam_type,
          specialPlans: toggledPlan.special_plans,
        });
      }
    }
    api.close();
  }
})().catch((error) => {
  console.error('FAIL:', error.stack || error);
  process.exit(1);
});
