const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');

function getPages() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9223/json', (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(JSON.parse(data)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const waiting = new Map();
    const timeout = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('connect timeout')); }, 5000);
    ws.addEventListener('open', () => {
      clearTimeout(timeout);
      const api = {
        send(method, params = {}) {
          const id = nextId++;
          return new Promise((res, rej) => { waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
        },
        eval(expression, awaitPromise = true) {
          return this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }).then(r => r.result?.value ?? JSON.stringify(r));
        },
        screenshot(path) {
          return this.send('Page.captureScreenshot', { format: 'png' }).then(r => {
            fs.writeFileSync(path, Buffer.from(r.data, 'base64'));
            console.log('  📷', path);
          });
        },
        close() { try { ws.close(); } catch {} },
      };
      ws.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        if (data.id && waiting.has(data.id)) {
          const { res, rej } = waiting.get(data.id);
          waiting.delete(data.id);
          if (data.error) rej(data.error); else res(data.result);
        }
      });
      api.send('Runtime.enable').then(() => api.send('Page.enable')).then(() => resolve(api));
    });
    ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket error')); });
  });
}

async function invoke(api, cmd, args = {}) {
  return JSON.parse(await api.eval(`(async () => JSON.stringify(
    await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})
  ))()`));
}

async function clickByText(api, text) {
  const result = await api.eval(`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const target = buttons.find(b => b.textContent.trim().includes(${JSON.stringify(text)}));
    if (target) { target.scrollIntoView({block:'center', inline:'center'}); target.click(); return JSON.stringify({ ok: true }); }
    return JSON.stringify({ ok: false, avail: buttons.map(b => b.textContent.trim().slice(0, 30)).filter(Boolean).slice(0, 10) });
  })()`, false);
  return JSON.parse(result);
}

(async () => {
  try {
    const pages = await getPages();
    const tauriPage = pages.find(p => p.url && (p.url.includes('tauri://localhost') || p.url.includes('localhost:1420')));
    if (!tauriPage) throw new Error('Tauri 页面未找到');
    const api = await cdpConnect(tauriPage.webSocketDebuggerUrl);
    console.log('已连接 Tauri 桌面端');

    // 截图 1：当前页面
    await api.screenshot('d:/yam/screenshots/01-current-page.png');

    // 尝试导航到工作区并刷新，截图加载状态
    await clickByText(api, '工作区');
    await new Promise(r => setTimeout(r, 800));
    await api.screenshot('d:/yam/screenshots/02-workspace-before-refresh.png');

    // 点击刷新数据按钮
    const refreshBtn = await api.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find(b => b.textContent.trim().includes('刷新数据'));
      if (target) { target.click(); return 'clicked'; }
      return 'not found';
    })()`, false);
    console.log('刷新按钮:', refreshBtn);

    // 等待并截图加载中状态
    await new Promise(r => setTimeout(r, 500));
    await api.screenshot('d:/yam/screenshots/03-workspace-refreshing.png');

    // 等待 3 秒后截图加载完成
    await new Promise(r => setTimeout(r, 3000));
    await api.screenshot('d:/yam/screenshots/04-workspace-after-refresh.png');

    api.close();
    console.log('截图完成');
  } catch (e) {
    console.error('错误:', e.message);
    process.exit(1);
  }
})();
