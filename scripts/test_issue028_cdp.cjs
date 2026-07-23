// ISSUE-028 CDP 自测：monkey-patch invoke 拦截，验证 CSV/Excel/JSON 三格式 × 两视图。
// 用法：确保桌面端已启动（npm run tauri dev，CDP 端口 9223），工作区有数据，然后 `node scripts/test_issue028_cdp.cjs`
// 关键设计：monkey-patch 仅拦截 export_file/export_excel，其他 invoke 委托给真实实现，
// 避免切换招生计划视图（fetch_workspace_plans）时数据加载被拦截导致测试失败。
const WebSocket = require('d:/yam/yam-desktop/node_modules/ws');
const http = require('http');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

function evalOn(ws, expr, awaitPromise = false, timeout = 10000) {
  const id = Math.floor(Math.random() * 1e9);
  return new Promise((resolve) => {
    const handler = (m) => {
      try { const o = JSON.parse(m.toString()); if (o.id === id) { ws.off('message', handler); resolve(o); } } catch (e) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise, userGesture: true } }));
    setTimeout(() => { ws.off('message', handler); resolve({ error: 'timeout' }); }, timeout);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) { console.log('NO PAGE TARGET'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.setMaxListeners(50);
  await new Promise(r => ws.on('open', r));

  const results = [];
  const pass = (name, cond) => results.push({ name, ok: !!cond });

  // 1. 安装 monkey-patch（仅拦截 export_file/export_excel，其他委托真实 invoke）
  let patchRes = await evalOn(ws, `(function(){
    window.__capturedInvokes = [];
    if (!window.__origInvoke) window.__origInvoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = function(cmd, args, options) {
      // 仅拦截导出命令，其他命令委托给真实 invoke（避免数据加载被拦截）
      if (cmd === 'export_file' || cmd === 'export_excel') {
        window.__capturedInvokes.push({ cmd: String(cmd), args: args || {} });
        const ext = cmd === 'export_excel' ? 'xlsx' : ((args && args.ext) || 'bin');
        return Promise.resolve('C:\\\\fake\\\\test_' + Date.now() + '.' + ext);
      }
      return window.__origInvoke(cmd, args, options);
    };
    return 'patched';
  })()`);
  pass('安装 invoke monkey-patch', patchRes.result?.result?.value === 'patched');
  await sleep(200);

  async function clickByTitle(title) {
    return evalOn(ws, `(function(){
      const b = document.querySelector('button[title=${JSON.stringify(title)}]');
      if (!b) return 'NOT_FOUND';
      b.click(); return 'clicked';
    })()`);
  }
  async function clickExactText(text) {
    return evalOn(ws, `(function(){
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === ${JSON.stringify(text)});
      if (!b) return 'NOT_FOUND';
      b.click(); return 'clicked';
    })()`);
  }
  async function isOpen(text) {
    const r = await evalOn(ws, `(function(){
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === ${JSON.stringify(text)});
      return b ? 'yes' : 'no';
    })()`);
    return r.result?.result?.value === 'yes';
  }
  async function readCaptured() {
    const r = await evalOn(ws, `(function(){
      const arr = window.__capturedInvokes || [];
      window.__capturedInvokes = [];
      return JSON.stringify(arr);
    })()`);
    try { return JSON.parse(r.result?.result?.value || '[]'); } catch (e) { return []; }
  }
  async function testFormat(format) {
    const itemText = format === 'csv' ? '导出为 CSV' : format === 'excel' ? '导出为 Excel' : '导出为 JSON';
    if (!(await isOpen(itemText))) {
      await clickByTitle('导出当前筛选结果');
      await sleep(300);
    }
    const clickRes = await clickExactText(itemText);
    await sleep(450);
    const captured = await readCaptured();
    return { clickRes, last: captured[captured.length - 1] };
  }

  // === 院校视图 ===
  await clickExactText('院校视图');
  await sleep(500);

  let r = await testFormat('csv');
  pass('院校CSV: 点击触发', r.clickRes === 'clicked');
  pass('院校CSV: cmd=export_file', r.last?.cmd === 'export_file');
  pass('院校CSV: ext=csv', r.last?.args?.ext === 'csv');
  pass('院校CSV: 文件名.csv', String(r.last?.args?.defaultFilename || '').endsWith('.csv'));
  pass('院校CSV: BOM', String(r.last?.args?.content || '').startsWith('\uFEFF'));
  pass('院校CSV: 含"院校代码"', String(r.last?.args?.content || '').includes('院校代码'));
  pass('院校CSV: 含"985"', String(r.last?.args?.content || '').includes('985'));

  r = await testFormat('excel');
  pass('院校Excel: cmd=export_excel', r.last?.cmd === 'export_excel');
  pass('院校Excel: 文件名.xlsx', String(r.last?.args?.defaultFilename || '').endsWith('.xlsx'));
  pass('院校Excel: sheetName=院校列表', r.last?.args?.sheetName === '院校列表');
  pass('院校Excel: headers=13', Array.isArray(r.last?.args?.headers) && r.last.args.headers.length === 13);
  pass('院校Excel: headers[0]=院校代码', r.last?.args?.headers?.[0] === '院校代码');
  pass('院校Excel: rows非空', Array.isArray(r.last?.args?.rows) && r.last.args.rows.length > 0);
  pass('院校Excel: rows[0]长度13', Array.isArray(r.last?.args?.rows?.[0]) && r.last.args.rows[0].length === 13);
  if (r.last?.args?.rows?.[0]) {
    const row0 = r.last.args.rows[0];
    pass('院校Excel: 院校代码列=string', typeof row0[0] === 'string');
    pass('院校Excel: 最低分列=number', typeof row0[6] === 'number');
  }

  r = await testFormat('json');
  pass('院校JSON: cmd=export_file', r.last?.cmd === 'export_file');
  pass('院校JSON: ext=json', r.last?.args?.ext === 'json');
  pass('院校JSON: 文件名.json', String(r.last?.args?.defaultFilename || '').endsWith('.json'));
  let jp = null; try { jp = JSON.parse(r.last?.args?.content); } catch (e) {}
  pass('院校JSON: 合法JSON', !!jp);
  pass('院校JSON: view_mode=school', jp?.view_mode === 'school');
  pass('院校JSON: columns数组', Array.isArray(jp?.columns));
  pass('院校JSON: rows非空', Array.isArray(jp?.rows) && jp.rows.length > 0);
  pass('院校JSON: rows[0]含major_name', !!jp?.rows?.[0]?.major_name);
  pass('院校JSON: rows[0]含school_code', !!jp?.rows?.[0]?.school_code);
  pass('院校JSON: row_count匹配', jp?.row_count === jp?.rows?.length);

  // === 招生计划视图 ===
  await clickExactText('招生计划视图');
  await sleep(1000);

  r = await testFormat('csv');
  pass('计划CSV: cmd=export_file', r.last?.cmd === 'export_file');
  pass('计划CSV: ext=csv', r.last?.args?.ext === 'csv');
  pass('计划CSV: 含_招生计划_', String(r.last?.args?.defaultFilename || '').includes('_招生计划_'));
  pass('计划CSV: 含"考试科目"', String(r.last?.args?.content || '').includes('考试科目'));

  r = await testFormat('excel');
  pass('计划Excel: cmd=export_excel', r.last?.cmd === 'export_excel');
  pass('计划Excel: sheetName=招生计划', r.last?.args?.sheetName === '招生计划');
  pass('计划Excel: headers=15', Array.isArray(r.last?.args?.headers) && r.last.args.headers.length === 15);
  pass('计划Excel: 含"考试科目"', (r.last?.args?.headers || []).includes('考试科目'));
  pass('计划Excel: rows[0]长度15', Array.isArray(r.last?.args?.rows?.[0]) && r.last.args.rows[0].length === 15);
  if (r.last?.args?.rows?.[0]) {
    const row0 = r.last.args.rows[0];
    pass('计划Excel: 专业代码列=string', typeof row0[2] === 'string');
    pass('计划Excel: 最低分列=number', typeof row0[13] === 'number');
  }

  r = await testFormat('json');
  pass('计划JSON: ext=json', r.last?.args?.ext === 'json');
  pass('计划JSON: 含_招生计划_', String(r.last?.args?.defaultFilename || '').includes('_招生计划_'));
  try { jp = JSON.parse(r.last?.args?.content); } catch (e) { jp = null; }
  pass('计划JSON: view_mode=plan', jp?.view_mode === 'plan');
  pass('计划JSON: rows[0]含years数组', Array.isArray(jp?.rows?.[0]?.years));
  pass('计划JSON: rows[0]含exam_subjects', Array.isArray(jp?.rows?.[0]?.exam_subjects));

  // 恢复 invoke（finally 语义，确保即使测试失败也恢复）
  await evalOn(ws, `(function(){ if (window.__origInvoke) { window.__TAURI_INTERNALS__.invoke = window.__origInvoke; delete window.__origInvoke; } return 'restored'; })()`);

  let ok = 0, fail = 0;
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}`);
    if (r.ok) ok++; else fail++;
  }
  console.log(`\n合计: ${ok} 通过, ${fail} 失败`);
  ws.close();
  process.exit(fail > 0 ? 1 : 0);
})();
