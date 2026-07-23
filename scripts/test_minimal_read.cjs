const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    }).on('error',reject);
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

(async () => {
  const api = await connect();
  console.log('connected');
  await sleep(1000);
  const txt = await api.eval('document.body.innerText.slice(0,500)', false);
  console.log('body text:', txt);
  const match = await api.eval(`(() => { const t=document.body.innerText; const m=t.match(/共\s*([\d,]+)\s*条结果/); return m?m[0]:'NO_MATCH'; })()`, false);
  console.log('match:', match);
  api.close();
})();
