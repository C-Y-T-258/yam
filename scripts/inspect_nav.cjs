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
  const page = targets.filter(t=>t.type==='page'&&t.webSocketDebuggerUrl).pop();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r=>ws.on('open',r));

  const info = await evalOn(ws, `(function(){
    const navItems = ['专业管理','数据采集','工作区','设置','帮助'];
    return JSON.stringify(navItems.map(text => {
      const els = Array.from(document.querySelectorAll('button,a')).filter(b => b.textContent.trim() === text);
      return els.map(el => ({
        tag: el.tagName,
        className: el.className,
        href: el.href || null,
        disabled: el.disabled,
        rect: el.getBoundingClientRect ? {top: el.getBoundingClientRect().top, left: el.getBoundingClientRect().left, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height} : null,
        hasOnClick: !!el.onclick,
        parentTag: el.parentElement?.tagName
      }));
    }));
  })()`);
  console.log(JSON.parse(info.result?.result?.value || '[]'));

  // 尝试点设置
  await evalOn(ws, `(function(){
    const el = Array.from(document.querySelectorAll('button,a')).filter(b => b.textContent.trim() === '设置').pop();
    if (!el) return 'NF';
    // 模拟真实鼠标事件
    el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true, buttons:1}));
    el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, button:0}));
    el.click();
    return 'clicked ' + el.tagName;
  })()`);
  await sleep(2000);
  const txt = await evalOn(ws, `(function(){ return document.body.innerText.slice(0,300); })()`);
  console.log('after click:', txt.result?.result?.value);

  ws.close();
})();
