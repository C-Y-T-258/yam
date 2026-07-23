// CDP 导航助手：导航到工作区并等待数据加载。
// 用法：确保桌面端已启动（CDP 端口 9223），然后 `node scripts/cdp_navigate_helper.cjs`
// 可用于任何需要从其他页面跳转到工作区并触发数据加载的 CDP 测试场景。
const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');
function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}
function evalOn(ws, expr, timeout = 10000) {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve) => {
    const handler = (m) => { try { const o = JSON.parse(m.toString()); if (o.id === id) { ws.off('message', handler); resolve(o); } } catch (e) {} };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: !!expr.match(/await /), userGesture: true } }));
    setTimeout(() => { ws.off('message', handler); resolve({ error: 'timeout' }); }, timeout);
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.setMaxListeners(50);
  await new Promise(r => ws.on('open', r));

  // 当前页面状态
  let r = await evalOn(ws, `(function(){
    const navBtns = Array.from(document.querySelectorAll('button,a')).map(b=>b.textContent.trim()).filter(t=>t);
    const hasWorkspace = navBtns.some(t => t === '工作区');
    const hasExportTrigger = !!document.querySelector('button[title="导出当前筛选结果"]');
    const hasMajorTab = navBtns.some(t => t === '计算机科学与技术');
    return JSON.stringify({ hasWorkspaceNav: hasWorkspace, hasExportTrigger, hasMajorTab, navSamples: navBtns.slice(0,15) });
  })()`);
  console.log('current:', r.result?.result?.value);

  // 点"工作区"导航
  await evalOn(ws, `(function(){ const b = Array.from(document.querySelectorAll('button,a')).find(x => x.textContent.trim()==='工作区'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
  await sleep(2500);

  // 检查工作区是否显示，数据是否加载
  r = await evalOn(ws, `(function(){
    const trigger = document.querySelector('button[title="导出当前筛选结果"]');
    const rows = document.querySelectorAll('table tbody tr').length;
    const majorTabs = Array.from(document.querySelectorAll('button')).map(b=>b.textContent.trim()).filter(t=>['全部','计算机科学与技术','软件工程'].includes(t));
    return JSON.stringify({ hasTrigger: !!trigger, triggerDisabled: trigger?trigger.disabled:null, rows, majorTabs });
  })()`);
  console.log('after 工作区 click:', r.result?.result?.value);

  // 如果有专业 Tab 但无数据，点一个专业 Tab 触发加载
  let parsed = JSON.parse(r.result?.result?.value || '{}');
  if (parsed.rows === 0 && parsed.majorTabs && parsed.majorTabs.length > 0) {
    await evalOn(ws, `(function(){ const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim()==='计算机科学与技术'); if(b){b.click(); return 'clicked';} return 'NF'; })()`);
    await sleep(3000);
    r = await evalOn(ws, `(function(){
      const trigger = document.querySelector('button[title="导出当前筛选结果"]');
      const rows = document.querySelectorAll('table tbody tr').length;
      return JSON.stringify({ triggerDisabled: trigger?trigger.disabled:null, rows });
    })()`);
    console.log('after major tab click:', r.result?.result?.value);
  }
  ws.close(); process.exit(0);
})();
