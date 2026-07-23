// CDP 探测：检查当前 Tauri 应用页面状态（端口 9223）
const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function evalOn(ws, expr, awaitPromise = false) {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve) => {
    const msg = JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise, userGesture: true } });
    let buf = '';
    ws.on('message', (m) => {
      buf += m.toString();
      try {
        const o = JSON.parse(buf);
        if (o.id === id) { resolve(o); }
      } catch (e) {}
    });
    ws.send(msg);
    setTimeout(() => resolve({ error: 'timeout', buf }), 8000);
  });
}

(async () => {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) { console.log('NO PAGE TARGET'); console.log(JSON.stringify(targets, null, 2)); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  // 探测当前页面：查找工作区特征元素
  const probe = await evalOn(ws, `(function(){
    const hasExportBtn = !!Array.from(document.querySelectorAll('button')).find(b => /导出/.test(b.textContent));
    const hasViewToggle = !!Array.from(document.querySelectorAll('button')).find(b => /院校视图/.test(b.textContent));
    const hasRefresh = !!Array.from(document.querySelectorAll('button')).find(b => /刷新数据/.test(b.textContent));
    const bodyText = document.body.innerText.slice(0, 200);
    return JSON.stringify({ hasExportBtn, hasViewToggle, hasRefresh, bodyText });
  })()`);
  const v = probe.result?.result?.value;
  console.log('PROBE:', v);
  ws.close();
  process.exit(0);
})();
