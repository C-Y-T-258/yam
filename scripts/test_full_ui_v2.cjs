// YAM 桌面端全流程 UI 测试 v2（M1-M11）
// 适配当前 UI：默认招生计划视图、div grid 院校视图、导出下拉菜单
const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CDP_PORT = 9223;
const SHOT_DIR = path.join(__dirname, 'screenshots', 'full-ui-' + new Date().toISOString().slice(0,10).replace(/-/g,''));
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
    // 若存在多个 page target，取最后一个（通常是最新的 active WebView）
    const pages = targets.filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
    const page = pages[pages.length - 1];
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
          pending.set(cur, {res: r => resolve(r.result?.value ?? JSON.stringify(r)), rej: reject});
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
    ws.on('open', async () => {
      await new Promise((res, rej) => { const cur = id++; pending.set(cur, {res, rej}); ws.send(JSON.stringify({ id: cur, method: 'Runtime.enable' })); });
      await new Promise((res, rej) => { const cur = id++; pending.set(cur, {res, rej}); ws.send(JSON.stringify({ id: cur, method: 'Page.enable' })); });
      await api.eval('1+1', false);
      resolve(api);
    });
    ws.on('error', (e) => reject(new Error('WS error: ' + e.message)));
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function clickByText(api, text, exact = false) {
  return api.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button,a'));
    const t = ${JSON.stringify(text)};
    const matches = exact ? btns.filter(b => b.textContent.trim() === t) : btns.filter(b => b.textContent.trim().includes(t));
    const target = matches[matches.length - 1];
    if (target) {
      target.scrollIntoView({block:'center'});
      // 模拟真实鼠标点击序列（TopNav 等自定义 onClick 需要 mousedown/mouseup/click）
      target.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, buttons:1}));
      target.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true, buttons:1}));
      target.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
      target.click();
      return 'clicked';
    }
    return 'NOT_FOUND|avail=' + btns.map(b=>b.textContent.trim().slice(0,20)).filter(Boolean).slice(0,15).join(',');
  })()`, false);
}

async function clickBySelector(api, selector) {
  return api.eval(`(() => {
    const b = document.querySelector(${JSON.stringify(selector)});
    if (b) { b.scrollIntoView({block:'center'}); b.click(); return 'clicked'; }
    return 'NOT_FOUND';
  })()`, false);
}

async function bodyText(api) { return api.eval('document.body.innerText', false); }

async function getResultCount(api) {
  const m = await api.eval(`(() => { const t = document.body.innerText; const m = t.match(/共[\\s\\u00A0]*([\\d,]+)[\\s\\u00A0]*条结果/); return m ? m[1] : ''; })()`, false);
  return m ? parseInt(m.replace(/,/g,''), 10) : 0;
}

async function countVisibleRows(api) {
  const n = await api.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      const classes = cls.split(/\\s+/).filter(Boolean);
      return cls.includes('grid-cols-') && cls.includes('border-b') && !classes.includes('bg-gray-50');
    });
    return rows.length;
  })()`, false);
  return Number(n);
}

async function waitForRows(api, min = 1, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const n = await countVisibleRows(api);
    if (n >= min) return n;
    await sleep(400);
  }
  return 0;
}

async function waitResultCount(api, min = 1, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const n = await getResultCount(api);
    if (n >= min) return n;
    await sleep(400);
  }
  return 0;
}

async function switchToSchoolView(api) {
  await clickByText(api, '院校视图', true);
  await sleep(2000);
}

async function switchToPlanView(api) {
  await clickByText(api, '招生计划视图', true);
  await sleep(2000);
}

const results = [];
const uxIssues = [];
function pass(module, name, ok, detail = '') { results.push({ module, name, ok, detail }); }
function uxIssue(module, dim, sev, desc, repro, suggest) { uxIssues.push({ module, dim, sev, desc, repro, suggest }); }

