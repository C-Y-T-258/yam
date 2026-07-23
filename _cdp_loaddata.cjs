// 触发工作区数据加载：点专业 Tab，等待，检查表格行数
const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');
function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}
function evalOn(ws, expr, timeout = 8000) {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve) => {
    const handler = (m) => { try { const o = JSON.parse(m.toString()); if (o.id === id) { ws.off('message', handler); resolve(o); } } catch (e) {} };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, userGesture: true } }));
    setTimeout(() => { ws.off('message', handler); resolve({ error: 'timeout' }); }, timeout);
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.setMaxListeners(50);
  await new Promise(r => ws.on('open', r));
  // 点"计算机科学与技术" tab
  let r = await evalOn(ws, `(function(){
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === '计算机科学与技术');
    if (!b) return 'NOT_FOUND';
    b.click(); return 'clicked';
  })()`);
  console.log('click 计算机科学与技术:', r.result?.result?.value);
  await sleep(2000);
  r = await evalOn(ws, `(function(){
    const trigger = document.querySelector('button[title="导出当前筛选结果"]');
    const rows = document.querySelectorAll('table tbody tr').length;
    const firstCells = Array.from(document.querySelectorAll('table tbody tr:first-child td')).map(td=>td.textContent.trim()).slice(0,5);
    return JSON.stringify({ triggerDisabled: trigger ? trigger.disabled : null, rows, firstCells });
  })()`);
  console.log('after click:', r.result?.result?.value);
  // 如果还是空，点"刷新数据"
  let parsed = JSON.parse(r.result?.result?.value || '{}');
  if (parsed.rows === 0) {
    console.log('仍为空，尝试点"刷新数据"...');
    await evalOn(ws, `(function(){ const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('刷新数据')); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
    await sleep(5000);
    r = await evalOn(ws, `(function(){
      const trigger = document.querySelector('button[title="导出当前筛选结果"]');
      const rows = document.querySelectorAll('table tbody tr').length;
      return JSON.stringify({ triggerDisabled: trigger ? trigger.disabled : null, rows });
    })()`);
    console.log('after refresh:', r.result?.result?.value);
  }
  ws.close(); process.exit(0);
})();
