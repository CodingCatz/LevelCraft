#!/usr/bin/env node
/**
 * check-ui.cjs 的回滾探針 — `node check-ui-rollback-probe.cjs`。
 *
 * 證明 UI 自檢真的守得住：把 index.html／editor.js 複製到暫存目錄，每條軸只弄壞一處出貨行為，
 * 在複本上跑 check-ui.cjs，要求它退出碼 1 且紅在對應案例；未突變的複本必須全過。
 * 工作區檔案全程唯讀（母法第 8 條：探針一律在複本上跑），結束時核對 git status 沒有多出變更。
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FILES = ['index.html', 'editor.js'];

/** [軸名, 期望變紅的案例關鍵字, 突變的原始碼片段, 取代成] — 每條只動一處。 */
const AXES = [
  ['群組互斥', '建立群組與解散群組互斥',
    'const canCreateGroup = selectionIds().length >= 2 && !selectionIds().some(id => groupForElement(id));',
    'const canCreateGroup = selectionIds().length >= 2;'],
  ['連動目標排除 spawn', '目標清單不含 spawn',
    "item.id !== e.id && item.type !== 'spawn' &&", 'item.id !== e.id &&'],
  ['匯入後框住世界', '成功後視圖框住整個世界',
    /deserialize\(d\);(\r?\n)  fitViewToWorld\(\);/, 'deserialize(d);'],
  ['類型改名連帶元素', '改名連帶元素',
    'for (const e of inUse) e.type = name;', ''],
  ['使用中類型禁刪', '使用中類型不能刪除',
    'if (inUse) { alert(typeInUseMessage(inUse)); return; }', ''],
  ['刪除放置類型後改選', '刪掉目前放置的節點類型後節點工具仍正常',
    'if (S.activeType === editingType.name) {', 'if (false) {'],
  ['縮放下限自適應', '大世界匯入後整個可見',
    'return Number.isFinite(fit) && fit > 0 ? Math.min(0.15, fit * 0.9) : 0.15;', 'return 0.15;'],
  ['舊檔路徑轉相對', '舊檔絕對座標匯入後節點位置不變',
    "if (d.pathSpace !== 'relative') for (const e of S.els)", "if (false) for (const e of S.els)"],
  ['路徑節點跟著元素', '元素拖曳／方向鍵／群組搬移／複製後節點跟著走',
    'function pathNodeWorld(e, p) { const c = centerOf(e); return { x: c.x + p.x, y: c.y + p.y }; }',
    'const pathAnchorAtLoad = new WeakMap(); function pathNodeWorld(e, p) { if (!pathAnchorAtLoad.has(e)) pathAnchorAtLoad.set(e, centerOf(e)); const c = pathAnchorAtLoad.get(e); return { x: c.x + p.x, y: c.y + p.y }; }'],
  ['重名驗證在 pushUndo 之前', '名稱重複擋下且不留 undo',
    "if (S.types.some(t => t !== editingType && t.name === name)) { alert('類型名稱重複'); return; }",
    "pushUndo(); if (S.types.some(t => t !== editingType && t.name === name)) { alert('類型名稱重複'); return; }"],
];

function gitStatus() { return spawnSync('git', ['status', '--porcelain'], { cwd: __dirname, encoding: 'utf8' }).stdout; }

function runCheck(root) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'check-ui.cjs')], { env: { ...process.env, LEVELCRAFT_UI_ROOT: root }, encoding: 'utf8', timeout: 180000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const statusBefore = gitStatus();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'levelcraft-ui-probe-'));
let failed = 0;
try {
  for (const f of FILES) fs.copyFileSync(path.join(__dirname, f), path.join(work, f));
  const pristine = fs.readFileSync(path.join(work, 'editor.js'), 'utf8');

  const base = runCheck(work);
  if (base.code === 2) { console.log('SKIP  找不到瀏覽器，無法做回滾實測。這不是通過。'); process.exit(2); }
  console.log(`${base.code === 0 ? 'PASS' : 'FAIL'}  基準（未突變複本）全過，退出碼 ${base.code}`);
  if (base.code !== 0) { failed++; console.log(base.out); }

  for (const [name, expectRed, from, to] of AXES) {
    const hit = typeof from === 'string' ? pristine.includes(from) : from.test(pristine);
    if (!hit) { failed++; console.log(`FAIL  ${name}：突變目標抽不到（editor.js 改過了就同步這條軸）`); continue; }
    fs.writeFileSync(path.join(work, 'editor.js'), pristine.replace(from, to), 'utf8');
    const r = runCheck(work);
    const redLine = r.out.split('\n').find(line => line.startsWith('FAIL') && line.includes(expectRed));
    const ok = r.code === 1 && Boolean(redLine);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}：退出碼 ${r.code}${redLine ? `，紅在「${redLine.replace(/^FAIL\s+/, '')}」` : '，對應案例沒有轉紅'}`);
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
const statusAfter = gitStatus();
if (statusAfter !== statusBefore) { failed++; console.log(`FAIL  探針改動了工作區：\n${statusAfter}`); }
else console.log('PASS  探針前後 git status 相同');
console.log(failed ? `\n${failed} 項未過` : `\n回滾實測：${AXES.length} 條軸全部轉紅，基準全綠`);
process.exit(failed ? 1 : 0);
