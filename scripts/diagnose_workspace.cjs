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

  // 确保在工作区
  await evalOn(ws, `(function(){ const b=Array.from(document.querySelectorAll('button,a')).find(x=>x.textContent.trim()==='工作区'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
  await sleep(2000);
  // 点计算机科学与技术
  await evalOn(ws, `(function(){ const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='计算机科学与技术'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
  await sleep(3000);

  const diagnostics = await evalOn(ws, `(async function() {
    // 所有可能承载行的元素
    const allTables = document.querySelectorAll('table').length;
    const allRows = document.querySelectorAll('table tbody tr').length;
    const gridRows = document.querySelectorAll('[role="row"]').length;
    const divRows = document.querySelectorAll('div.grid > div, div[class*="row"]').length;

    // 表头
    const headers = Array.from(document.querySelectorAll('th, [role="columnheader"]')).map(x=>x.textContent.trim()).filter(Boolean);

    // 按钮文本
    const buttons = Array.from(document.querySelectorAll('button')).map(b=>b.textContent.trim()).filter(Boolean);

    // fetch_workspace_data 不同参数测试
    let backend1=''; let backend2=''; let backend3='';
    try {
      const r1 = await window.__TAURI_INTERNALS__.invoke('fetch_workspace_data', { schoolId: '', majorCode: '081200' });
      backend1 = JSON.stringify({type: typeof r1, isArray: Array.isArray(r1), len: Array.isArray(r1)?r1.length:(r1?.data?.length), keys: typeof r1==='object' && !Array.isArray(r1)?Object.keys(r1):[], sample: Array.isArray(r1)&&r1[0]?Object.keys(r1[0]).slice(0,5):null});
    } catch(e){ backend1 = 'ERR:'+String(e); }
    try {
      const r2 = await window.__TAURI_INTERNALS__.invoke('fetch_workspace_data', { majorCode: '081200' });
      backend2 = JSON.stringify({type: typeof r2, isArray: Array.isArray(r2), len: Array.isArray(r2)?r2.length:(r2?.data?.length)});
    } catch(e){ backend2 = 'ERR:'+String(e); }
    try {
      const r3 = await window.__TAURI_INTERNALS__.invoke('fetch_workspace_data', { majorCodes: ['081200'] });
      backend3 = JSON.stringify({type: typeof r3, isArray: Array.isArray(r3), len: Array.isArray(r3)?r3.length:(r3?.data?.length)});
    } catch(e){ backend3 = 'ERR:'+String(e); }

    // 导出按钮结构
    const exportBtn = !!document.querySelector('button[title="导出当前筛选结果"]');
    const exportArea = Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.includes('导出')).map(b=>b.textContent.trim());

    // 设置页内容
    const settingsLink = Array.from(document.querySelectorAll('button,a')).find(x=>x.textContent.trim()==='设置');
    if (settingsLink) settingsLink.click();
    await new Promise(r=>setTimeout(r,800));
    const settingsText = document.body.innerText.slice(0,400);

    return JSON.stringify({ allTables, allRows, gridRows, divRows, headers: headers.slice(0,20), buttons: buttons.slice(0,30), backend1, backend2, backend3, exportBtn, exportArea, settingsText });
  })()`);

  console.log(JSON.parse(diagnostics.result?.result?.value || '{}'));
  ws.close();
})();
