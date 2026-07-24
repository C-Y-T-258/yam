// 展开院校→展开院系→点击历年分析→截图趋势图（用于验证新设计）。
const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}
function evalOn(ws, expr, timeout = 10000) {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve) => {
    const handler = (m) => { try { const o = JSON.parse(m.toString()); if (o.id === id) { ws.off('message', handler); resolve(o); } } catch (e) {} };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: !!expr.match(/await /), userGesture: true } }));
    setTimeout(() => { ws.off('message', handler); resolve({ error: 'timeout' }); }, timeout);
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function capture(ws, file, clip) {
  const outDir = path.join('d:/yam', 'screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const id = Math.floor(Math.random() * 1e9);
  const params = { format: 'png' };
  if (clip) params.clip = clip;
  const r = await new Promise((resolve) => {
    const handler = (m) => { try { const o = JSON.parse(m.toString()); if (o.id === id) { ws.off('message', handler); resolve(o); } } catch (e) {} };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method: 'Page.captureScreenshot', params }));
    setTimeout(() => { ws.off('message', handler); resolve({ error: 'timeout' }); }, 15000);
  });
  fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('saved', file);
}

async function mouseClick(ws, x, y) {
  const id = Math.floor(Math.random() * 1e9);
  await new Promise((resolve) => {
    const handler = (m) => { try { const o = JSON.parse(m.toString()); if (o.id === id) { ws.off('message', handler); resolve(o); } } catch (e) {} };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } }));
    setTimeout(() => { ws.off('message', handler); resolve({ error: 'timeout' }); }, 5000);
  });
  await new Promise((resolve) => {
    const id2 = Math.floor(Math.random() * 1e9);
    const handler = (m) => { try { const o = JSON.parse(m.toString()); if (o.id === id2) { ws.off('message', handler); resolve(o); } } catch (e) {} };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: id2, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } }));
    setTimeout(() => { ws.off('message', handler); resolve({ error: 'timeout' }); }, 5000);
  });
}

(async () => {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.setMaxListeners(50);
  await new Promise(r => ws.on('open', r));

  // 设置较大视口，确保两张图都能完整显示
  const setViewportId = Math.floor(Math.random() * 1e9);
  await new Promise((resolve) => {
    const handler = (m) => { try { const o = JSON.parse(m.toString()); if (o.id === setViewportId) { ws.off('message', handler); resolve(o); } } catch (e) {} };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: setViewportId, method: 'Emulation.setDeviceMetricsOverride', params: { width: 1920, height: 1200, deviceScaleFactor: 1, mobile: false } }));
    setTimeout(() => { ws.off('message', handler); resolve({ done: true }); }, 3000);
  });
  await sleep(500);

  // 获取展开按钮坐标并点击
  let r = await evalOn(ws, `(function(){
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let nameEl = null;
    while (node = walker.nextNode()) {
      if (node.textContent.trim() === '南京航空航天大学') { nameEl = node.parentElement; break; }
    }
    if (!nameEl) return 'NO_SCHOOL';
    const row = nameEl.closest('[class*="grid-cols"]');
    if (!row) return 'NO_ROW';
    const expandBtn = row.querySelector('button[class*="p-1"][class*="text-gray-400"]');
    if (!expandBtn) return 'NO_EXPAND_BTN';
    const rect = expandBtn.getBoundingClientRect();
    return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
  })()`);
  console.log('expand btn:', r.result?.result?.value);
  const expandPos = JSON.parse(r.result?.result?.value || '{}');
  if (expandPos.x) await mouseClick(ws, expandPos.x, expandPos.y);
  await sleep(4500);

  // 获取第一个院系按钮坐标并点击
  r = await evalOn(ws, `(function(){
    const btns = Array.from(document.querySelectorAll('button')).filter(b => /(学院|系|所|中心|研究院)$/.test(b.textContent.trim()));
    if (!btns.length) return 'NO_DEPT';
    const rect = btns[0].getBoundingClientRect();
    return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2, text: btns[0].textContent.trim() });
  })()`);
  console.log('dept btn:', r.result?.result?.value);
  const deptPos = JSON.parse(r.result?.result?.value || '{}');
  if (deptPos.x) await mouseClick(ws, deptPos.x, deptPos.y);
  await sleep(1200);

  // 获取历年分析坐标并点击
  r = await evalOn(ws, `(function(){
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let el = null;
    while (node = walker.nextNode()) {
      if (node.textContent.trim() === '历年分析') { el = node.parentElement; break; }
    }
    if (!el) return 'NO_HISTORICAL';
    const rect = (el.closest('button') || el).getBoundingClientRect();
    return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
  })()`);
  console.log('historical btn:', r.result?.result?.value);
  const histPos = JSON.parse(r.result?.result?.value || '{}');
  if (histPos.x) await mouseClick(ws, histPos.x, histPos.y);
  await sleep(800);

  // 滚动到趋势图区域并获取两张卡片的包围盒
  r = await evalOn(ws, `(function(){
    const titles = Array.from(document.querySelectorAll('h4')).filter(h => ['最低分趋势','招生人数趋势'].includes(h.textContent.trim()));
    if (!titles.length) return 'NO_CHART';
    const cards = titles.map(t => t.closest('div.border')).filter(Boolean);
    const first = cards[0];
    if (first) {
      first.scrollIntoView({block: 'start', inline: 'nearest', behavior: 'instant'});
    }
    const rects = cards.map(c => c.getBoundingClientRect());
    const x = Math.min(...rects.map(r => r.left));
    const y = Math.min(...rects.map(r => r.top));
    const right = Math.max(...rects.map(r => r.right));
    const bottom = Math.max(...rects.map(r => r.bottom));
    return JSON.stringify({ count: titles.length, clip: { x, y, width: right-x, height: bottom-y } });
  })()`);
  console.log('chart:', r.result?.result?.value);
  await sleep(800);

  await capture(ws, path.join('d:/yam/screenshots', `trendchart-new-${Date.now()}.png`));
  ws.close(); process.exit(0);
})();
