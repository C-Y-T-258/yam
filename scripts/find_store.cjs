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

(async () => {
  const targets = await getTargets();
  const page = targets.filter(t=>t.type==='page'&&t.webSocketDebuggerUrl).pop();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r=>ws.on('open',r));

  const r = await evalOn(ws, `(function(){
    // 常见全局 store 名
    const names = ['__appStore', '__store', 'appStore', 'store', '__TAURI_INTERNALS__'];
    const found = {};
    for (const n of names) if (window[n]) found[n] = typeof window[n];
    // 尝试通过 webpack/vite 模块暴露
    let viteMap = null;
    try { viteMap = Object.keys(window).filter(k => k.startsWith('__vite')); } catch(e){}
    // React fiber
    let fiber = null;
    const root = document.getElementById('root') || document.body;
    if (root && root._reactRootContainer) fiber = 'root._reactRootContainer';
    return JSON.stringify({found, viteKeys: viteMap, fiber, allKeys: Object.keys(window).filter(k=>k.includes('store')||k.includes('Store')||k.includes('tauri')||k.includes('vite')).slice(0,20)});
  })()`);
  console.log(JSON.parse(r.result?.result?.value || '{}'));
  ws.close();
})();
