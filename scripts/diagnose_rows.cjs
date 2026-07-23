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

  await evalOn(ws, `(function(){ const b=Array.from(document.querySelectorAll('button,a')).find(x=>x.textContent.trim()==='工作区'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
  await sleep(2000);
  await evalOn(ws, `(function(){ const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='计算机科学与技术'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
  await sleep(3000);

  const info = await evalOn(ws, `(function() {
    // 找到可能为 grid 的容器
    const grids = Array.from(document.querySelectorAll('div')).filter(d => {
      const st = window.getComputedStyle(d);
      return st.display === 'grid';
    });
    const gridInfo = grids.slice(0,5).map(g => ({
      className: g.className,
      childCount: g.children.length,
      firstChildClass: g.children[0]?.className,
      firstChildText: g.children[0]?.textContent?.slice(0,40)
    }));

    // 所有直接子元素数量统计
    const allDivs = Array.from(document.querySelectorAll('div'));
    const classCounts = {};
    allDivs.forEach(d => {
      const c = d.className && d.className.split ? d.className.split(' ').pop() : '';
      if (c && c.length < 50) classCounts[c] = (classCounts[c]||0)+1;
    });
    const topClasses = Object.entries(classCounts).sort((a,b)=>b[1]-a[1]).slice(0,20);

    // 行：找包含"学校名称"文本的父容器
    const schoolNameEls = Array.from(document.querySelectorAll('*')).filter(el => el.childNodes.length && Array.from(el.childNodes).some(n => n.nodeType===3 && n.textContent.includes('北京大学')));

    return JSON.stringify({ gridCount: grids.length, gridInfo, topClasses, pekingFound: schoolNameEls.length });
  })()`);

  console.log(JSON.parse(info.result?.result?.value || '{}'));

  // 测试正确 fetch_workspace_data 参数
  const backend = await evalOn(ws, `(async function() {
    try {
      const r = await window.__TAURI_INTERNALS__.invoke('fetch_workspace_data', { schoolId: '', majorCodes: ['081200'] });
      return JSON.stringify({type: typeof r, isArray: Array.isArray(r), len: Array.isArray(r)?r.length:(r?.data?.length), keys: typeof r==='object' && !Array.isArray(r)?Object.keys(r):[], sample: Array.isArray(r)&&r[0]?{keys:Object.keys(r[0]), id:r[0].school_id, name:r[0].name}:null});
    } catch(e) { return 'ERR:'+String(e); }
  })()`);
  console.log('backend correct:', JSON.parse(backend.result?.result?.value || '{}'));

  ws.close();
})();
