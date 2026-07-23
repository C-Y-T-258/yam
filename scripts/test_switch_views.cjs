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

  // 初始状态
  let txt = await evalOn(ws, `(function(){ return document.body.innerText.match(/共[\\s\\u00A0]*([\\d,]+)[\\s\\u00A0]*条结果/)?.[0] || 'NO_MATCH'; })()`);
  console.log('initial:', txt.result?.result?.value);

  // 点招生计划视图
  let clickRes = await evalOn(ws, `(function(){
    const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '招生计划视图');
    console.log('found plan view buttons:', btns.length);
    if (btns.length) { btns[btns.length-1].scrollIntoView({block:'center'}); btns[btns.length-1].click(); return 'clicked'; }
    return 'NF';
  })()`);
  console.log('click plan:', clickRes.result?.result?.value);
  await sleep(3000);
  txt = await evalOn(ws, `(function(){ return document.body.innerText.match(/共[\\s\\u00A0]*([\\d,]+)[\\s\\u00A0]*条结果/)?.[0] || 'NO_MATCH'; })()`);
  console.log('after plan:', txt.result?.result?.value);

  // 点院校视图
  clickRes = await evalOn(ws, `(function(){
    const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '院校视图');
    if (btns.length) { btns[btns.length-1].scrollIntoView({block:'center'}); btns[btns.length-1].click(); return 'clicked'; }
    return 'NF';
  })()`);
  console.log('click school:', clickRes.result?.result?.value);
  await sleep(3000);
  txt = await evalOn(ws, `(function(){ return document.body.innerText.match(/共[\\s\\u00A0]*([\\d,]+)[\\s\\u00A0]*条结果/)?.[0] || 'NO_MATCH'; })()`);
  console.log('after school:', txt.result?.result?.value);

  ws.close();
})();
