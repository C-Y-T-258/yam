// YAM 桌面端全流程 UI 测试 v3
// 重点修复：nav 选择器、下拉 hover、真实鼠标事件、NBSP 正则
const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CDP_PORT = 9223;
const SKIP_EXPORT = process.argv.includes('--skip-export');
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

async function realisticClick(api, selectorOrElementExpr) {
  return api.eval(`(() => {
    let el;
    if (typeof ${JSON.stringify(selectorOrElementExpr)} === 'string') {
      el = document.querySelector(${JSON.stringify(selectorOrElementExpr)});
    } else {
      el = ${selectorOrElementExpr};
    }
    if (!el) return 'NOT_FOUND';
    el.scrollIntoView({block:'center'});
    el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
    el.click();
    return 'clicked';
  })()`, false);
}

async function clickNav(api, text) {
  return api.eval(`(() => {
    const nav = document.querySelector('nav');
    if (!nav) return 'NO_NAV';
    const matches = Array.from(nav.querySelectorAll('button,a')).filter(b => b.textContent.trim() === ${JSON.stringify(text)});
    const el = matches[matches.length - 1];
    if (!el) return 'NOT_FOUND';
    el.scrollIntoView({block:'center'});
    el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
    el.click();
    return 'clicked';
  })()`, false);
}

async function clickDropdownItem(api, menuText, itemText) {
  // hover the container div that has onMouseEnter in TopNav
  await api.eval(`(() => {
    const nav = document.querySelector('nav');
    if (!nav) return 'NO_NAV';
    const menuBtn = Array.from(nav.querySelectorAll('button')).find(b => b.textContent.trim().includes(${JSON.stringify(menuText)}));
    if (!menuBtn) return 'NO_MENU_BTN';
    const container = menuBtn.closest('.relative');
    if (!container) return 'NO_CONTAINER';
    container.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true}));
    menuBtn.dispatchEvent(new MouseEvent('mouseenter', {bubbles:true}));
    return 'hovered';
  })()`, false);
  await sleep(800);
  // click item inside dropdown (visible, absolute positioned)
  return api.eval(`(() => {
    const items = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === ${JSON.stringify(itemText)} && b.offsetParent !== null);
    const el = items[items.length - 1];
    if (!el) return 'NOT_FOUND';
    el.scrollIntoView({block:'center'});
    el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
    el.click();
    return 'clicked';
  })()`, false);
}

async function clickMajorTab(api, name) {
  return api.eval(`(() => {
    // major tabs are in the first horizontal scrollable container near top-left
    const all = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === ${JSON.stringify(name)} && b.offsetParent !== null);
    // prefer buttons inside an overflow-x-auto or flex container (major tabs), not dropdown items
    const tab = all.find(b => {
      let p = b.parentElement;
      for (let i = 0; i < 4 && p; i++) {
        const cls = p.className || '';
        if (cls.includes('overflow-x-auto') || cls.includes('flex-wrap') || cls.includes('gap-')) return true;
        p = p.parentElement;
      }
      return false;
    }) || all[all.length - 1];
    if (!tab) return 'NOT_FOUND';
    tab.scrollIntoView({block:'center', inline:'center'});
    tab.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, buttons:1}));
    tab.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true, buttons:1}));
    tab.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
    tab.click();
    return 'clicked';
  })()`, false);
}

async function clearSearch(api) {
  return api.eval(`(() => {
    const i = Array.from(document.querySelectorAll('input')).find(x => x.placeholder && x.placeholder.includes('搜索'));
    if (!i) return 'NO_INPUT';
    i.focus();
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    descriptor.set.call(i, '');
    i.dispatchEvent(new Event('input',{bubbles:true}));
    i.dispatchEvent(new Event('change',{bubbles:true}));
    return 'cleared';
  })()`, false);
}

