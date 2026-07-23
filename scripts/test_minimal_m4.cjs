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
      async invoke(cmd, args = {}) {
        const r = await this.eval(`(async () => { try { return JSON.stringify(await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})); } catch(e) { return JSON.stringify({__error: String(e)}); } })()`, true, 60000);
        try { return JSON.parse(r); } catch { return r; }
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

  const majors = await api.invoke('fetch_available_majors');
  console.log('M1 count:', majors.length);

  // 直接点计算机科学与技术
  const clickRes = await api.eval(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === '计算机科学与技术');
    if (b) { b.scrollIntoView({block:'center'}); b.click(); return 'clicked'; }
    return 'NF';
  })()`, false);
  console.log('click:', clickRes);
  await sleep(4000);

  const totalText = await api.eval(`(() => { const t = document.body.innerText; const m = t.match(/共\s*([\d,]+)\s*条结果/); return m ? m[0] : 'NO_MATCH'; })()`, false);
  console.log('totalText:', totalText);

  const rows = await api.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => {
      const cls = g.className || '';
      return cls.includes('grid-cols-') && cls.includes('border-b') && !(cls.includes('bg-gray-50 ') || cls.endsWith('bg-gray-50'));
    });
    return rows.length;
  })()`, false);
  console.log('rows:', rows);

  const backend = await api.invoke('fetch_workspace_data', { schoolId: '', majorCodes: ['081200'] });
  console.log('backend:', backend?.schools?.length);

  api.close();
})();
