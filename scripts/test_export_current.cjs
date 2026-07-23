const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    }).on('error',reject);
  });
}
function evalOn(ws, expr, timeout=15000) {
  return new Promise((resolve) => {
    const id = Math.floor(Math.random()*1e9);
    const handler = (m) => { try { const o=JSON.parse(m.toString()); if(o.id===id){ws.off('message',handler); resolve(o);} } catch(e){} };
    ws.on('message', handler);
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression:expr, returnByValue:true, awaitPromise:!!expr.match(/await /), userGesture:true}}));
    setTimeout(()=>{ws.off('message',handler); resolve({error:'timeout'});}, timeout);
  });
}
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

(async () => {
  const targets = await getTargets();
  const page = targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r=>ws.on('open',r));

  // monkey patch
  await evalOn(ws, `(function(){
    window.__capturedInvokes = [];
    if (!window.__origInvoke) window.__origInvoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = function(cmd, args, options) {
      if (cmd === 'export_file' || cmd === 'export_excel') {
        window.__capturedInvokes.push({ cmd: String(cmd), args: args || {} });
        const ext = cmd === 'export_excel' ? 'xlsx' : ((args && args.ext) || 'bin');
        return Promise.resolve('C:\\\\fake\\\\test.' + ext);
      }
      return window.__origInvoke(cmd, args, options);
    };
    return 'patched';
  })()`);
  await sleep(200);

  // 确保在院校视图
  await evalOn(ws, `(function(){ const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='院校视图'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
  await sleep(1500);

  // 点"导出"打开下拉
  await evalOn(ws, `(function(){ const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='导出'); if(b){b.click(); return 'clicked';} return 'NF|avail='+Array.from(document.querySelectorAll('button')).map(x=>x.textContent.trim().slice(0,20)).filter(Boolean).slice(0,10).join(','); })()`);
  await sleep(600);

  // 点 CSV
  await evalOn(ws, `(function(){ const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='导出为 CSV'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
  await sleep(500);

  const captured = await evalOn(ws, `(function(){ const arr = window.__capturedInvokes || []; window.__capturedInvokes = []; return JSON.stringify(arr); })()`);
  console.log('captured:', JSON.parse(captured.result?.result?.value || '[]').pop());

  // 恢复
  await evalOn(ws, `(function(){ if (window.__origInvoke) { window.__TAURI_INTERNALS__.invoke = window.__origInvoke; delete window.__origInvoke; } delete window.__capturedInvokes; return 'restored'; })()`);
  ws.close();
})();
