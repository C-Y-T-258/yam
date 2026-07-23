// CDP invoke 恢复工具：清除可能残留的 monkey-patch，恢复原始 invoke。
// 用法：`node scripts/cdp_restore_invoke.cjs`
// 当 CDP 测试中 monkey-patch 未正常清理（如测试中途崩溃）导致 invoke 被拦截时，运行此脚本恢复。
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
  let r = await evalOn(ws, `(function(){
    const has = !!window.__origInvoke;
    if (window.__origInvoke) {
      window.__TAURI_INTERNALS__.invoke = window.__origInvoke;
      delete window.__origInvoke;
    }
    delete window.__capturedInvokes;
    return JSON.stringify({ hadPatch: has, restored: true, isRealNow: typeof window.__TAURI_INTERNALS__.invoke });
  })()`);
  console.log('RESTORE:', r.result?.result?.value);
  // 验证：fetch_available_majors 应返回数组
  r = await evalOn(ws, `(async function(){
    try {
      const majors = await window.__TAURI_INTERNALS__.invoke('fetch_available_majors', {});
      return JSON.stringify({ ok: Array.isArray(majors), count: Array.isArray(majors) ? majors.length : typeof majors, sample: Array.isArray(majors) && majors[0] ? (majors[0].code||majors[0].major_code) + '/' + majors[0].name : null });
    } catch(e) { return JSON.stringify({ ok: false, error: String(e) }); }
  })()`, 15000);
  console.log('VERIFY fetch_available_majors:', r.result?.result?.value);
  ws.close(); process.exit(0);
})();