(async () => {
  const api = await connect();
  console.log('connected');

  // =============== M1 ===============
  console.log('M1 start');
  const majors = await api.invoke('fetch_available_majors');
  const m1Ok = Array.isArray(majors) && majors.length >= 1 && majors.some(m => (m.code || m.major_code || '').startsWith('081200'));
  pass('M1', 'fetch_available_majors 非空且含 081200', m1Ok, `count=${Array.isArray(majors)?majors.length:'-'}`);
  await api.screenshot('01-init');

  // =============== M2 导航切换 ===============
  console.log('M2 start');
  const navItems = [
    { text: '专业管理', feature: '专业管理' },
    { text: '数据采集', feature: '数据采集' },
    { text: '工作区', feature: '院校视图' },
    { text: '设置', feature: '更新专业目录' },
    { text: '帮助', feature: '帮助' }
  ];
  for (const nav of navItems) {
    await clickByText(api, nav.text, true);
    await sleep(1800);
    const txt = await bodyText(api);
    pass('M2', `导航 ${nav.text} 切换`, txt.includes(nav.feature), nav.text);
    await api.screenshot(`02-nav-${nav.text}`);
  }
  await clickByText(api, '工作区', true);
  await sleep(1500);

  // =============== M3 工作区下拉 ===============
  console.log('M3 start');
  await api.eval(`(() => {
    const nav = Array.from(document.querySelectorAll('button,a')).find(b => b.textContent.trim() === '工作区');
    if (nav) { nav.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true})); return 'hovered'; }
    return 'NF';
  })()`, false);
  await sleep(1000);
  await api.screenshot('03-dropdown-hover');
  // 点收藏
  await clickByText(api, '收藏', true);
  await sleep(1500);
  const favPageTxt = await bodyText(api);
  pass('M3', '下拉/收藏页可进入', favPageTxt.includes('收藏') || favPageTxt.includes('暂无收藏'), '收藏');
  await api.screenshot('03-favorites');
  await clickByText(api, '工作区', true);
  await sleep(1200);

  // =============== M4 院校视图 ===============
  console.log('M4 start');
  await switchToSchoolView(api);
  await clickByText(api, '计算机科学与技术', true);
  await sleep(4000);
  const schoolTotal = await waitResultCount(api, 1, 10000);
  const visibleRows = await waitForRows(api, 1, 10000);
  const schoolBackend = await api.invoke('fetch_workspace_data', { schoolId: '', majorCodes: ['081200'] });
  const schoolBackendCount = schoolBackend?.schools?.length || 0;
  pass('M4.1', '院校视图渲染', visibleRows > 0 && schoolTotal > 0 && schoolBackendCount > 0, `visible=${visibleRows} totalText=${schoolTotal} backend=${schoolBackendCount}`);
  await api.screenshot('04-1-school-list');

  // M4.2 多选
  await clickByText(api, '全部', true);
  await sleep(1000);
  await clickByText(api, '计算机科学与技术', true);
  await sleep(800);
  await clickByText(api, '软件工程', true);
  await sleep(3000);
  const multiBadge = await api.eval(`document.body.innerText.includes('个专业')`, false);
  pass('M4.2', '多专业选择徽标', multiBadge === true);
  await api.screenshot('04-2-multi-major');
  await clickByText(api, '全部', true);
  await sleep(1000);
  await clickByText(api, '计算机科学与技术', true);
  await sleep(3000);

  // M4.3 搜索
  await api.eval(`(() => {
    const i = Array.from(document.querySelectorAll('input')).find(x => x.placeholder && x.placeholder.includes('搜索'));
    if (i) { i.focus(); i.value='大学'; i.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; }
    return 'NF';
  })()`, false);
  await sleep(2000);
  const searchTotal = await getResultCount(api);
  pass('M4.3', '搜索"大学"过滤', searchTotal > 0 && searchTotal < schoolTotal, `total=${searchTotal}`);
  await api.screenshot('04-3-search');
  // 清空
  await api.eval(`(() => { const i = Array.from(document.querySelectorAll('input')).find(x => x.placeholder && x.placeholder.includes('搜索')); if(i){i.value=''; i.dispatchEvent(new Event('input',{bubbles:true}));} })()`, false);
  await sleep(1500);

  // M4.4 排序
  const sortChanged = await api.eval(`(async () => {
    const selects = Array.from(document.querySelectorAll('select'));
    const sortSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'enroll_count'));
    if (!sortSelect) return 'NO_SORT_SELECT';
    sortSelect.value = 'enroll_count';
    sortSelect.dispatchEvent(new Event('change',{bubbles:true}));
    return 'changed';
  })()`, true, 5000);
  await sleep(1500);
  pass('M4.4', '排序切换', sortChanged === 'changed', sortChanged);
  await api.screenshot('04-4-sort');

  // M4.5 分页
  const pageInfo = await api.eval(`(() => {
    const text = document.body.innerText;
    const m = text.match(/共[\s\u00A0]*([\d,]+)[\s\u00A0]*条结果/);
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /^\d+$/.test(t));
    return JSON.stringify({ totalText: m?m[0]:'', pageButtons: buttons.slice(0,8), hasPrev: text.includes('上一页'), hasNext: text.includes('下一页') });
  })()`, false);
  pass('M4.5', '分页信息存在', pageInfo.includes('条结果'), pageInfo);
  await api.screenshot('04-5-page');

  // M4.6 展开院校详情
  const expanded = await api.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      const classes = cls.split(/\\s+/).filter(Boolean);
      return cls.includes('grid-cols-') && cls.includes('border-b') && !classes.includes('bg-gray-50');
    });
    if (!rows.length) return 'NO_ROW';
    const lastCell = rows[0].children[rows[0].children.length - 1];
    const btn = lastCell.querySelector('button') || lastCell;
    btn.scrollIntoView({block:'center'});
    btn.click();
    return 'clicked';
  })()`, false);
  await sleep(3000);
  const expandTxt = await bodyText(api);
  pass('M4.6', '展开院校详情', expandTxt.includes('研究方向') || expandTxt.includes('考试科目'), expanded);
  await api.screenshot('04-6-expand');
  await clickByText(api, '历年分析', false);
  await sleep(1500);
  await api.screenshot('04-6-history');

  // =============== M5 招生计划视图 ===============
  console.log('M5 start');
  await switchToPlanView(api);
  await clickByText(api, '计算机科学与技术', true);
  await sleep(4000);
  const planTotal = await waitResultCount(api, 1, 10000);
  const planBackend = await api.invoke('fetch_workspace_plans', { majorCodes: ['081200'] });
  const planBackendCount = Array.isArray(planBackend) ? planBackend.length : (planBackend?.data?.length || 0);
  pass('M5', '招生计划视图数据', planTotal > 0 && planBackendCount > 0, `totalText=${planTotal} backend=${planBackendCount}`);
  await api.screenshot('05-plan-list');

  await api.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      const classes = cls.split(/\\s+/).filter(Boolean);
      return cls.includes('grid-cols-') && cls.includes('border-b') && !classes.includes('bg-gray-50');
    });
    if (!rows.length) return 'NO_ROW';
    const lastCell = rows[0].children[rows[0].children.length - 1];
    const btn = lastCell.querySelector('button') || lastCell;
    btn.click();
    return 'clicked';
  })()`, false);
  await sleep(2000);
  await api.screenshot('05-plan-expand');

  // =============== M6 筛选面板 ===============
  console.log('M6 start');
  await switchToSchoolView(api);
  await sleep(1500);
  const filterBtn = await api.eval(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim().includes('更多筛选'));
    if (b) { b.click(); return 'clicked'; }
    return 'NOT_FOUND';
  })()`, false);
  await sleep(1200);
  await api.screenshot('06-filter-panel');
  pass('M6', '筛选面板展开', filterBtn === 'clicked', filterBtn);

  // =============== M7 收藏 ===============
  console.log('M7 start');
  const firstSchoolRes = await api.invoke('fetch_workspace_data', { schoolId: '', majorCodes: ['081200'] });
  const firstSchool = firstSchoolRes?.schools?.[0];
  if (firstSchool?.school_id) {
    const starClicked = await api.eval(`(() => {
      const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
        const cls = g.className || '';
        const classes = cls.split(/\\s+/).filter(Boolean);
      return cls.includes('grid-cols-') && cls.includes('border-b') && !classes.includes('bg-gray-50');
      });
      if (!rows.length) return 'NO_ROW';
      const star = rows[0].querySelector('svg');
      if (star) { const btn = star.closest('button') || star; btn.click(); return 'clicked'; }
      return 'NO_STAR';
    })()`, false);
    await sleep(1500);
    const favs = await api.invoke('fetch_favorites');
    pass('M7', '收藏添加', Array.isArray(favs) && favs.some(f => f.school_id === firstSchool.school_id), `firstId=${firstSchool.school_id} click=${starClicked}`);
    await api.screenshot('07-fav-on');

    await clickByText(api, '收藏', true);
    await sleep(1500);
    const favTxt = await bodyText(api);
    pass('M7.2', '收藏页显示该院校', favTxt.includes(firstSchool.name), firstSchool.name);
    await api.screenshot('07-fav-page');

    await clickByText(api, '工作区', true);
    await sleep(1500);
    await api.eval(`(() => {
      const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
        const cls = g.className || '';
        const classes = cls.split(/\\s+/).filter(Boolean);
      return cls.includes('grid-cols-') && cls.includes('border-b') && !classes.includes('bg-gray-50');
      });
      if (!rows.length) return 'NO_ROW';
      const star = rows[0].querySelector('svg');
      if (star) { const btn = star.closest('button') || star; btn.click(); return 'clicked'; }
      return 'NO_STAR';
    })()`, false);
    await sleep(1500);
    const favs2 = await api.invoke('fetch_favorites');
    pass('M7.3', '取消收藏', Array.isArray(favs2) && !favs2.some(f => f.school_id === firstSchool.school_id));
  } else {
    pass('M7', '收藏测试', false, '无法获取首行院校');
  }

  // =============== M8 导出（monkey-patch，若弹窗则人工介入） ===============
  console.log('M8 start');
  await switchToSchoolView(api);
  await sleep(1500);
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
  })()`, false);

  async function readCaptured() {
    const captured = await api.eval(`(() => { const arr = window.__capturedInvokes || []; window.__capturedInvokes = []; return JSON.stringify(arr); })()`, false);
    return JSON.parse(captured).pop();
  }

  async function testExport(fmt) {
    const label = fmt === 'csv' ? '导出为 CSV' : fmt === 'excel' ? '导出为 Excel' : '导出为 JSON';
    // 先点"导出"打开下拉
    await clickByText(api, '导出', true);
    await sleep(500);
    await api.screenshot(`08-export-menu-${fmt}`);
    await clickByText(api, label, true);
    await sleep(800);
    return await readCaptured();
  }

  let r = await testExport('csv');
  pass('M8.1', '院校 CSV', r?.cmd === 'export_file' && r?.args?.ext === 'csv' && String(r?.args?.content).startsWith('\uFEFF'), '院校CSV');
  r = await testExport('excel');
  pass('M8.2', '院校 Excel', r?.cmd === 'export_excel' && r?.args?.sheetName === '院校列表' && r?.args?.headers?.length === 13, '院校Excel');
  r = await testExport('json');
  let jp; try { jp = JSON.parse(r?.args?.content); } catch(e) {}
  pass('M8.3', '院校 JSON', r?.cmd === 'export_file' && r?.args?.ext === 'json' && jp?.view_mode === 'school', '院校JSON');

  await switchToPlanView(api);
  await sleep(1500);
  r = await testExport('csv');
  pass('M8.4', '计划 CSV', r?.cmd === 'export_file' && r?.args?.ext === 'csv', '计划CSV');
  r = await testExport('excel');
  pass('M8.5', '计划 Excel', r?.cmd === 'export_excel' && r?.args?.sheetName === '招生计划' && r?.args?.headers?.length === 15, '计划Excel');
  r = await testExport('json');
  try { jp = JSON.parse(r?.args?.content); } catch(e) {}
  pass('M8.6', '计划 JSON', r?.cmd === 'export_file' && r?.args?.ext === 'json' && jp?.view_mode === 'plan', '计划JSON');

  await api.eval(`(() => { if (window.__origInvoke) { window.__TAURI_INTERNALS__.invoke = window.__origInvoke; delete window.__origInvoke; } delete window.__capturedInvokes; return 'restored'; })()`, false);

  // =============== M9 最近查看 ===============
  console.log('M9 start');
  await switchToSchoolView(api);
  await sleep(1500);
  await api.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      const classes = cls.split(/\\s+/).filter(Boolean);
      return cls.includes('grid-cols-') && cls.includes('border-b') && !classes.includes('bg-gray-50');
    });
    if (!rows.length) return 'NO_ROW';
    const lastCell = rows[0].children[rows[0].children.length - 1];
    const btn = lastCell.querySelector('button') || lastCell;
    btn.click();
    return 'clicked';
  })()`, false);
  await sleep(3000);
  const recent = await api.invoke('fetch_recent_views');
  pass('M9', '最近查看记录', Array.isArray(recent) && recent.length > 0, `count=${Array.isArray(recent)?recent.length:0}`);
  await clickByText(api, '最近查看', true);
  await sleep(1500);
  await api.screenshot('09-recent');

  // =============== M10 设置页 ===============
  console.log('M10 start');
  await clickByText(api, '设置', true);
  await sleep(2000);
  const settingsTxt = await bodyText(api);
  pass('M10', '设置页渲染', settingsTxt.includes('更新专业目录') && settingsTxt.includes('检查状态'), 'settings');
  await api.screenshot('10-settings');

  // =============== M11 空状态 ===============
  console.log('M11 start');
  await clickByText(api, '专业管理', true);
  await sleep(2000);
  await api.eval(`(() => {
    const checks = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(c => c.checked);
    checks.forEach(c => { c.click(); });
    return 'unchecked ' + checks.length;
  })()`, false);
  await sleep(1200);
  await clickByText(api, '工作区', true);
  await sleep(2500);
  const emptyTxt = await bodyText(api);
  const emptyOk = emptyTxt.includes('未选择显示专业') || emptyTxt.includes('暂无专业数据') || emptyTxt.includes('请选择专业') || emptyTxt.includes('管理显示专业');
  pass('M11', '空状态提示', emptyOk, emptyTxt.slice(0,120));
  await api.screenshot('11-empty');

  // 恢复
  await clickByText(api, '专业管理', true);
  await sleep(1500);
  await api.eval(`(() => {
    const firstUnchecked = Array.from(document.querySelectorAll('input[type="checkbox"]')).find(c => !c.checked);
    if (firstUnchecked) firstUnchecked.click();
    return 'restored';
  })()`, false);
  await sleep(1000);

  // =============== 汇总 ===============
  console.log('\n========== 测试结果 ==========');
  let ok = 0, fail = 0;
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    if (r.ok) ok++; else fail++;
    console.log(`${icon} [${r.module}] ${r.name} ${r.detail ? '| ' + r.detail : ''}`);
  }
  console.log(`\n通过: ${ok}  失败: ${fail}`);
  console.log(`截图目录: ${SHOT_DIR}`);
  fs.writeFileSync(path.join(SHOT_DIR, 'results.json'), JSON.stringify({ results, uxIssues, shotDir: SHOT_DIR }, null, 2));

  await api.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
