// YAM 桌面端全流程 UI 测试（M1-M11）
// 基于 full-ui-test-prompt.md 执行，CDP 端口 9223
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
      // 启用 Runtime 和 Page domain
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

async function bodyText(api) {
  return api.eval('document.body.innerText', false);
}

// 院校视图用 div grid 行，非 table
async function countSchoolRows(api) {
  const n = await api.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      return cls.includes('grid-cols-') && cls.includes('border-b') && !cls.includes('bg-gray-50');
    });
    return rows.length;
  })()`, false);
  return Number(n);
}

async function waitSchoolRows(api, min = 1, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const n = await countSchoolRows(api);
    if (n >= min) return n;
    await sleep(300);
  }
  return 0;
}

async function getGridHeaders(api) {
  return await api.eval(`(() => {
    const header = Array.from(document.querySelectorAll('div.grid')).find(g => (g.className||'').includes('bg-gray-50'));
    return header ? Array.from(header.children).map(c=>c.textContent.trim()).join(',') : '';
  })()`, false);
}

const results = [];
const uxIssues = [];
function pass(module, name, ok, detail = '') { results.push({ module, name, ok, detail }); }
function ux(module, dim, sev, desc, repro, suggest) { uxIssues.push({ module, dim, sev, desc, repro, suggest }); }

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
    await sleep(1500);
    const txt = await bodyText(api);
    pass('M2', `导航 ${nav.text} 切换`, txt.includes(nav.feature), nav.text);
    await api.screenshot(`02-nav-${nav.text}`);
  }
  // 回工作区
  await clickByText(api, '工作区', true);
  await sleep(1500);

  // =============== M3 工作区下拉菜单 ===============
  console.log('M3 start');
  // 尝试 hover 导航上的工作区
  await api.eval(`(() => {
    const nav = Array.from(document.querySelectorAll('button,a')).find(b => b.textContent.trim() === '工作区');
    if (nav) { nav.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true})); return 'hovered'; }
    return 'NAV_NOT_FOUND';
  })()`, false);
  await sleep(800);
  await api.screenshot('03-dropdown-hover');
  // 无论下拉是否出现，直接通过导航文本点"收藏"
  await clickByText(api, '收藏', true);
  await sleep(1200);
  const m3Txt = await bodyText(api);
  pass('M3', '可进入收藏页', m3Txt.includes('收藏') || m3Txt.includes('暂无收藏'), '收藏页');
  await api.screenshot('03-favorites');
  // 返回工作区
  await clickByText(api, '工作区', true);
  await sleep(1200);

  // =============== M4 院校视图 ===============
  console.log('M4 start');
  await clickByText(api, '院校视图', true);
  await sleep(1200);

  // M4.1 表格渲染
  await clickByText(api, '计算机科学与技术', true);
  await sleep(3000);
  const rows = await waitSchoolRows(api, 1, 10000);
  const headers = await getGridHeaders(api);
  const backendRes = await api.invoke('fetch_workspace_data', { schoolId: '', majorCodes: ['081200'] });
  const backendCount = backendRes?.schools?.length || 0;
  pass('M4.1', '院校表格渲染', rows > 0 && backendCount > 0 && rows === backendCount, `ui=${rows} backend=${backendCount}`);
  await api.screenshot('04-1-school-list');

  // M4.2 多选 toggle
  await clickByText(api, '全部', true);
  await sleep(1000);
  await clickByText(api, '计算机科学与技术', true);
  await sleep(800);
  await clickByText(api, '软件工程', true);
  await sleep(2500);
  const multiBadge = await api.eval(`document.body.innerText.includes('个专业')`, false);
  pass('M4.2', '多专业选择徽标', multiBadge === true);
  await api.screenshot('04-2-multi-major');

  // 恢复单选
  await clickByText(api, '全部', true);
  await sleep(800);
  await clickByText(api, '计算机科学与技术', true);
  await sleep(2500);

  // M4.3 搜索
  const searchOk = await api.eval(`(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const i = inputs.find(x => x.placeholder && x.placeholder.includes('搜索'));
    if (i) { i.focus(); i.value='大学'; i.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; }
    return 'NOT_FOUND';
  })()`, false);
  await sleep(1500);
  const rowsAfterSearch = await countSchoolRows(api);
  const allUniversity = await api.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      return cls.includes('grid-cols-') && cls.includes('border-b') && !cls.includes('bg-gray-50');
    });
    return rows.every(r => r.textContent.includes('大学'));
  })()`, false);
  pass('M4.3', '搜索"大学"实时过滤', rowsAfterSearch > 0 && allUniversity === true, `rows=${rowsAfterSearch} searchInput=${searchOk}`);
  await api.screenshot('04-3-search');

  // 清空搜索
  await api.eval(`(() => { const i = Array.from(document.querySelectorAll('input')).find(x => x.placeholder && x.placeholder.includes('搜索')); if(i){i.value=''; i.dispatchEvent(new Event('input',{bubbles:true}));} })()`, false);
  await sleep(1000);

  // M4.4 排序 - 通过下拉选择 sortBy
  const sortChanged = await api.eval(`(async () => {
    // 找 WorkspaceFilterPanel 里的排序 select
    const selects = Array.from(document.querySelectorAll('select'));
    const sortSelect = selects.find(s => s.options && Array.from(s.options).some(o => o.value === 'enroll_count'));
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
    const m = text.match(/共\s*(\d+)\s*条/);
    const activePage = Array.from(document.querySelectorAll('button')).find(b => b.className && b.className.includes('bg-primary') && /^\d+$/.test(b.textContent.trim()));
    return JSON.stringify({ totalText: m?m[0]:'', activePage: activePage?activePage.textContent.trim():'', hasPrev: text.includes('上一页'), hasNext: text.includes('下一页') });
  })()`, false);
  pass('M4.5', '分页信息存在', pageInfo.includes('共') && pageInfo.includes('条'), pageInfo);
  await api.screenshot('04-5-page');

  // M4.6 展开院校详情 - 点第一行最后一个 grid cell（40px 展开按钮列）
  const expanded = await api.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      return cls.includes('grid-cols-') && cls.includes('border-b') && !cls.includes('bg-gray-50');
    });
    if (!rows.length) return 'NO_ROW';
    const first = rows[0];
    const lastCell = first.children[first.children.length - 1];
    const btn = lastCell.querySelector('button') || lastCell;
    btn.scrollIntoView({block:'center'});
    btn.click();
    return 'clicked';
  })()`, false);
  await sleep(2500);
  const expandTxt = await bodyText(api);
  pass('M4.6', '展开院校详情', expandTxt.includes('研究方向') || expandTxt.includes('考试科目'), expanded);
  await api.screenshot('04-6-expand');
  // 尝试点"历年分析"
  await clickByText(api, '历年分析', false);
  await sleep(1500);
  await api.screenshot('04-6-history');

  // =============== M5 招生计划视图 ===============
  console.log('M5 start');
  await clickByText(api, '招生计划视图', true);
  await sleep(3000);
  // 招生计划视图可能也是 div grid 或 table
  const planHeaders = await api.eval(`(() => {
    const header = Array.from(document.querySelectorAll('div.grid')).find(g => (g.className||'').includes('bg-gray-50'));
    if (header) return Array.from(header.children).map(c=>c.textContent.trim()).join(',');
    return Array.from(document.querySelectorAll('table thead th')).map(th=>th.textContent.trim()).join(',');
  })()`, false);
  const planRows = await api.eval(`(() => {
    const divRows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      return cls.includes('grid-cols-') && cls.includes('border-b') && !cls.includes('bg-gray-50');
    }).length;
    return divRows || document.querySelectorAll('table tbody tr').length;
  })()`, false);
  pass('M5', '招生计划视图表头与数据', String(planHeaders).includes('院校') && String(planHeaders).includes('考试科目') && Number(planRows)>0, `rows=${planRows}`);
  await api.screenshot('05-plan-list');

  // 展开计划行
  await api.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      return cls.includes('grid-cols-') && cls.includes('border-b') && !cls.includes('bg-gray-50');
    });
    if (!rows.length && document.querySelector('table tbody tr')) {
      const row = document.querySelector('table tbody tr');
      const btn = row.querySelector('button'); if(btn){btn.click(); return 'clicked';}
    }
    if (!rows.length) return 'NO_ROW';
    const first = rows[0];
    const lastCell = first.children[first.children.length - 1];
    const btn = lastCell.querySelector('button') || lastCell;
    btn.click();
    return 'clicked';
  })()`, false);
  await sleep(2000);
  await api.screenshot('05-plan-expand');

  // =============== M6 筛选面板 ===============
  console.log('M6 start');
  await clickByText(api, '院校视图', true);
  await sleep(2000);
  const filterBtn = await api.eval(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim().includes('筛选') || x.title.includes('筛选'));
    if (b) { b.click(); return 'clicked'; }
    return 'NOT_FOUND';
  })()`, false);
  await sleep(1000);
  await api.screenshot('06-filter-panel');
  pass('M6', '筛选面板展开', filterBtn === 'clicked', filterBtn);

  // =============== M7 收藏 ===============
  console.log('M7 start');
  const firstSchoolRes = await api.invoke('fetch_workspace_data', { schoolId: '', majorCodes: ['081200'] });
  const firstSchool = firstSchoolRes?.schools?.[0];
  if (firstSchool?.school_id) {
    const firstId = firstSchool.school_id;
    // 点第一行星标：找第一行里的 star/svg 按钮
    const starClicked = await api.eval(`(() => {
      const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
        const cls = g.className || '';
        return cls.includes('grid-cols-') && cls.includes('border-b') && !cls.includes('bg-gray-50');
      });
      if (!rows.length) return 'NO_ROW';
      const star = rows[0].querySelector('svg');
      if (star) { star.closest('button') ? star.closest('button').click() : star.click(); return 'clicked'; }
      return 'NO_STAR';
    })()`, false);
    await sleep(1200);
    const favs = await api.invoke('fetch_favorites');
    pass('M7', '收藏添加', Array.isArray(favs) && favs.some(f => f.school_id === firstId), `firstId=${firstId} click=${starClicked}`);
    await api.screenshot('07-fav-on');

    // 切到收藏页
    await clickByText(api, '收藏', true);
    await sleep(1500);
    const favTxt = await bodyText(api);
    pass('M7.2', '收藏页显示', favTxt.includes(firstSchool.name) || favTxt.includes('收藏'), favTxt.slice(0,80));
    await api.screenshot('07-fav-page');

    // 取消收藏
    await clickByText(api, '工作区', true);
    await sleep(1500);
    await api.eval(`(() => {
      const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
        const cls = g.className || '';
        return cls.includes('grid-cols-') && cls.includes('border-b') && !cls.includes('bg-gray-50');
      });
      if (!rows.length) return 'NO_ROW';
      const star = rows[0].querySelector('svg');
      if (star) { star.closest('button') ? star.closest('button').click() : star.click(); return 'clicked'; }
      return 'NO_STAR';
    })()`, false);
    await sleep(1200);
    const favs2 = await api.invoke('fetch_favorites');
    pass('M7.3', '取消收藏', Array.isArray(favs2) && !favs2.some(f => f.school_id === firstId));
  } else {
    pass('M7', '收藏测试', false, '无法获取首行院校');
  }

  // =============== M8 导出 ===============
  console.log('M8 start');
  // 安装 monkey-patch
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
    await clickByText(api, label, true);
    await sleep(600);
    return await readCaptured();
  }

  await clickByText(api, '院校视图', true);
  await sleep(1500);
  let r = await testExport('csv');
  pass('M8.1', '院校 CSV', r?.cmd === 'export_file' && r?.args?.ext === 'csv' && String(r?.args?.content).startsWith('\uFEFF'), '院校CSV');
  r = await testExport('excel');
  pass('M8.2', '院校 Excel', r?.cmd === 'export_excel' && r?.args?.sheetName === '院校列表' && r?.args?.headers?.length === 13, '院校Excel');
  r = await testExport('json');
  let jp; try { jp = JSON.parse(r?.args?.content); } catch(e) {}
  pass('M8.3', '院校 JSON', r?.cmd === 'export_file' && r?.args?.ext === 'json' && jp?.view_mode === 'school', '院校JSON');

  await clickByText(api, '招生计划视图', true);
  await sleep(2000);
  r = await testExport('csv');
  pass('M8.4', '计划 CSV', r?.cmd === 'export_file' && r?.args?.ext === 'csv', '计划CSV');
  r = await testExport('excel');
  pass('M8.5', '计划 Excel', r?.cmd === 'export_excel' && r?.args?.sheetName === '招生计划' && r?.args?.headers?.length === 15, '计划Excel');
  r = await testExport('json');
  try { jp = JSON.parse(r?.args?.content); } catch(e) {}
  pass('M8.6', '计划 JSON', r?.cmd === 'export_file' && r?.args?.ext === 'json' && jp?.view_mode === 'plan', '计划JSON');

  // 恢复 invoke
  await api.eval(`(() => { if (window.__origInvoke) { window.__TAURI_INTERNALS__.invoke = window.__origInvoke; delete window.__origInvoke; } delete window.__capturedInvokes; return 'restored'; })()`, false);

  // =============== M9 最近查看 ===============
  console.log('M9 start');
  await clickByText(api, '院校视图', true);
  await sleep(1500);
  // 展开某院校触发 add_recent_view
  const recentTarget = await api.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      return cls.includes('grid-cols-') && cls.includes('border-b') && !cls.includes('bg-gray-50');
    });
    if (!rows.length) return 'NO_ROW';
    const first = rows[0];
    const lastCell = first.children[first.children.length - 1];
    const btn = lastCell.querySelector('button') || lastCell;
    btn.click();
    return 'clicked';
  })()`, false);
  await sleep(2500);
  const recent = await api.invoke('fetch_recent_views');
  pass('M9', '最近查看记录', Array.isArray(recent) && recent.length > 0, `count=${Array.isArray(recent)?recent.length:0} click=${recentTarget}`);
  await clickByText(api, '最近查看', true);
  await sleep(1500);
  await api.screenshot('09-recent');

  // =============== M10 设置页登录态 ===============
  console.log('M10 start');
  await clickByText(api, '设置', true);
  await sleep(1500);
  const settingsTxt = await bodyText(api);
  pass('M10', '设置页渲染', settingsTxt.includes('更新专业目录') || settingsTxt.includes('检查状态'), 'settings');
  await api.screenshot('10-settings');

  // =============== M11 空状态 ===============
  console.log('M11 start');
  await clickByText(api, '专业管理', true);
  await sleep(1500);
  // 取消所有显示专业（假设是 checkbox 列表）
  await api.eval(`(() => {
    const checks = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(c => c.checked);
    checks.forEach(c => { c.click(); });
    return 'unchecked ' + checks.length;
  })()`, false);
  await sleep(1000);
  await clickByText(api, '工作区', true);
  await sleep(2000);
  const emptyTxt = await bodyText(api);
  const emptyOk = emptyTxt.includes('未选择显示专业') || emptyTxt.includes('暂无专业数据') || emptyTxt.includes('请选择专业') || emptyTxt.includes('管理显示专业');
  pass('M11', '空状态提示', emptyOk, emptyTxt.slice(0,120));
  await api.screenshot('11-empty');

  // 恢复至少一个显示专业
  await clickByText(api, '专业管理', true);
  await sleep(1500);
  await api.eval(`(() => {
    const firstUnchecked = Array.from(document.querySelectorAll('input[type="checkbox"]')).find(c => !c.checked);
    if (firstUnchecked) firstUnchecked.click();
    return 'restored';
  })()`, false);
  await sleep(1000);

  // =============== 汇总输出 ===============
  console.log('\n========== 测试结果 ==========');
  let ok = 0, fail = 0, skip = 0;
  for (const r of results) {
    const icon = r.ok === true ? '✅' : r.ok === false ? '❌' : '⏭️';
    if (r.ok === true) ok++; else if (r.ok === false) fail++; else skip++;
    console.log(`${icon} [${r.module}] ${r.name} ${r.detail ? '| ' + r.detail : ''}`);
  }
  console.log(`\n通过: ${ok}  失败: ${fail}  跳过/待确认: ${skip}`);
  console.log(`截图目录: ${SHOT_DIR}`);

  fs.writeFileSync(path.join(SHOT_DIR, 'results.json'), JSON.stringify({ results, uxIssues, shotDir: SHOT_DIR }, null, 2));

  await api.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
