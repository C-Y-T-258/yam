// 通过 CDP 最大化 Tauri 窗口
const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');

const CDP_PORT = 9223;

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

(async () => {
  const targets = await getTargets();
  const page = targets.filter(t => t.type === 'page' && t.webSocketDebuggerUrl).pop();
  if (!page) { console.error('NO PAGE TARGET'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();
  ws.on('message', (m) => {
    const o = JSON.parse(m.toString());
    if (o.id && pending.has(o.id)) { const {res, rej} = pending.get(o.id); pending.delete(o.id); o.error ? rej(o.error) : res(o.result); }
  });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  function send(method, params) {
    return new Promise((res, rej) => { const cur = id++; pending.set(cur, {res, rej}); ws.send(JSON.stringify({ id: cur, method, params })); });
  }

  try {
    await send('Browser.getWindowForTarget', { targetId: page.id });
    const win = await send('Browser.getWindowForTarget', { targetId: page.id });
    console.log('windowId', win.windowId);
    await send('Browser.setWindowBounds', { windowId: win.windowId, bounds: { windowState: 'maximized' } });
    console.log('maximized');
  } catch (e) {
    console.error('maximize failed:', e);
    process.exit(1);
  }
  ws.close();
  process.exit(0);
})();
