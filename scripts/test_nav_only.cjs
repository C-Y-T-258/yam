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

async function clickNav(ws, text) {
  return evalOn(ws, `(function(){
    const nav = document.querySelector('nav');
    if (!nav) return 'NO_NAV';
    const el = Array.from(nav.querySelectorAll('button,a')).find(b => b.textContent.trim() === ${JSON.stringify(text)});
    if (!el) return 'NO_EL';
    el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
    el.click();
    return 'clicked';
  })()`);
}

(async () => {
  const targets = await getTargets();
  const page = targets.filter(t=>t.type==='page'&&t.webSocketDebuggerUrl).pop();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r=>ws.on('open',r));

  const navItems = ['专业管理','数据采集','工作区','设置','帮助','工作区'];
  for (const item of navItems) {
    const r = await clickNav(ws, item);
    console.log('click', item, ':', r.result?.result?.value);
    await sleep(1500);
    const txt = await evalOn(ws, `(function(){ return document.body.innerText.slice(0,80); })()`);
    console.log('  body:', txt.result?.result?.value);
  }
  ws.close();
})();
