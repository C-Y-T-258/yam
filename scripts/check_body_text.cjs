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
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression:expr, returnByValue:true, awaitPromise:false, userGesture:true}}));
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
  await evalOn(ws, `(function(){ const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='计算机科学与技术'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
  await sleep(5000);

  // 检查 body.innerText 和 match
  const txt = await evalOn(ws, `(function(){ return document.body.innerText.slice(0,600); })()`);
  console.log('body text:', txt.result?.result?.value);
  const match = await evalOn(ws, `(function(){ const t=document.body.innerText; const m=t.match(/共\\s*([\\d,]+)\\s*条结果/); return m?m[0]:'NO_MATCH'; })()`);
  console.log('match:', match.result?.result?.value);
  const count = await evalOn(ws, `(function(){ const rows = Array.from(document.querySelectorAll('div.grid')).filter(g => { const cls=g.className||''; return cls.includes('grid-cols-') && cls.includes('border-b') && !cls.includes('bg-gray-50'); }); return rows.length; })()`);
  console.log('row count:', count.result?.result?.value);

  ws.close();
})();
