// 清理后直接 invoke fetch_workspace_data，看确切响应
const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');
function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}
function evalOn(ws, expr, timeout = 20000) {
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

  // 确认 invoke 是真实的（非 patched）
  let r = await evalOn(ws, `(function(){
    return JSON.stringify({ isPatched: !!window.__origInvoke, typeofInvoke: typeof window.__TAURI_INTERNALS__.invoke });
  })()`);
  console.log('invoke state:', r.result?.result?.value);

  // fetch_workspace_data(['081200']) — 完整响应
  r = await evalOn(ws, `(async function(){
    try {
      const inv = window.__TAURI_INTERNALS__.invoke;
      const data = await inv('fetch_workspace_data', { schoolId: null, majorCodes: ['081200'], filters: null });
      const s = data && data.schools ? data.schools : null;
      return JSON.stringify({
        ok: true,
        type: typeof data,
        hasSchools: !!(data && data.schools),
        schoolCount: s ? s.length : 0,
        deptCount: data && data.departments ? data.departments.length : 0,
        sample: s && s[0] ? { name: s[0].name, major_code: s[0].major_code, min_score: s[0].min_score, school_code: s[0].school_code } : null,
        keys: data ? Object.keys(data) : null
      });
    } catch(e) { return JSON.stringify({ ok: false, error: String(e), stack: e && e.stack ? String(e.stack).slice(0,300) : null }); }
  })()`);
  console.log('fetch_workspace_data:', r.result?.result?.value);
  ws.close(); process.exit(0);
})();
