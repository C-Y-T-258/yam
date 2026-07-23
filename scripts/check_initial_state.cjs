const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');
const fs = require('fs');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    }).on('error',reject);
  });
}
function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const waiting = new Map();
    const timeout = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('connect timeout')); }, 5000);
    ws.addEventListener('open', () => {
      clearTimeout(timeout);
      const api = {
        send(method, params = {}) {
          const id = nextId++;
          return new Promise((res, rej) => { waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
        },
        eval(expression, awaitPromise = true) {
          return this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }).then(r => r.result?.value ?? JSON.stringify(r));
        },
        screenshot(path) {
          return this.send('Page.captureScreenshot', { format: 'png' }).then(r => {
            fs.writeFileSync(path, Buffer.from(r.data, 'base64'));
            console.log('  📷', path);
          });
        },
        close() { try { ws.close(); } catch {} },
      };
      ws.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        if (data.id && waiting.has(data.id)) {
          const { res, rej } = waiting.get(data.id);
          waiting.delete(data.id);
          if (data.error) rej(data.error); else res(data.result);
        }
      });
      api.send('Runtime.enable').then(() => api.send('Page.enable')).then(() => resolve(api));
    });
    ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket error')); });
  });
}

(async () => {
  const targets = await getTargets();
  const page = targets.find(p => p.url && (p.url.includes('tauri://localhost') || p.url.includes('localhost:1420')));
  const api = await cdpConnect(page.webSocketDebuggerUrl);
  console.log('connected');
  await api.screenshot('d:/yam/scripts/screenshots/initial-state.png');
  const txt = await api.eval('document.body.innerText.slice(0,500)', false);
  console.log('body text:', txt);
  api.close();
})();
