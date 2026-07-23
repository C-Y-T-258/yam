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

  // 确保院校视图
  await evalOn(ws, `(function(){ const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='院校视图'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
  await sleep(2000);
  await evalOn(ws, `(function(){ const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='计算机科学与技术'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
  await sleep(5000);

  const info = await evalOn(ws, `(function() {
    const grids = Array.from(document.querySelectorAll('div.grid'));
    return JSON.stringify(grids.slice(0,5).map(g => ({
      className: g.className,
      childCount: g.children.length,
      textPreview: g.textContent.slice(0,60)
    })));
  })()`);
  console.log(JSON.parse(info.result?.result?.value || '[]'));

  // 不同选择器计数
  const counts = await evalOn(ws, `(function() {
    const grids = Array.from(document.querySelectorAll('div.grid'));
    return JSON.stringify({
      total: grids.length,
      withBorderB: grids.filter(g => (g.className||'').includes('border-b')).length,
      withGridCols: grids.filter(g => (g.className||'').includes('grid-cols-')).length,
      dataLike: grids.filter(g => {
        const cls = g.className || '';
        return cls.includes('grid-cols-') && cls.includes('border-b') && !cls.includes('bg-gray-50');
      }).length,
      dataLike2: grids.filter(g => {
        const cls = g.className || '';
        return cls.includes('grid-cols-') && !cls.includes('bg-gray-50');
      }).length,
      dataLike3: grids.filter(g => {
        const cls = g.className || '';
        return cls.includes('grid') && cls.includes('border-b') && !cls.includes('bg-gray-50');
      }).length
    });
  })()`);
  console.log(JSON.parse(counts.result?.result?.value || '{}'));

  ws.close();
})();
