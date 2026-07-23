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

  // 切到院校视图
  await evalOn(ws, `(function(){ const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='院校视图'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
  await sleep(2500);
  // 点计算机科学与技术
  await evalOn(ws, `(function(){ const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='计算机科学与技术'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
  await sleep(3000);

  const info = await evalOn(ws, `(function() {
    const grids = Array.from(document.querySelectorAll('div.grid'));
    const header = grids.find(g => (g.className||'').includes('bg-gray-50'));
    const rows = grids.filter(g => {
      const cls = g.className || '';
      return cls.includes('grid-cols-') && cls.includes('border-b') && !cls.includes('bg-gray-50');
    });
    return JSON.stringify({
      header: header ? Array.from(header.children).map(c=>c.textContent.trim()) : [],
      rowCount: rows.length,
      firstRowText: rows[0] ? rows[0].textContent.slice(0,80) : '',
      activeView: Array.from(document.querySelectorAll('button')).find(b=>b.className&&b.className.includes('bg-primary')&&(b.textContent.includes('院校视图')||b.textContent.includes('招生计划视图')))?.textContent.trim() || 'unknown'
    });
  })()`);
  console.log(JSON.parse(info.result?.result?.value || '{}'));

  // 截图
  const shot = await evalOn(ws, `(async function(){
    return new Promise(res => {
      window.__TAURI_INTERNALS__?.invoke ?? (()=>{});
      setTimeout(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        res('ok');
      }, 100);
    });
  })()`);
  // 用 CDP 截图
  const shotId = Math.floor(Math.random()*1e9);
  const shotHandler = (m) => { try { const o=JSON.parse(m.toString()); if(o.id===shotId){ws.off('message',shotHandler); const p='d:/yam/scripts/screenshots/school-view.png'; fs.writeFileSync(p, Buffer.from(o.result.data,'base64')); console.log('saved',p);} } catch(e){} };
  ws.on('message', shotHandler);
  ws.send(JSON.stringify({id:shotId, method:'Page.captureScreenshot', params:{format:'png'}}));
  await sleep(1000);

  ws.close();
})();
