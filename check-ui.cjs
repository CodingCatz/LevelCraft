#!/usr/bin/env node
/**
 * 瀏覽器 UI 回歸自檢 — 零依賴，`node check-ui.cjs`（需 Node 22+ 與本機 Chrome／Edge／Chromium）。
 *
 * 用無頭瀏覽器開本機靜態伺服器上的 index.html，透過 Chrome DevTools Protocol 送真實滑鼠／鍵盤事件、
 * 點真實 DOM 按鈕，再讀頁面全域狀態 S 驗證行為。守的是 check-import.cjs 摸不到的編輯器互動：
 * 工具箱條件渲染、群組、類型對話框、連動、匯入、undo／redo。
 *
 * 退出碼：0 全過；1 有斷言失敗或執行錯誤；2 找不到瀏覽器（SKIP，不算通過）。
 * 環境變數：CHROME_PATH 指定瀏覽器；LEVELCRAFT_UI_ROOT 改服務別的目錄（回滾探針在複本上跑用）。
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(process.env.LEVELCRAFT_UI_ROOT || __dirname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// ---------- 瀏覽器與伺服器 ----------

/** 有設 CHROME_PATH 就只認它（不默默退回別的瀏覽器）；否則找各平台常見安裝位置。找不到回 null。 */
function findBrowser() {
  if (process.env.CHROME_PATH) return fs.existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  const candidates = [];
  if (process.platform === 'win32') {
    for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)) {
      candidates.push(path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    for (const dir of (process.env.PATH || '').split(':')) {
      for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) candidates.push(path.join(dir, name));
    }
    candidates.push('/opt/pw-browsers/chromium');
  }
  return candidates.find(p => p && fs.existsSync(p) && fs.statSync(p).isFile()) || null;
}

/** 只讀的靜態伺服器，鎖在 ROOT 底下。 */
function startServer() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function waitFor(fn, timeoutMs, label) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) throw new Error(`逾時：${label}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

/** 最小 CDP 用戶端：一條 WebSocket 接一個 page target。 */
class Cdp {
  constructor(ws) {
    this.ws = ws; this.nextId = 1; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) for (const fn of this.handlers.get(msg.method) || []) fn(msg.params);
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(method, fn) { this.handlers.set(method, [...(this.handlers.get(method) || []), fn]); }
}

// ---------- 頁面操作 ----------

let cdp, baseUrl;
const dialogs = []; // alert／confirm 的訊息，一律按確定

/** 在頁面全域範圍求值（看得到 S、undoStack 等頂層宣告），回傳可序列化結果。 */
async function ev(expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`頁面例外：${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}

/** 重新載入乾淨頁面並灌入關卡；localStorage 在 editor.js 執行前就清掉，避免上一個案例的 autosave 混進來。 */
async function freshPage(level) {
  dialogs.length = 0;
  const loaded = new Promise(resolve => cdp.on('Page.loadEventFired', resolve));
  await cdp.send('Page.navigate', { url: baseUrl });
  await loaded;
  await waitFor(() => ev(`typeof S === 'object' && typeof renderAll === 'function'`), 5000, 'editor.js 載入');
  if (level) await ev(`deserialize(${JSON.stringify(level)}); fitViewToWorld(); syncInputs(); renderAll(); undoStack.length = 0; redoStack.length = 0; true`);
}

async function unitToPage(x, y) {
  return ev(`(() => { const r = cw.getBoundingClientRect(), p = toScreen(${x}, ${y}); return { x: r.left + p.x, y: r.top + p.y }; })()`);
}
const mouse = (type, p, buttons = 0) => cdp.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: 1 });