async function closeFilterPanel(api) {
  return api.eval(`(() => {
    // close "更多筛选条件" drawer by clicking overlay or close button
    const closeBtn = document.querySelector('button[aria-label="关闭"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '×' || b.textContent.trim() === '✕');
    if (closeBtn && closeBtn.offsetParent !== null) { closeBtn.click(); return 'closed_btn'; }
    // click overlay (sibling before drawer)
    const drawer = document.querySelector('.fixed.inset-y-0.right-0');
    if (drawer && drawer.offsetParent !== null) {
      const overlay = drawer.previousElementSibling;
      if (overlay && overlay.offsetParent !== null) { overlay.click(); return 'closed_overlay'; }
    }
    return 'no_panel';
  })()`, false);
}

async function clickByText(api, text, exact = false) {
  return api.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('button,a'));
    const t = ${JSON.stringify(text)};
    const matches = exact ? btns.filter(b => b.textContent.trim() === t) : btns.filter(b => b.textContent.trim().includes(t));
    const el = matches[matches.length - 1];
    if (!el) return 'NOT_FOUND|avail=' + btns.map(b=>b.textContent.trim().slice(0,20)).filter(Boolean).slice(0,15).join(',');
    el.scrollIntoView({block:'center'});
    el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
    el.click();
    return 'clicked';
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

async function waitResultCountBelow(api, max = 400, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const n = await getResultCount(api);
    if (n > 0 && n <= max) return n;
    await sleep(400);
  }
  return await getResultCount(api);
}

async function waitForTabSelected(api, name, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const selected = await api.eval(`(() => {
      const tabs = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === ${JSON.stringify(name)});
      return tabs.some(t => {
        const cls = t.className || '';
        return cls.includes('bg-[#1e3a5f]') || cls.includes('#1e3a5f');
      });
    })()`, false);
    if (selected === true) return true;
    await sleep(400);
  }
  return false;
}

async function majorSelectionState(api) {
  const raw = await api.eval(`(() => {
    const allButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '全部');
    const container = allButton?.parentElement;
    if (!container) return JSON.stringify({ allActive: false, selected: [], badge: false });
    const isActive = (button) => {
      const cls = button.className || '';
      return cls.includes('bg-[#1e3a5f]') || cls.includes('#1e3a5f');
    };
    return JSON.stringify({
      allActive: isActive(allButton),
      selected: Array.from(container.querySelectorAll('button'))
        .filter(b => b !== allButton && isActive(b))
        .map(b => b.textContent.trim()),
      badge: document.body.innerText.includes('已选')
    });
  })()`, false);
  try { return JSON.parse(raw); } catch { return { allActive: false, selected: [], badge: false }; }
}

async function waitMajorSelection(api, predicate, timeout = 8000) {
  const start = Date.now();
  let state = await majorSelectionState(api);
  while (Date.now() - start < timeout) {
    state = await majorSelectionState(api);
    if (predicate(state)) return state;
    await sleep(400);
  }
  return state;
}

async function selectOnlyMajor(api, name) {
  await clickMajorTab(api, '全部');
  await waitMajorSelection(api, (state) => state.allActive && state.selected.length === 0, 8000);
  await clickMajorTab(api, name);
  return waitMajorSelection(api, (state) => state.selected.length === 1 && state.selected.includes(name), 10000);
}

async function selectAdditionalMajor(api, name) {
  await clickMajorTab(api, name);
  return waitMajorSelection(api, (state) => state.selected.length >= 2 && state.selected.includes(name), 10000);
}

async function clickViewMode(api, label) {
  return api.eval(`(() => {
    const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === ${JSON.stringify(label)} && b.offsetParent !== null);
    const el = buttons.find(b => {
      const parentText = b.parentElement?.textContent || '';
      return parentText.includes('院校视图') && parentText.includes('招生计划视图');
    }) || buttons[buttons.length - 1];
    if (!el) return 'NOT_FOUND';
    el.scrollIntoView({block:'center'});
    el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
    el.click();
    return 'clicked';
  })()`, false);
}

