// 调试：检查导出菜单与数据状态
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
(async () => {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.setMaxListeners(50);
  await new Promise(r => ws.on('open', r));
  const r = await evalOn(ws, `(function(){
    const allBtns = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
    const trigger = document.querySelector('button[title="导出当前筛选结果"]');
    const csvItem = allBtns.find(t => t === '导出为 CSV');
    const schoolRows = document.querySelectorAll('table tbody tr').length;
    // 查找表格内容样本
    const firstRowCells = Array.from(document.querySelectorAll('table tbody tr:first-child td')).map(td => td.textContent.trim()).slice(0,4);
    return JSON.stringify({
      triggerExists: !!trigger,
      triggerDisabled: trigger ? trigger.disabled : null,
      csvItemVisible: !!csvItem,
      allBtnSamples: allBtns.filter(t => t.includes('导出') || t.includes('视图') || t.includes('CSV')),
      schoolTableRowCount: schoolRows,
      firstRowCells
    });
  })()`);
  console.log('DEBUG:', r.result?.result?.value);
  ws.close(); process.exit(0);
})();