async function clickUnit(x, y) {
  const p = await unitToPage(x, y);
  await mouse('mouseMoved', p); await mouse('mousePressed', p, 1); await mouse('mouseReleased', p);
}
async function dragUnit(from, to) {
  const a = await unitToPage(...from), b = await unitToPage(...to);
  await mouse('mouseMoved', a); await mouse('mousePressed', a, 1);
  for (let i = 1; i <= 6; i++) await mouse('mouseMoved', { x: a.x + (b.x - a.x) * i / 6, y: a.y + (b.y - a.y) * i / 6 }, 1);
  await mouse('mouseReleased', b);
}
const KEYS = { ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40, z: 90, y: 89 };
async function press(key, { ctrl = false } = {}) {
  await ev(`document.activeElement?.blur(); true`);
  const base = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: KEYS[key], modifiers: ctrl ? 2 : 0 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const clickButton = id => ev(`(() => { const b = document.getElementById(${JSON.stringify(id)}); if (!b) throw new Error('找不到按鈕 #${id}'); b.click(); return true; })()`);
const toolboxIds = () => ev(`[...document.querySelectorAll('#toolboxActions button')].map(b => b.id)`);
const selection = () => ev(`selectionIds().slice().sort()`);
const el = id => ev(`structuredClone(S.els.find(e => e.id === ${JSON.stringify(id)}) || null)`);

// ---------- 測資 ----------

const LEVEL = {
  format: 'levelcraft/v1', name: 'ui-check', world: { wUnit: 40, hUnit: 20 }, snap: 0.5, spawnUnit: { x: 3, y: 15 },
  elements: [
    { id: 'g1', kind: 'rect', type: 'ground', xUnit: 2, yUnit: 10, wUnit: 4, hUnit: 2 },
    { id: 'g2', kind: 'rect', type: 'ground', xUnit: 10, yUnit: 10, wUnit: 4, hUnit: 2 },
    { id: 'w1', kind: 'rect', type: 'wall', xUnit: 20, yUnit: 4, wUnit: 2, hUnit: 6 },
    { id: 'sw1', kind: 'point', type: 'switch', xUnit: 30, yUnit: 5 },
    { id: 'door1', kind: 'point', type: 'door', xUnit: 34, yUnit: 5 },
  ],
};
const GROUPED = { ...LEVEL, editor: { groups: [{ id: 'group-1', memberIds: ['g1', 'g2'] }] } };

// ---------- 案例 ----------

const CASES = [
  ['工具箱：無選取／單選／多選各自只渲染該出現的按鈕', async () => {
    await freshPage(LEVEL);
    assert.deepEqual(await toolboxIds(), [], '無選取時工具箱不得有按鈕');
    await clickUnit(4, 11);
    assert.deepEqual(await selection(), ['g1']);
    assert.deepEqual(await toolboxIds(), ['tbLinksAction', 'tbDel', 'tbDup'], '單選非群組、不可移動類型：只有連動／刪除／複製');
    await clickUnit(25, 18); // 空白處點一下取消選取（會放一個 ground，不影響本案）
    await dragUnit([1, 9], [15, 13]);
    assert.deepEqual(await selection(), ['g1', 'g2'], '框選要選到完整落在框內的兩個方框');
    const ids = await toolboxIds();
    assert.ok(ids.includes('tbGroup') && !ids.includes('tbUngroup'), `多選未分組：只有建立群組 ${ids}`);
  }],

  ['工具箱：建立群組與解散群組互斥', async () => {
    await freshPage(LEVEL);
    await dragUnit([1, 9], [15, 13]);
    await clickButton('tbGroup');
    assert.equal(await ev(`S.groups.length`), 1);
    let ids = await toolboxIds();
    assert.ok(ids.includes('tbUngroup') && !ids.includes('tbGroup'), `已成群組：只有解散群組 ${ids}`);
    await clickUnit(25, 18);
    await clickUnit(12, 11); // 點群組成員
    ids = await toolboxIds();
    assert.ok(ids.includes('tbUngroup') && !ids.includes('tbGroup'), `點群組成員後仍只有解散群組 ${ids}`);
  }],

  ['工具箱：只有 movable 類型的選取元素出現「編輯路徑」', async () => {
    await freshPage(LEVEL);
    await clickButton('tbAddType');
    await ev(`tdName.value = 'platform'; tdMovable.checked = true; true`);
    await clickButton('tdSave');
    assert.equal(await ev(`typeDef('platform')?.movable`), true, '新增類型要帶 movable');
    await clickUnit(25, 17); // activeType 已切到 platform，空白處點一下放置並選取
    assert.equal(await ev(`selected()?.type`), 'platform');
    assert.ok((await toolboxIds()).includes('tbEditPath'), 'movable 類型要出現編輯路徑');
    await clickUnit(4, 11);
    assert.ok(!(await toolboxIds()).includes('tbEditPath'), '非 movable 類型不得出現編輯路徑');
  }],

  ['群組：點任一成員選全組、拖曳與方向鍵整組移動、解散不動位置', async () => {
    await freshPage(GROUPED);
    await clickUnit(12, 11);
    assert.deepEqual(await selection(), ['g1', 'g2'], '點成員要選取整組');
    await dragUnit([4, 11], [7, 11]);
    assert.deepEqual([(await el('g1')).x, (await el('g2')).x], [5, 13], '拖一個成員整組平移 3 單位');
    await press('ArrowRight');
    assert.deepEqual([(await el('g1')).x, (await el('g2')).x], [5.5, 13.5], '方向鍵整組移動一格（snap 0.5）');
    await clickButton('tbUngroup');
    assert.equal(await ev(`S.groups.length`), 0, '解散後不剩群組');
    assert.deepEqual([(await el('g1')).x, (await el('g2')).x], [5.5, 13.5], '解散不得改動位置');
  }],

  ['類型：改名連帶元素（UI 目前沒有編輯既有類型的入口，直接呼叫 openTypeDlg 開對話框）', async () => {
    await freshPage(LEVEL);
    await ev(`openTypeDlg(typeDef('ground')); tdName.value = 'floor'; true`);
    await clickButton('tdSave');
    assert.equal(await ev(`typeDef('ground')`), undefined, '舊名不得殘留');
    assert.deepEqual([(await el('g1')).type, (await el('g2')).type], ['floor', 'floor'], '使用中元素要跟著改名');
  }],

  ['類型：使用中類型禁改形狀', async () => {
    await freshPage(LEVEL);
    await ev(`openTypeDlg(typeDef('wall')); tdShape.value = 'point'; true`);
    await clickButton('tdSave');
    assert.match(dialogs.at(-1) || '', /不能改形狀/, '要跳出不能改形狀的提示');
    assert.equal(await ev(`typeDef('wall').shape`), 'rect');
    await ev(`typeDlg.close(); true`);
  }],

  ['類型：名稱重複擋下且不留 undo', async () => {
    await freshPage(LEVEL);
    const before = await ev(`[undoStack.length, S.types.length]`);
    await clickButton('tbAddType');
    await ev(`tdName.value = 'door'; true`);
    await clickButton('tdSave');
    assert.match(dialogs.at(-1) || '', /名稱重複/);
    assert.deepEqual(await ev(`[undoStack.length, S.types.length]`), before, '失敗的儲存不得留 undo、不得多出類型');
    await ev(`typeDlg.close(); true`);
  }],

  ['類型：使用中類型不能刪除、不留 undo，並說明怎麼處理', async () => {
    await freshPage(LEVEL);
    await ev(`openTypeDlg(typeDef('wall')); true`);
    assert.equal(await ev(`getComputedStyle(tdDelete).display`), 'none', '使用中類型不得渲染刪除鈕');
    assert.match(await ev(`tdInUse.hidden ? '' : tdInUse.textContent`), /有 1 個元素正在使用此類型[\s\S]*改成其他類型/, '要顯示使用數與處理方式');
    const before = await ev(`[undoStack.length, S.types.length]`);
    await ev(`tdDelete.click(); true`); // 就算鈕被叫出來，處理函式本身也要擋
    assert.match(dialogs.at(-1) || '', /有 1 個元素正在使用此類型/);
    assert.deepEqual(await ev(`[undoStack.length, S.types.length]`), before, '擋下的刪除不得留 undo、不得刪掉類型');
    assert.ok(await ev(`Boolean(typeDef('wall'))`));
    await ev(`typeDlg.close(); true`);
  }],

  ['類型：沒在用的類型可刪；刪掉目前放置的節點類型後節點工具仍正常', async () => {
    await freshPage(LEVEL);
    await ev(`S.activeType = 'checkpoint'; setTool('marker'); renderAll(); openTypeDlg(typeDef('checkpoint')); true`);
    assert.equal(await ev(`tdInUse.hidden`), true, '沒在用的類型不顯示使用中說明');
    const undoBefore = await ev(`undoStack.length`);
    await clickButton('tdDelete');
    assert.equal(await ev(`typeDef('checkpoint')`), undefined, '沒在用的類型要能刪');
    assert.equal(await ev(`undoStack.length`), undoBefore + 1, '刪除要留一筆 undo');
    const active = await ev(`typeDef(S.activeType)?.shape`);
    assert.equal(active, 'point', `目前放置類型要改選仍存在的點類型：${await ev('S.activeType')}`);
    await clickUnit(25, 17);
    assert.ok(await ev(`Boolean(typeDef(selected()?.type))`), '之後放置的元素必須有類型定義');
  }],

  ['連動：目標清單不含 spawn、匯出不含懸空 links', async () => {
    await freshPage(LEVEL);
    await clickUnit(30, 5);
    assert.deepEqual(await selection(), ['sw1']);
    await clickButton('tbLinksAction');
    const options = await ev(`[...tbLinkSel.options].map(o => o.value).filter(Boolean)`);
    const spawnId = await ev(`singletonElement('spawn').id`);
    assert.ok(options.includes('door1'), `目標清單要有 door1：${options}`);
    assert.ok(!options.includes(spawnId), `目標清單不得含出生點 ${spawnId}：${options}`);
    await ev(`tbLinkSel.value = 'door1'; true`);
    await clickButton('tbAddLink');
    await clickButton('tbLinkClose');
    assert.deepEqual((await el('sw1')).links, ['door1']);
    await ev(`S.els.find(e => e.id === 'sw1').links.push(${JSON.stringify(spawnId)}, 'ghost'); true`); // 製造懸空參照
    await clickButton('btnExport');
    const out = JSON.parse(await ev(`ioText.value`));
    const ids = new Set(out.elements.map(e => e.id));
    assert.deepEqual(out.elements.find(e => e.id === 'sw1').links, ['door1'], '匯出要濾掉 spawn 與不存在的目標');
    for (const e of out.elements) for (const t of e.links || []) assert.ok(ids.has(t), `${e.id} 連到不存在的 ${t}`);
    await clickButton('ioClose');
  }],

  ['匯入：缺／撞 id 補號，成功後視圖框住整個世界', async () => {
    await freshPage(LEVEL);
    await ev(`S.view.x = 5000; S.view.y = -3000; S.view.zoom = 4; draw(); true`); // 先把視角移到遠處
    const level = { format: 'levelcraft/v1', name: 'imported', world: { wUnit: 200, hUnit: 50 }, elements: [
      { kind: 'rect', type: 'ground', xUnit: 0, yUnit: 40, wUnit: 10, hUnit: 2 },
      { id: 'a', kind: 'point', type: 'key', xUnit: 5, yUnit: 5 },
      { id: 'a', kind: 'point', type: 'door', xUnit: 9, yUnit: 5, links: ['a', 'nope'] },
    ] };
    await clickButton('btnImport');
    await ev(`ioText.value = ${JSON.stringify(JSON.stringify(level))}; true`);
    await clickButton('ioLoad');
    assert.equal(await ev(`ioDlg.open`), false, '成功匯入要關掉對話框');
    const ids = await ev(`S.els.map(e => e.id)`);
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3, `id 要唯一：${ids}`);
    assert.ok(ids.every(Boolean), `不得有空 id：${ids}`);
    const fit = await ev(`(() => { const r = cw.getBoundingClientRect(), a = toScreen(0, 0), b = toScreen(S.world.w, S.world.h);
      return { left: a.x, top: a.y, right: r.width - b.x, bottom: r.height - b.y }; })()`);
    for (const [side, gap] of Object.entries(fit)) assert.ok(gap >= 0, `世界 ${side} 邊跑出畫面：${JSON.stringify(fit)}`);
    assert.ok(Math.abs(fit.left - fit.right) < 1 && Math.abs(fit.top - fit.bottom) < 1, `世界要置中：${JSON.stringify(fit)}`);
  }],

  ['匯入：抽取管線中間檔被擋下並指路，狀態不變', async () => {
    await freshPage(LEVEL);
    const before = await ev(`[S.name, S.els.length, undoStack.length]`);
    await clickButton('btnImport');
    await ev(`ioText.value = ${JSON.stringify(JSON.stringify({ sourceMap: '1-ForsakenCity', sourceRoom: 'a-00', solids: [] }))}; true`);
    await clickButton('ioLoad');
    assert.match(dialogs.at(-1) || '', /中間檔[\s\S]*celeste__/, `要說明是中間檔並指向 celeste__*.json：${dialogs.at(-1)}`);
    assert.deepEqual(await ev(`[S.name, S.els.length, undoStack.length]`), before, '被擋下的匯入不得改狀態或留 undo');
    assert.equal(await ev(`ioDlg.open`), true, '失敗時對話框保持開啟');
    await clickButton('ioClose');
  }],

  ['undo／redo 基本來回', async () => {
    await freshPage(LEVEL);
    const n = await ev(`S.els.length`);
    await ev(`S.activeType = 'ground'; setTool('rect'); true`);
    await clickUnit(25, 17);
    assert.equal(await ev(`S.els.length`), n + 1, '空白處點一下要放置元素');
    await press('z', { ctrl: true });
    assert.equal(await ev(`S.els.length`), n, 'Ctrl+Z 要撤銷放置');
    await press('y', { ctrl: true });
    assert.equal(await ev(`S.els.length`), n + 1, 'Ctrl+Y 要重做放置');
  }],
];

