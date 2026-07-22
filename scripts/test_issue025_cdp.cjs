// ISSUE-025 CDP 验证 v6：调用 sync_workspace_data + 触发前端重新加载
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const CDP_PORT = 9223;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  const pages = await fetchJSON(`http://localhost:${CDP_PORT}/json`);
  const page = pages.find((p) => p.type === 'page' && p.url.includes('localhost:1420'));
  if (!page) throw new Error('未找到 Tauri 页面');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result.type === 'object' && r.result.subtype === 'error') {
      throw new Error(r.result.description);
    }
    return r.result.value;
  }

  async function screenshot(name) {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    const filePath = path.join(__dirname, 'screenshots', `issue025_${name}.png`);
    if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));
    console.log(`  📸 截图: ${filePath}`);
  }

  await new Promise((r) => ws.on('open', r));

  console.log('=== 步骤 1：调用 sync_workspace_data 同步 081200 ===');
  const syncResult = await evaluate(`
    (async function() {
      try {
        const invoke = window.__TAURI_INTERNALS__.invoke;
        const result = await invoke('sync_workspace_data', { majorCode: '081200' });
        return { success: true, output: result.substring(0, 500) };
      } catch (e) {
        return { success: false, error: (e.message || String(e)).substring(0, 500) };
      }
    })()
  `);
  console.log(`同步结果: ${syncResult.success ? '✓ 成功' : '✗ 失败'}`);
  if (syncResult.success) {
    console.log(`输出: ${syncResult.output}`);
  } else {
    console.log(`错误: ${syncResult.error}`);
  }

  console.log('\n=== 步骤 2：调用 fetch_workspace_data 验证同步后数据 ===');
  const dataAfterSync = await evaluate(`
    (async function() {
      try {
        const invoke = window.__TAURI_INTERNALS__.invoke;
        const data = await invoke('fetch_workspace_data', {
          schoolId: '', majorCode: '081200',
          province: null, provinces: null, regionGroup: null, levels: null,
          sortBy: 'min_score', sortOrder: 'desc',
          minScoreMin: null, minScoreMax: null,
          enrollCountMin: null, enrollCountMax: null,
          departmentName: null, studyModes: null, examTypes: null,
          selfScoring: null, doctoralProgram: null, doubleFirstClass: null,
          specialPlans: null,
          englishMin: null, englishMax: null,
          businessOneMin: null, businessOneMax: null,
          businessTwoMin: null, businessTwoMax: null,
          foreignSubjects: null, businessOneSubjects: null, businessTwoSubjects: null
        });
        const schools = data.schools || [];
        const nonZero = schools.filter(s => s.min_score > 0).length;
        const sample = schools.slice(0, 5).map(s => ({
          name: s.name, min_score: s.min_score, enroll_count: s.enroll_count
        }));
        return { total: schools.length, nonZero, sample };
      } catch (e) {
        return { error: e.message };
      }
    })()
  `);
  console.log(`同步后: ${dataAfterSync.total} 学校, ${dataAfterSync.nonZero} 有分数`);
  dataAfterSync.sample && dataAfterSync.sample.forEach(s => {
    console.log(`  ${s.name}: min_score=${s.min_score}, enroll=${s.enroll_count}`);
  });

  console.log('\n=== 步骤 3：触发前端重新加载（模拟切换页面）===');
  // 点击"工作区"导航按钮，触发 useEffect 重新加载
  await evaluate(`
    (function() {
      const navItems = Array.from(document.querySelectorAll('button, a, [class*="nav"]'));
      const workspaceNav = navItems.find(e => e.textContent.trim() === '工作区');
      if (workspaceNav) {
        workspaceNav.click();
        return 'clicked 工作区 nav';
      }
      return 'not found';
    })()
  `);
  await new Promise((r) => setTimeout(r, 1000));

  // 再点击"刷新数据"按钮
  await evaluate(`
    (function() {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent.trim().includes('刷新数据'));
      if (btn) { btn.click(); return 'clicked 刷新数据'; }
      return 'not found';
    })()
  `);
  console.log('点击"刷新数据"按钮');
  await new Promise((r) => setTimeout(r, 5000));

  console.log('\n=== 步骤 4：验证前端显示 ===');
  const displayCheck = await evaluate(`
    (function() {
      const text = document.body.innerText;
      const lines = text.split('\\n');

      // 找"最低分"列的位置
      const minScoreIdx = lines.findIndex(l => l.trim() === '最低分');

      // 提取表格数据（学校名后面的数字）
      const schoolData = [];
      const schoolNames = ['华中科技大学', '中国人民大学', '南京理工大学', '三峡大学', '上海交通大学'];
      for (const name of schoolNames) {
        const idx = lines.findIndex(l => l.includes(name));
        if (idx >= 0) {
          // 学校名后面紧跟的数字就是 min_score
          const after = lines.slice(idx + 1, idx + 10);
          schoolData.push({
            name: name,
            context: lines.slice(Math.max(0, idx), idx + 8).join(' | ')
          });
        }
      }

      // 统计非零分数数量
      const allNumbers = text.match(/\\b([2-9]\\d{2})\\b/g) || [];
      const scoreRange = allNumbers.filter(n => parseInt(n) >= 250 && parseInt(n) <= 400);

      return {
        minScoreIdx,
        schoolData,
        scoreRangeCount: scoreRange.length,
        scoreSamples: scoreRange.slice(0, 15)
      };
    })()
  `);
  console.log(`"最低分"位置: ${displayCheck.minScoreIdx}`);
  console.log(`分数范围(250-400)数字数量: ${displayCheck.scoreRangeCount}`);
  console.log(`分数样例: ${JSON.stringify(displayCheck.scoreSamples)}`);
  console.log(`\n学校数据:`);
  displayCheck.schoolData.forEach(s => {
    console.log(`  ${s.context}`);
  });

  await screenshot('final_display');

  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('错误:', e.message);
  process.exit(1);
});
