// 测试后端是否整体挂起：先试简单命令 fetch_available_majors，再试 fetch_workspace_data
const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');
function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}
function evalOn(ws, expr, timeout = 12000) {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve) => {
    const handler = (m) => { try { const o = JSON.parse(m.toString()); if (o.id === id) { ws.off('message', handler); resolve(o); } } catch (e) {} };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true } }));
    setTimeout(() => { ws.off('message', handler); resolve({ error: 'timeout' }); }, timeout);
  });
}
(async () => {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.setMaxListeners(50);
  await new Promise(r => ws.on('open', r));

  // 简单命令：fetch_available_majors
  let r = await evalOn(ws, `(async function(){
    try {
      const t0 = Date.now();
      const majors = await window.__TAURI_INTERNALS__.invoke('fetch_available_majors', {});
      return JSON.stringify({ cmd: 'fetch_available_majors', ok: Array.isArray(majors), count: Array.isArray(majors)?majors.length:0, ms: Date.now()-t0 });
    } catch(e) { return JSON.stringify({ cmd: 'fetch_available_majors', err: String(e) }); }
  })()`);
  console.log('1) fetch_available_majors:', r.error ? 'TIMEOUT' : r.result?.result?.value);

  // fetch_workspace_data
  r = await evalOn(ws, `(async function(){
    try {
      const t0 = Date.now();
      const data = await window.__TAURI_INTERNALS__.invoke('fetch_workspace_data', { schoolId: null, majorCodes: ['081200'], filters: null });
      return JSON.stringify({ cmd: 'fetch_workspace_data', ok: !!data, schoolCount: data&&data.schools?data.schools.length:0, ms: Date.now()-t0 });
    } catch(e) { return JSON.stringify({ cmd: 'fetch_workspace_data', err: String(e) }); }
  })()`);
  console.log('2) fetch_workspace_data:', r.error ? 'TIMEOUT' : r.result?.result?.value);

  ws.close(); process.exit(0);
})();