// ---------- 主程式 ----------

async function main() {
  if (typeof WebSocket !== 'function') { console.error('FAIL  需要 Node 22+（內建 WebSocket）'); return 1; }
  const browser = findBrowser();
  if (!browser) {
    console.log(process.env.CHROME_PATH
      ? `SKIP  CHROME_PATH 指向的瀏覽器不存在：${process.env.CHROME_PATH}。這不是通過。`
      : 'SKIP  找不到 Chrome／Edge／Chromium；設 CHROME_PATH 指向瀏覽器執行檔後重跑。這不是通過。');
    return 2;
  }
  const server = await startServer();
  baseUrl = `http://127.0.0.1:${server.address().port}/index.html`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'levelcraft-ui-'));
  const proc = spawn(browser, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
  let failed = 0;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    const port = await waitFor(() => fs.existsSync(portFile) && fs.readFileSync(portFile, 'utf8').split('\n')[0], 15000, '瀏覽器啟動');
    const targets = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter(t => t.type === 'page'), 5000, '取得分頁');
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    cdp = new Cdp(ws);
    cdp.on('Page.javascriptDialogOpening', p => { dialogs.push(p.message); cdp.send('Page.handleJavaScriptDialog', { accept: true }); });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'try { localStorage.clear(); } catch {}' });
    console.log(`瀏覽器 ${path.basename(browser)}；服務目錄 ${ROOT}`);
    for (const [name, run] of CASES) {
      try { await run(); console.log(`PASS  ${name}`); }
      catch (err) { failed++; console.log(`FAIL  ${name}\n      ${err.message.split('\n').join('\n      ')}`); }
    }
    ws.close();
  } finally {
    proc.kill();
    server.close();
    await new Promise(r => setTimeout(r, 300));
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  }
  console.log(failed ? `\n${failed}/${CASES.length} 個案例失敗` : `\n全部 ${CASES.length} 個案例通過`);
  return failed ? 1 : 0;
}

main().then(code => process.exit(code), err => { console.error(`FAIL  執行錯誤：${err.stack || err}`); process.exit(1); });