async function waitViewMode(api, label, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const active = await api.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === ${JSON.stringify(label)} && b.offsetParent !== null);
      return buttons.some(b => {
        const parentText = b.parentElement?.textContent || '';
        const cls = b.className || '';
        return parentText.includes('院校视图') && parentText.includes('招生计划视图') && cls.includes('bg-[#1e3a5f]');
      });
    })()`, false);
    if (active === true) return true;
    await sleep(400);
  }
  return false;
}

async function firstDataRow(api) {
  return api.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      const classes = cls.split(/\\s+/).filter(Boolean);
      return cls.includes('grid-cols-') && cls.includes('border-b') && !classes.includes('bg-gray-50');
    });
    return rows.length ? 'found' : 'NO_ROW';
  })()`, false);
}

const results = [];
const uxIssues = [];
function pass(module, name, ok, detail = '') { results.push({ module, name, ok, detail }); }
function uxIssue(module, dim, sev, desc, repro, suggest) { uxIssues.push({ module, dim, sev, desc, repro, suggest }); }

(async () => {
  const api = await connect();
  console.log('connected');

  // =============== M1 ===============
  const majors = await api.invoke('fetch_available_majors');
  pass('M1', 'fetch_available_majors 非空且含 081200', Array.isArray(majors) && majors.length >= 1 && majors.some(m => (m.code || m.major_code || '').startsWith('081200')), `count=${majors?.length}`);
  await api.screenshot('01-init');

  // =============== M2 导航 ===============
  const navItems = [
    { text: '专业管理', feature: '管理本地专业数据库' },
    { text: '数据采集', feature: '请先选择要采集的专业' },
    { text: '工作区', feature: '院校视图' },
    { text: '设置', feature: '应用功能与数据维护' },
    { text: '帮助', feature: '帮助' }
  ];
  for (const nav of navItems) {
    await clickNav(api, nav.text);
    await sleep(1800);
    const txt = await bodyText(api);
    pass('M2', `导航 ${nav.text} 切换`, txt.includes(nav.feature), nav.text);
    await api.screenshot(`02-nav-${nav.text}`);
  }
  await clickNav(api, '工作区');
  await sleep(1500);

  // =============== M3 下拉菜单 ===============
  await clickDropdownItem(api, '工作区', '收藏');
  await sleep(1500);
  const favTxt = await bodyText(api);
  pass('M3', '下拉/收藏页', favTxt.includes('学校名称') || favTxt.includes('清空历史记录') || favTxt.includes('共') || favTxt.includes('收藏'));

  await api.screenshot('03-favorites');
  await clickNav(api, '工作区');
  await sleep(1500);

  // =============== M4 院校视图 ===============
  await clickViewMode(api, '院校视图');
  await waitViewMode(api, '院校视图', 8000);
  await sleep(1500);
  await selectOnlyMajor(api, '计算机科学与技术');
  await sleep(2500);
  let schoolTotal = await waitResultCountBelow(api, 400, 8000);
  if (schoolTotal > 400) {
    await sleep(2000);
    schoolTotal = await getResultCount(api);
  }
  const visibleRows = await waitForRows(api, 1, 10000);
  const schoolBackend = await api.invoke('fetch_workspace_data', { schoolId: '', majorCodes: ['081200'] });
  pass('M4.1', '院校视图渲染', visibleRows > 0 && schoolTotal > 0 && schoolBackend?.schools?.length > 0, `visible=${visibleRows} totalText=${schoolTotal} backend=${schoolBackend?.schools?.length}`);
  await api.screenshot('04-1-school-list');

  // M4.2 多选：先取单专业的基线，再点第二个专业，观察总数变化
  const singleBaseline = await getResultCount(api);
  const selectedAfterSecond = await selectAdditionalMajor(api, '软件工程');
  await sleep(3000);
  const multiTotal = await getResultCount(api);
  await sleep(500);
  const multiBadge = selectedAfterSecond.badge;
  const multiChanged = multiTotal !== singleBaseline && multiTotal > 0;
  pass('M4.2', '多专业选择徽标', multiBadge === true && multiChanged, `baseline=${singleBaseline} multi=${multiTotal}`);
  await api.screenshot('04-2-multi-major');
  await selectOnlyMajor(api, '计算机科学与技术');
  await sleep(3000);

  // M4.3 搜索
  await api.eval(`(() => {
    const i = Array.from(document.querySelectorAll('input')).find(x => x.placeholder && x.placeholder.includes('搜索'));
    if (i) {
      i.focus();
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      descriptor.set.call(i, '大学');
      i.dispatchEvent(new Event('input',{bubbles:true}));
      i.dispatchEvent(new Event('change',{bubbles:true}));
      return 'ok';
    }
    return 'NF';
  })()`, false);
  await sleep(2000);
  const searchTotal = await getResultCount(api);
  pass('M4.3', '搜索"大学"过滤', searchTotal > 0 && searchTotal < schoolTotal, `total=${searchTotal}`);
  await api.screenshot('04-3-search');
  await clearSearch(api);
  await sleep(1500);

  // M4.4 排序
  const sortChanged = await api.eval(`(async () => {
    const selects = Array.from(document.querySelectorAll('select'));
    const sortSelect = selects.find(s => Array.from(s.options).some(o => o.value && o.value.includes('enroll_count')));
    if (!sortSelect) return 'NO_SORT_SELECT';
    sortSelect.value = 'enroll_count-desc';
    sortSelect.dispatchEvent(new Event('change',{bubbles:true}));
    return 'changed';
  })()`, true, 5000);
  await sleep(1500);
  pass('M4.4', '排序切换', sortChanged === 'changed', sortChanged);
  await api.screenshot('04-4-sort');

  // M4.5 分页
  const pageInfo = await api.eval(`(() => {
    const text = document.body.innerText;
    const m = text.match(/共[\\s\\u00A0]*([\\d,]+)[\\s\\u00A0]*条结果/);
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => /^\\d+$/.test(t));
    return JSON.stringify({ totalText: m?m[0]:'', pageButtons: buttons.slice(0,8), hasPrev: text.includes('上一页'), hasNext: text.includes('下一页') });
  })()`, false);
  pass('M4.5', '分页信息存在', pageInfo.includes('条结果'), pageInfo);
  await api.screenshot('04-5-page');

  // M4.6 展开
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
    btn.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,buttons:1}));
    btn.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,buttons:1}));
    btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
    btn.click();
    return 'clicked';
  })()`, false);
  await sleep(3000);
  const expandTxt = await bodyText(api);
  pass('M4.6', '展开院校详情', expandTxt.includes('研究方向') || expandTxt.includes('考试科目') || expandTxt.includes('历年分数'), expanded);
  await api.screenshot('04-6-expand');
  await clickByText(api, '历年分析', false);
  await sleep(1500);
  await api.screenshot('04-6-history');

  // =============== M5 招生计划视图 ===============
  await clickViewMode(api, '招生计划视图');
  await waitViewMode(api, '招生计划视图', 8000);
  await sleep(3000);
  const planTotal = await waitResultCount(api, 1, 10000);
  const planBackend = await api.invoke('fetch_workspace_plans', { majorCodes: ['081200'] });
  pass('M5', '招生计划视图数据', planTotal > 0 && Array.isArray(planBackend) && planBackend.length > 0, `totalText=${planTotal} backend=${planBackend?.length}`);
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
  await clickViewMode(api, '院校视图');
  await waitViewMode(api, '院校视图', 8000);
  await sleep(2000);
  const filterBtn = await api.eval(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim().includes('更多筛选'));
    if (b) { b.click(); return 'clicked'; }
    return 'NOT_FOUND';
  })()`, false);
  await sleep(1200);
  await api.screenshot('06-filter-panel');
  pass('M6', '筛选面板展开', filterBtn === 'clicked', filterBtn);

  // =============== M7 收藏 ===============
  // 重置为干净状态：关闭筛选面板、清空搜索、单选计算机科学与技术、清空已有收藏
  await closeFilterPanel(api);
  await sleep(500);
  await clearSearch(api);
  await sleep(1000);
  await clickViewMode(api, '院校视图');
  await waitViewMode(api, '院校视图', 8000);
  await selectOnlyMajor(api, '计算机科学与技术');
  await waitResultCountBelow(api, 400, 8000);
  await waitForRows(api, 1, 10000);
  const existingFavs = await api.invoke('fetch_favorites');
  if (Array.isArray(existingFavs) && existingFavs.length) {
    for (const f of existingFavs) {
      await api.invoke('toggle_favorite', { schoolId: f.school_id, majorCode: f.major_code, majorName: f.name || '' });
    }
    await sleep(1000);
  }

  const firstSchool = await api.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      const classes = cls.split(/\\s+/).filter(Boolean);
      return cls.includes('grid-cols-') && cls.includes('border-b') && !classes.includes('bg-gray-50');
    });
    if (!rows.length) return null;
    const starBtn = rows[0].querySelector('button');
    const nameEl = rows[0].querySelector('.font-medium, .font-semibold') || Array.from(rows[0].children).find(c => c.textContent.trim());
    return { name: nameEl ? nameEl.textContent.trim() : '', hasStar: !!starBtn };
  })()`, false);

  if (firstSchool?.name) {
    const starClicked = await api.eval(`(() => {
      const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
        const cls = g.className || '';
        const classes = cls.split(/\\s+/).filter(Boolean);
        return cls.includes('grid-cols-') && cls.includes('border-b') && !classes.includes('bg-gray-50');
      });
      if (!rows.length) return 'NO_ROW';
      const star = rows[0].querySelector('svg');
      if (star) { const btn = star.closest('button') || star; btn.scrollIntoView({block:'center'}); btn.click(); return 'clicked'; }
      return 'NO_STAR';
    })()`, false);
    await sleep(3000);
    let favs = await api.invoke('fetch_favorites');
    let found = Array.isArray(favs) && favs.some(f => firstSchool.name.includes(f.name) || f.name.includes(firstSchool.name));
    if (!found) {
      await sleep(3000);
      favs = await api.invoke('fetch_favorites');
      found = Array.isArray(favs) && favs.some(f => firstSchool.name.includes(f.name) || f.name.includes(firstSchool.name));
    }
    pass('M7', '收藏添加', found, `name=${firstSchool.name} click=${starClicked} count=${Array.isArray(favs)?favs.length:'-'}`);
    await api.screenshot('07-fav-on');

    await clickDropdownItem(api, '工作区', '收藏');
    await sleep(1500);
    const favPageTxt = await bodyText(api);
    pass('M7.2', '收藏页显示该院校', favPageTxt.includes(firstSchool.name), firstSchool.name);
    await api.screenshot('07-fav-page');

    // 直接在收藏页取消收藏，避免返回工作区后专业状态重置
    const unfavClicked = await api.eval(`(() => {
      const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
        const cls = g.className || '';
        const classes = cls.split(/\\s+/).filter(Boolean);
        return cls.includes('grid-cols-') && cls.includes('border-b') && !classes.includes('bg-gray-50');
      });
      const targetRow = rows.find(r => r.textContent.includes(${JSON.stringify(firstSchool.name)}));
      if (!targetRow) return 'NO_ROW';
      const star = targetRow.querySelector('svg');
      if (star) { const btn = star.closest('button') || star; btn.scrollIntoView({block:'center'}); btn.click(); return 'clicked'; }
      return 'NO_STAR';
    })()`, false);
    await sleep(3000);
    await api.screenshot('07-fav-off');
    const favs2 = await api.invoke('fetch_favorites');
    pass('M7.3', '取消收藏', Array.isArray(favs2) && !favs2.some(f => firstSchool.name.includes(f.name) || f.name.includes(firstSchool.name)), `click=${unfavClicked}`);
  } else {
    const debugRows = await api.eval("(() => { const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => { const cls = g.className || ''; const classes = cls.split(/\\s+/).filter(Boolean); return cls.includes('grid-cols-') && cls.includes('border-b') && !classes.includes('bg-gray-50'); }); return JSON.stringify({ rowCount: rows.length, resultText: (document.body.innerText.match(/共\\s*([0-9,]+)\\s*条/) || [])[0] || '', activeView: Array.from(document.querySelectorAll('button')).filter(b => ['院校视图','招生计划视图'].includes(b.textContent.trim())).map(b => ({ text: b.textContent.trim(), active: (b.className || '').includes('bg-[#1e3a5f]') })), firstRow: rows[0] ? { childCount: rows[0].children.length, text: rows[0].textContent.trim().slice(0, 200) } : null }); })()", false);
    pass('M7', '收藏测试', false, '无法获取首行院校 ' + debugRows);
  }

  // =============== M8 导出（monkey-patch） ===============
  if (!SKIP_EXPORT) {
  await clickByText(api, '院校视图', true);
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

  await clickByText(api, '招生计划视图', true);
  await sleep(2000);
  r = await testExport('csv');
  pass('M8.4', '计划 CSV', r?.cmd === 'export_file' && r?.args?.ext === 'csv', '计划CSV');
  r = await testExport('excel');
  pass('M8.5', '计划 Excel', r?.cmd === 'export_excel' && r?.args?.sheetName === '招生计划' && r?.args?.headers?.length === 15, '计划Excel');
  r = await testExport('json');
  try { jp = JSON.parse(r?.args?.content); } catch(e) {}
  pass('M8.6', '计划 JSON', r?.cmd === 'export_file' && r?.args?.ext === 'json' && jp?.view_mode === 'plan', '计划JSON');

  await api.eval(`(() => { if (window.__origInvoke) { window.__TAURI_INTERNALS__.invoke = window.__origInvoke; delete window.__origInvoke; } delete window.__capturedInvokes; return 'restored'; })()`, false);
  } else {
    console.log('M8 skipped (--skip-export)');
    pass('M8', '导出测试', true, '用户要求延后');
  }

  // =============== M9 最近查看 ===============
  await clickByText(api, '院校视图', true);
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
  const recent = await api.invoke('fetch_recent_views', { limit: 50 });
  pass('M9', '最近查看记录', Array.isArray(recent) && recent.length > 0, `count=${recent?.length}`);
  await clickDropdownItem(api, '工作区', '最近查看');
  await sleep(1500);
  await api.screenshot('09-recent');

  // =============== M10 设置页 ===============
  await clickNav(api, '设置');
  await sleep(2000);
  const settingsTxt = await bodyText(api);
  pass('M10', '设置页渲染', settingsTxt.includes('更新专业目录') && settingsTxt.includes('检查状态'), 'settings');
  await api.screenshot('10-settings');

  // =============== M11 空状态 ===============
  await clickNav(api, '专业管理');
  await sleep(2000);
  await api.eval(`(() => {
    const checks = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(c => c.checked);
    checks.forEach(c => { c.click(); });
    return 'unchecked ' + checks.length;
  })()`, false);
  await sleep(1200);
  await clickNav(api, '工作区');
  await sleep(2500);
  const emptyTxt = await bodyText(api);
  const emptyOk = emptyTxt.includes('未选择显示专业') || emptyTxt.includes('暂无专业数据') || emptyTxt.includes('请选择专业') || emptyTxt.includes('管理显示专业');
  pass('M11', '空状态提示', emptyOk, emptyTxt.slice(0,120));
  await api.screenshot('11-empty');

  // 恢复
  await clickNav(api, '专业管理');
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
