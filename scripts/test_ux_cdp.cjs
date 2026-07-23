// UX 优化项 CDP 自测：4.2 趋势图 hover tooltip / 5.1 单专业收藏星+撤销 / 4.3 紧凑-舒适视图切换
// 前置：Tauri 桌面端 dev 已启动，CDP 端口 9223，工作区已有数据且某院校已展开。
const http = require('http');
const fs = require('fs');
const path = require('path');

const SHOT_DIR = path.join(__dirname, 'screenshots', 'ux-test');
fs.mkdirSync(SHOT_DIR, { recursive: true });

function getPages(port) { return new Promise((resolve, reject) => { http.get(`http://localhost:${port}/json`, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); }).on('error',reject); }); }
function cdpConnect(wsUrl) { return new Promise((resolve, reject) => { const ws = new WebSocket(wsUrl); let nextId=1; const waiting=new Map(); const to=setTimeout(()=>{try{ws.close();}catch{}reject(new Error('timeout'));},10000); ws.addEventListener('open',()=>{clearTimeout(to); const api={ send(m,p={}){const id=nextId++;return new Promise((res,rej)=>{waiting.set(id,{res,rej});ws.send(JSON.stringify({id,method:m,params:p}));});}, eval(e,ap=true){return this.send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:ap}).then(r=>{if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value??JSON.stringify(r);});}, screenshot(name){return this.send('Page.captureScreenshot',{format:'png'}).then(r=>{const p=path.join(SHOT_DIR,name);fs.writeFileSync(p,Buffer.from(r.data,'base64'));console.log('  📷',name);});}, mouseMove(x,y){return this.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});}, close(){try{ws.close();}catch{}} }; ws.addEventListener('message',ev=>{const d=JSON.parse(ev.data);if(d.id&&waiting.has(d.id)){const {res,rej}=waiting.get(d.id);waiting.delete(d.id);if(d.error)rej(d.error);else res(d.result);}}); api.send('Runtime.enable').then(()=>api.send('Page.enable')).then(()=>resolve(api)); }); ws.addEventListener('error',()=>{clearTimeout(to);reject(new Error('ws error'));}); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond, detail='') { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name} ${detail}`); } }

(async () => {
  const pages = await getPages(9223);
  const tp = pages.find(p => p.url && p.url.includes('localhost:1420'));
  if (!tp) throw new Error('Tauri 页面未找到');
  const api = await cdpConnect(tp.webSocketDebuggerUrl);
  console.log('✅ 已连接 CDP 9223\n');

  // ============ 5.1 单专业收藏星 + 撤销 ============
  console.log('【5.1 单专业收藏星 + 撤销】');
  await api.screenshot('5.1-00-start.png');

  // 找到单专业收藏星按钮（title 含"此专业"）
  let r = JSON.parse(await api.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button[title]')).find(b => b.title.includes('此专业'));
    if (!btn) return JSON.stringify({ ok:false, err:'未找到单专业收藏星' });
    btn.scrollIntoView({block:'center'});
    return JSON.stringify({ ok:true, title:btn.title });
  })()`, false));
  check('找到单专业收藏星', r.ok, r.err||'');
  if (!r.ok) { api.close(); console.log(`\n汇总: ${pass} pass / ${fail} fail`); process.exit(1); }

  // 步骤1：点击收藏
  await api.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button[title]')).find(b => b.title.includes('此专业'));
    btn.click(); return true;
  })()`, false);
  await sleep(600);
  await api.screenshot('5.1-01-after-fav.png');

  r = JSON.parse(await api.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button[title]')).find(b => b.title.includes('此专业'));
    const toastText = (document.body.textContent||'');
    const hasFavToast = toastText.includes('已收藏');
    return JSON.stringify({ title: btn?btn.title:null, isFilled: btn?btn.querySelector('svg')?.getAttribute('fill')==='currentColor':false, hasFavToast });
  })()`, false));
  check('收藏后 title 变为"取消收藏此专业"', r.title === '取消收藏此专业', `actual=${r.title}`);
  check('收藏后星标填充(filled)', r.isFilled);
  check('收藏后出现"已收藏"toast', r.hasFavToast);

  // 步骤2：再次点击 → 取消收藏，应出现"撤销"按钮
  await api.eval(`(() => { const btn = Array.from(document.querySelectorAll('button[title]')).find(b => b.title.includes('此专业')); btn.click(); return true; })()`, false);
  await sleep(600);
  await api.screenshot('5.1-02-after-unfav.png');

  r = JSON.parse(await api.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button[title]')).find(b => b.title.includes('此专业'));
    const undoBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim()==='撤销');
    const toastText = (document.body.textContent||'');
    return JSON.stringify({ title: btn?btn.title:null, isFilled: btn?btn.querySelector('svg')?.getAttribute('fill')==='currentColor':false, hasUndo: !!undoBtn, hasUnfavToast: toastText.includes('已取消收藏') });
  })()`, false));
  check('取消后 title 变回"收藏此专业"', r.title === '收藏此专业', `actual=${r.title}`);
  check('取消后星标未填充', !r.isFilled);
  check('取消后出现"已取消收藏"toast', r.hasUnfavToast);
  check('取消后toast出现"撤销"按钮', r.hasUndo);

  // 步骤3：点击"撤销" → 恢复收藏
  if (r.hasUndo) {
    await api.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim()==='撤销'); b.click(); return true; })()`, false);
    await sleep(800);
    await api.screenshot('5.1-03-after-undo.png');
    r = JSON.parse(await api.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button[title]')).find(b => b.title.includes('此专业'));
      return JSON.stringify({ title: btn?btn.title:null, isFilled: btn?btn.querySelector('svg')?.getAttribute('fill')==='currentColor':false });
    })()`, false));
    check('撤销后 title 恢复"取消收藏此专业"', r.title === '取消收藏此专业', `actual=${r.title}`);
    check('撤销后星标恢复填充', r.isFilled);
  }

  // 清理：取消收藏，恢复初始未收藏状态
  if (r && r.title === '取消收藏此专业') {
    await api.eval(`(() => { const btn = Array.from(document.querySelectorAll('button[title]')).find(b => b.title.includes('此专业')); btn.click(); return true; })()`, false);
    await sleep(500);
  }
  console.log('');

  // ============ 4.2 趋势图 hover tooltip ============
  console.log('【4.2 趋势图 hover tooltip】');
  // 点击展开院系里的"历年分析"按钮（若尚未在历年分析）
  await api.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('历年分析'));
    if (btn) { btn.click(); return true; }
    return false;
  })()`, false);
  await sleep(700);
  await api.screenshot('4.2-00-history.png');

  // 找趋势图容器（标题含"最低分趋势"或"招生人数趋势"），对其数据点 hover
  r = JSON.parse(await api.eval(`(() => {
    const charts = Array.from(document.querySelectorAll('.border.border-gray-200.rounded-lg.p-3'))
      .filter(el => /趋势/.test(el.textContent||''));
    return JSON.stringify({ chartCount: charts.length, titles: charts.map(c => c.querySelector('h4')?.textContent||'') });
  })()`, false));
  check('历年分析渲染出趋势图(≥2个)', r.chartCount >= 2, `actual=${r.chartCount}, titles=${r.titles.join('|')}`);

  // 取命中区中心坐标（用 CDP Input.dispatchMouseEvent 真实移动鼠标触发 React onMouseEnter）
  r = JSON.parse(await api.eval(`(() => {
    const charts = Array.from(document.querySelectorAll('.border.border-gray-200.rounded-lg.p-3')).filter(el => /趋势/.test(el.textContent||''));
    if (charts.length === 0) return JSON.stringify({ ok:false, err:'无趋势图' });
    let best = null;
    for (const ch of charts) {
      const hits = Array.from(ch.querySelectorAll('circle')).filter(ci => ci.getAttribute('r') === '10');
      if (!best || hits.length > best.hits.length) best = { chart: ch, hits };
    }
    if (!best || best.hits.length < 1) return JSON.stringify({ ok:false, err:'无命中区circle' });
    const c = best.hits[Math.min(1, best.hits.length - 1)];
    c.scrollIntoView({block:'center'});
    return JSON.stringify({ ok:true, count: best.hits.length });
  })()`, false));
  check('找到趋势图数据点命中区', r.ok, r.err||'');
  const hoverOk = r.ok;
  await sleep(350);
  r = JSON.parse(await api.eval(`(() => {
    const charts = Array.from(document.querySelectorAll('.border.border-gray-200.rounded-lg.p-3')).filter(el => /趋势/.test(el.textContent||''));
    let best = null;
    for (const ch of charts) {
      const hits = Array.from(ch.querySelectorAll('circle')).filter(ci => ci.getAttribute('r') === '10');
      if (!best || hits.length > best.hits.length) best = { hits };
    }
    const c = best.hits[Math.min(1, best.hits.length - 1)];
    const rect = c.getBoundingClientRect();
    return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
  })()`, false));

  if (hoverOk) {
    await api.mouseMove(r.x, r.y);
    await sleep(500);
    await api.screenshot('4.2-01-hover.png');
    r = JSON.parse(await api.eval(`(() => {
      // tooltip: 绝对定位 div，bg-gray-900，pointer-events-none，文本含"年"
      const tooltips = Array.from(document.querySelectorAll('div')).filter(d =>
        d.className && d.className.includes('bg-gray-900') && d.className.includes('pointer-events-none')
        && /年/.test(d.textContent||''));
      return JSON.stringify({ found: tooltips.length>0, text: tooltips[0]?.textContent||'' });
    })()`, false));
    check('hover 数据点后出现 tooltip', r.found, `text=${r.text}`);
    check('tooltip 文本含年份与数值', r.found && /\d{4}年/.test(r.text) && /·/.test(r.text), `text=${r.text}`);

    // 移开鼠标 → tooltip 消失
    await api.mouseMove(5, 5);
    await sleep(500);
    r = JSON.parse(await api.eval(`(() => {
      const tooltips = Array.from(document.querySelectorAll('div')).filter(d =>
        d.className && d.className.includes('bg-gray-900') && d.className.includes('pointer-events-none'));
      return JSON.stringify({ count: tooltips.length });
    })()`, false));
    check('鼠标移出后 tooltip 消失', r.count === 0, `remaining=${r.count}`);
  }
  console.log('');

  // ============ 4.3 紧凑/舒适视图切换 ============
  console.log('【4.3 紧凑/舒适视图切换】');
  // 切到招生计划视图
  await api.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='招生计划视图'); b.click(); return true; })()`, false);
  await sleep(1200);
  await api.screenshot('4.3-00-plan-comfortable.png');

  // 舒适模式（默认）：表头应含"研究方向""考试科目"
  r = JSON.parse(await api.eval(`(() => {
    const headers = Array.from(document.querySelectorAll('.grid > div')).map(d=>d.textContent.trim()).filter(Boolean);
    const compactBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim()==='紧凑视图');
    return JSON.stringify({
      hasResearch: headers.includes('研究方向'),
      hasExam: headers.includes('考试科目'),
      hasCompactBtn: !!compactBtn,
      headers: headers.slice(0,12),
    });
  })()`, false));
  check('舒适模式有"紧凑视图"按钮', r.hasCompactBtn);
  check('舒适模式表头含"研究方向"', r.hasResearch, `headers=${r.headers.join('|')}`);
  check('舒适模式表头含"考试科目"', r.hasExam);

  // 点击"紧凑视图"
  await api.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='紧凑视图'); b.click(); return true; })()`, false);
  await sleep(500);
  await api.screenshot('4.3-01-plan-compact.png');

  r = JSON.parse(await api.eval(`(() => {
    const headers = Array.from(document.querySelectorAll('.grid > div')).map(d=>d.textContent.trim()).filter(Boolean);
    const comfortBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim()==='舒适视图');
    return JSON.stringify({
      hasResearch: headers.includes('研究方向'),
      hasExam: headers.includes('考试科目'),
      hasComfortBtn: !!comfortBtn,
      headers: headers.slice(0,12),
    });
  })()`, false));
  check('紧凑模式按钮变为"舒适视图"', r.hasComfortBtn);
  check('紧凑模式表头不含"研究方向"', !r.hasResearch, `headers=${r.headers.join('|')}`);
  check('紧凑模式表头不含"考试科目"', !r.hasExam);

  // 切回舒适
  await api.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='舒适视图'); b.click(); return true; })()`, false);
  await sleep(500);
  r = JSON.parse(await api.eval(`(() => {
    const headers = Array.from(document.querySelectorAll('.grid > div')).map(d=>d.textContent.trim()).filter(Boolean);
    return JSON.stringify({ hasResearch: headers.includes('研究方向'), hasExam: headers.includes('考试科目') });
  })()`, false));
  check('切回舒适后表头恢复"研究方向""考试科目"', r.hasResearch && r.hasExam);
  await api.screenshot('4.3-02-plan-restored.png');

  // 还原：切回院校视图
  await api.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='院校视图'); b.click(); return true; })()`, false);
  await sleep(500);

  api.close();
  console.log(`\n========== 汇总: ${pass} pass / ${fail} fail ==========`);
  process.exit(fail>0?1:0);
})().catch(e => { console.error('❌ 异常:', e.message); process.exit(1); });
