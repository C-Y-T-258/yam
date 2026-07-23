// 直接 invoke 后端命令检查 DB 数据状态（真实 invoke，未 patch）
const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');
function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}
function evalOn(ws, expr, timeout = 15000) {
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

  // 1. fetch_available_majors
  let r = await evalOn(ws, `(async function(){
    try {
      const inv = window.__TAURI_INTERNALS__.invoke;
      const majors = await inv('fetch_available_majors', {});
      return JSON.stringify({ ok: true, count: majors.length, sample: majors.slice(0,5).map(m=>({code:m.code||m.major_code, name:m.name, school_count:m.school_count})) });
    } catch(e) { return JSON.stringify({ ok: false, error: String(e) }); }
  })()`);
  console.log('fetch_available_majors:', r.result?.result?.value);

  // 2. fetch_workspace_data(['081200'])
  r = await evalOn(ws, `(async function(){
    try {
      const inv = window.__TAURI_INTERNALS__.invoke;
      const data = await inv('fetch_workspace_data', { schoolId: null, majorCodes: ['081200'], filters: null });
      return JSON.stringify({ ok: true, schoolCount: data.schools ? data.schools.length : 'no_schools', deptCount: data.departments ? data.departments.length : 'no_depts', sampleSchool: data.schools && data.schools[0] ? {name: data.schools[0].name, major_code: data.schools[0].major_code, min_score: data.schools[0].min_score} : null });
    } catch(e) { return JSON.stringify({ ok: false, error: String(e) }); }
  })()`);
  console.log('fetch_workspace_data 081200:', r.result?.result?.value);

  ws.close(); process.exit(0);
})();
