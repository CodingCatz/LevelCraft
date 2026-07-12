/* Unit Level Editor — 通用單位座標關卡編輯器
 * 純前端、零依賴、可直接架 GitHub Pages。
 * 共通語言＝「單位」(unit)；1 單位等於多少 px 由使用你 JSON 的遊戲自行定義。
 * 座標系：Y 向下（y 越大越靠下），矩形以左上角 (xUnit,yUnit) 為基準。
 */
'use strict';

// ---------- 預設類型（可自由增刪；只是標籤＋顏色＋形狀，語意由遊戲解讀）----------
const DEFAULT_TYPES = [
  { name: 'ground',  color: '#5568d3', shape: 'rect',  description: '' },
  { name: 'oneway',  color: '#7c8cff', shape: 'rect',  description: '' },
  { name: 'wall',    color: '#3f4a8a', shape: 'rect',  description: '' },
  { name: 'spike',   color: '#fc8181', shape: 'rect',  description: '' },
  { name: 'ladder',  color: '#68d391', shape: 'rect',  description: '' },
  { name: 'spawn',   color: '#f6e05e', shape: 'point', description: '' },
  { name: 'goal',    color: '#4fd1c5', shape: 'point', description: '' },
  { name: 'key',     color: '#f6ad55', shape: 'point', description: '' },
  { name: 'door',    color: '#b794f4', shape: 'point', description: '' },
  { name: 'switch',  color: '#f687b3', shape: 'point', description: '' },
  { name: 'checkpoint', color: '#63b3ed', shape: 'point', description: '' },
];

const VERSION = '0.6.0';
const FORMAT = 'levelcraft/v1';
const LS_KEY = 'levelcraft:autosave';

// ---------- 狀態 ----------
const S = {
  name: 'level-01',
  world: { w: 80, h: 20 },
  snap: 0.5,
  ppu: 20,                 // 螢幕顯示比例（px per unit），不寫入 JSON
  els: [{ id: 'spawn-0', kind: 'point', type: 'spawn', x: 3, y: 15, description: '', props: {}, links: [] }],
  types: DEFAULT_TYPES.map(t => ({ ...t })),
  tool: 'rect',
  activeType: 'ground',
  selId: null,
  multiSelIds: [],
  view: { x: -40, y: -40, zoom: 1 }, // zoom 疊加在 ppu 上；view.x/y 為畫布像素偏移
};

let uid = 1;
function newId(prefix) {
  let id;
  do { id = `${prefix}-${uid++}`; } while (S.els.some(e => e.id === id));
  return id;
}

// ---------- 復原 ----------
const undoStack = [], redoStack = [];
function snapshot() {
  return JSON.stringify({ name: S.name, world: S.world, snap: S.snap, els: S.els, types: S.types });
}
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
function restore(str) {
  const d = JSON.parse(str);
  S.name = d.name; S.world = d.world; S.snap = d.snap; S.els = d.els; S.types = d.types;
  clearSelection();
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); syncInputs(); renderAll(); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); syncInputs(); renderAll(); }

// ---------- DOM ----------
const $ = sel => document.querySelector(sel);
const cv = $('#cv'), ctx = cv.getContext('2d'), cw = $('#cw');
const multiDeleteDlg = $('#multiDeleteDlg');
let pendingDeleteIds = [];

const icon = (name, className = '') => {
  const paths = {
    rect: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 15h6"/>',
    marker: '<path d="m12 3 7 7-7 7-7-7 7-7Z"/><path d="M9 12h6"/>',
    node: '<circle cx="6" cy="7" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="12" cy="17" r="2"/><path d="M7.8 8.2 10.7 15M16.2 8.2 13.3 15"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    point: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    marquee: '<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2"/><path d="M8 9h8M8 15h8"/>',
    pan: '<path d="M8 21V11a1.7 1.7 0 0 1 3.4 0v4.2V7.5a1.7 1.7 0 0 1 3.4 0v7.7V9.4a1.7 1.7 0 0 1 3.4 0v5.8l1-1a1.7 1.7 0 0 1 2.4 2.4l-3.5 3.5A4 4 0 0 1 15.3 22H12a4 4 0 0 1-4-4Z"/>',
    zoom: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5M10.5 8v5M8 10.5h5"/>',
    trash: '<path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13M10 11v5M14 11v5"/>',
    up: '<path d="m7 14 5-5 5 5"/>',
    down: '<path d="m7 10 5 5 5-5"/>',
  };
  return `<svg class="ui-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.rect}</svg>`;
};

// ---------- 座標轉換 ----------
const scale = () => S.ppu * S.view.zoom;
function toScreen(ux, uy) { return { x: ux * scale() + S.view.x, y: uy * scale() + S.view.y }; }
function toUnit(sx, sy) { return { x: (sx - S.view.x) / scale(), y: (sy - S.view.y) / scale() }; }
function snapU(v) { return S.snap > 0 ? Math.round(v / S.snap) * S.snap : v; }
function round4(v) { return Math.round(v * 10000) / 10000; }

// ---------- 類型工具 ----------
function typeDef(name) { return S.types.find(t => t.name === name); }
function typeColor(name) { const t = typeDef(name); return t ? t.color : '#888'; }
function typeShape(name) { const t = typeDef(name); return t ? t.shape : 'rect'; }
function singletonElement(type) { return S.els.find(e => e.type === type); }
function isSingletonType(type) { return type === 'spawn' || type === 'goal'; }
function canUseType(type, exceptId = null) {
  return !isSingletonType(type) || !S.els.some(e => e.type === type && e.id !== exceptId);
}
function singletonLockedMessage(type) {
  return `畫面上已有${type === 'spawn' ? '出生點' : '目的地'}，請先刪除現有的才能新增`;
}
function normalizeSingletonNodes() {
  for (const type of ['spawn', 'goal']) {
    let found = false;
    S.els = S.els.filter(e => e.type !== type || !found && (found = true));
  }
}

// =====================================================================
//  繪製
// =====================================================================
function resizeCanvas() {
  const r = cw.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw() {
  const r = cw.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  drawGrid(r);
  drawWorldBounds();
  for (const e of S.els) if (e.kind === 'rect') drawRect(e);
  for (const e of S.els) if (e.kind === 'point') drawPoint(e);
  drawLinks();
  drawSelection();
  drawMarquee();
}

function drawGrid(r) {
  const s = scale();
  if (s < 4) return;
  const step = s; // 每 1 單位一格
  const major = 5; // 每 5 單位一條主線
  const startU = Math.floor(toUnit(0, 0).x);
  const endU = Math.ceil(toUnit(r.width, 0).x);
  const startV = Math.floor(toUnit(0, 0).y);
  const endV = Math.ceil(toUnit(0, r.height).y);
  ctx.lineWidth = 1;
  for (let u = startU; u <= endU; u++) {
    const x = Math.round(toScreen(u, 0).x) + 0.5;
    ctx.strokeStyle = (u % major === 0) ? '#3a4256' : '#242a38';
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, r.height); ctx.stroke();
  }
  for (let v = startV; v <= endV; v++) {
    const y = Math.round(toScreen(0, v).y) + 0.5;
    ctx.strokeStyle = (v % major === 0) ? '#3a4256' : '#242a38';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(r.width, y); ctx.stroke();
  }
}

function drawWorldBounds() {
  const a = toScreen(0, 0), b = toScreen(S.world.w, S.world.h);
  ctx.save();
  ctx.strokeStyle = '#4fd1c5'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.restore();
}

function drawRect(e) {
  const a = toScreen(e.x, e.y);
  const w = e.w * scale(), h = e.h * scale();
  const col = typeColor(e.type);
  ctx.fillStyle = hexA(col, 0.42);
  ctx.fillRect(a.x, a.y, w, h);
  ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  ctx.strokeRect(a.x + 0.5, a.y + 0.5, w - 1, h - 1);
  if (w > 40 && h > 16) {
    ctx.fillStyle = '#e7eaf3'; ctx.font = '11px ui-sans-serif, sans-serif';
    ctx.fillText(e.type, a.x + 4, a.y + 13);
  }
}

function drawPoint(e) {
  const a = toScreen(e.x, e.y);
  const col = typeColor(e.type);
  const rad = Math.max(6, Math.min(14, 0.45 * scale()));
  ctx.beginPath(); ctx.arc(a.x, a.y, rad, 0, Math.PI * 2);
  ctx.fillStyle = hexA(col, 0.85); ctx.fill();
  ctx.strokeStyle = '#0d0f14'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#cdd3e2'; ctx.font = '11px ui-sans-serif, sans-serif';
  ctx.fillText(`${e.type}`, a.x + rad + 3, a.y + 4);
}

function drawLinks() {
  ctx.save();
  ctx.strokeStyle = '#f6ad55'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
  for (const e of S.els) {
    if (!e.links || !e.links.length) continue;
    const from = centerOf(e);
    for (const tid of e.links) {
      const t = S.els.find(x => x.id === tid); if (!t) continue;
      const to = centerOf(t);
      const A = toScreen(from.x, from.y), B = toScreen(to.x, to.y);
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      // 箭頭
      const ang = Math.atan2(B.y - A.y, B.x - A.x);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(B.x, B.y);
      ctx.lineTo(B.x - 8 * Math.cos(ang - 0.4), B.y - 8 * Math.sin(ang - 0.4));
      ctx.lineTo(B.x - 8 * Math.cos(ang + 0.4), B.y - 8 * Math.sin(ang + 0.4));
      ctx.closePath(); ctx.fillStyle = '#f6ad55'; ctx.fill();
      ctx.setLineDash([4, 3]);
    }
  }
  ctx.restore();
}

function centerOf(e) {
  return e.kind === 'rect' ? { x: e.x + e.w / 2, y: e.y + e.h / 2 } : { x: e.x, y: e.y };
}

function drawSelection() {
  const selectedIds = selectionIds();
  if (!selectedIds.length) return;
  ctx.save();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
  for (const id of selectedIds) {
    const e = S.els.find(item => item.id === id);
    if (!e) continue;
    if (e.kind === 'rect') {
      const a = toScreen(e.x, e.y);
      ctx.strokeRect(a.x - 1, a.y - 1, e.w * scale() + 2, e.h * scale() + 2);
    } else {
      const a = toScreen(e.x, e.y);
      ctx.beginPath(); ctx.arc(a.x, a.y, 16, 0, Math.PI * 2); ctx.stroke();
    }
  }
  const primary = selected();
  if (primary?.kind === 'rect') {
    ctx.setLineDash([]);
    // 縮放把手只顯示在主要選取項，避免多選時產生歧義。
    for (const [hx, hy] of corners(primary)) {
      const p = toScreen(hx, hy);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = typeColor(primary.type); ctx.lineWidth = 1.5;
      ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
      ctx.strokeRect(p.x - 5, p.y - 5, 10, 10);
    }
  }
  ctx.restore();
}

function drawMarquee() {
  if (!drag || drag.mode !== 'marquee') return;
  const a = toScreen(drag.start.x, drag.start.y), b = toScreen(drag.end.x, drag.end.y);
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.restore();
}

function corners(e) { return [[e.x, e.y], [e.x + e.w, e.y], [e.x, e.y + e.h], [e.x + e.w, e.y + e.h]]; }

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// =====================================================================
//  命中測試
// =====================================================================
function selected() { return S.els.find(e => e.id === S.selId) || null; }
function selectionIds() {
  return S.multiSelIds.includes(S.selId) ? S.multiSelIds : (S.selId ? [S.selId] : []);
}
function selectIds(ids) {
  S.multiSelIds = ids;
  S.selId = ids[0] || null;
}
function clearSelection() { selectIds([]); }

function marqueeSelection(a, b) {
  const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
  return S.els.filter(e => {
    if (e.kind === 'point') return e.x >= left && e.x <= right && e.y >= top && e.y <= bottom;
    return e.x >= left && e.x + e.w <= right && e.y >= top && e.y + e.h <= bottom;
  }).map(e => e.id);
}

function hitTest(ux, uy) {
  // 點類型優先（在上層），由後往前
  for (let i = S.els.length - 1; i >= 0; i--) {
    const e = S.els[i];
    if (e.kind === 'point') {
      const r = Math.max(6, Math.min(14, 0.45 * scale())) / scale();
      if (Math.hypot(ux - e.x, uy - e.y) <= r + 0.15) return e;
    }
  }
  for (let i = S.els.length - 1; i >= 0; i--) {
    const e = S.els[i];
    if (e.kind === 'rect' && ux >= e.x && ux <= e.x + e.w && uy >= e.y && uy <= e.y + e.h) return e;
  }
  return null;
}

function hitHandle(e, ux, uy) {
  if (!e || e.kind !== 'rect') return -1;
  const tol = 11 / scale();
  const cs = corners(e);
  for (let i = 0; i < cs.length; i++) if (Math.hypot(ux - cs[i][0], uy - cs[i][1]) <= tol) return i;
  return -1;
}

// =====================================================================
//  滑鼠互動
// =====================================================================
let drag = null; // { mode, ... }
let toolbarTransientStatus = '';
let toolbarTransientTimer = null;
const MARQUEE_THRESHOLD_PX = 4;

function placeActiveType(u) {
  if (!canUseType(S.activeType)) { flashHint(singletonLockedMessage(S.activeType)); renderToolbar(); return; }
  const shape = typeShape(S.activeType);
  pushUndo();
  if (shape === 'rect') {
    const x = snapU(u.x), y = snapU(u.y);
    const e = { id: newId(S.activeType), kind: 'rect', type: S.activeType, x: round4(x), y: round4(y), w: S.snap || 1, h: S.snap || 1, description: '', props: {}, links: [] };
    S.els.push(e); selectIds([e.id]);
  } else {
    const e = { id: newId(S.activeType), kind: 'point', type: S.activeType, x: round4(snapU(u.x)), y: round4(snapU(u.y)), description: '', props: {}, links: [] };
    S.els.push(e); selectIds([e.id]);
  }
  renderAll();
  autosave();
}

function setToolbarTransientStatus(status, duration = 0) {
  toolbarTransientStatus = status;
  clearTimeout(toolbarTransientTimer);
  if (duration) toolbarTransientTimer = setTimeout(() => { toolbarTransientStatus = ''; updateToolbarStatus(); }, duration);
  updateToolbarStatus();
}

function updateToolbarStatus() {
  const indicator = $('#toolStatus');
  if (!indicator) return;
  const status = drag?.mode === 'marquee' ? 'marquee' : drag?.mode === 'pan' ? 'pan' : toolbarTransientStatus;
  if (status === 'marquee') { indicator.innerHTML = icon('marquee'); indicator.style.color = '#fff'; indicator.title = '框選中'; return; }
  if (status === 'pan') { indicator.innerHTML = icon('pan'); indicator.style.color = '#e7eaf3'; indicator.title = '平移中'; return; }
  if (status === 'zoom') { indicator.innerHTML = icon('zoom'); indicator.style.color = '#e7eaf3'; indicator.title = '縮放中'; return; }
  const type = typeDef(S.activeType) || { name: '未知類型', color: '#888', shape: 'rect' };
  indicator.innerHTML = icon(typeCategory(type));
  indicator.style.color = type.color;
  indicator.title = `目前放置：${type.name}`;
}

cw.addEventListener('mousedown', ev => {
  if (ev.target.closest('.bottom-toolbar')) return;
  if (ev.button === 1 || (ev.button === 0 && spaceDown)) { // 平移
    drag = { mode: 'pan', sx: ev.clientX, sy: ev.clientY, vx: S.view.x, vy: S.view.y };
    updateToolbarStatus();
    return;
  }
  if (ev.button !== 0) return;
  const rect = cw.getBoundingClientRect();
  const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
  const u = toUnit(sx, sy);
  const sel = selected();
  const h = hitHandle(sel, u.x, u.y);

  // 縮放把手永遠優先於目前工具，避免剛畫完矩形時誤建立另一個元素。
  if (h >= 0) {
    pushUndo();
    drag = { mode: 'resize', e: sel, handle: h };
    return;
  }

  const hit = hitTest(u.x, u.y);
  if (hit) {
    const ids = selectionIds();
    pushUndo();
    if (ids.length > 1 && ids.includes(hit.id)) {
      const starts = Object.fromEntries(ids.map(id => {
        const element = S.els.find(item => item.id === id);
        return [id, { x: element.x, y: element.y }];
      }));
      drag = { mode: 'moveGroup', ids, starts, grabU: u };
    } else {
      selectIds([hit.id]);
      drag = { mode: 'move', e: hit, grabU: u, ox: hit.x, oy: hit.y };
    }
  } else {
    clearSelection();
    drag = { mode: 'pending', start: u, end: u, sx: ev.clientX, sy: ev.clientY };
  }
  renderAll();
});

cw.addEventListener('contextmenu', ev => {
  if (ev.target.closest('.bottom-toolbar')) return;
  ev.preventDefault();
  const rect = cw.getBoundingClientRect();
  const u = toUnit(ev.clientX - rect.left, ev.clientY - rect.top);
  const hit = hitTest(u.x, u.y);
  if (!hit) return;
  const ids = selectionIds();
  if (ids.length > 1 && ids.includes(hit.id)) {
    showMultiDeleteDialog(ids);
    return;
  }
  selectIds([hit.id]);
  deleteSel();
});

window.addEventListener('mousemove', ev => {
  const rect = cw.getBoundingClientRect();
  const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
  const u = toUnit(sx, sy);
  $('#stCur').textContent = `${round4(snapU(u.x))}, ${round4(snapU(u.y))}`;

  if (!drag) {
    const sel = selected();
    const overHandle = hitHandle(sel, u.x, u.y) >= 0;
    const overElement = hitTest(u.x, u.y) !== null;
    cw.style.cursor = overHandle ? 'nwse-resize' : (overElement ? 'move' : 'crosshair');
  }

  if (!drag) return;
  if (drag.mode === 'pan') {
    cw.style.cursor = 'grabbing';
    S.view.x = drag.vx + (ev.clientX - drag.sx);
    S.view.y = drag.vy + (ev.clientY - drag.sy);
    draw(); return;
  }
  if (drag.mode === 'pending') {
    if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) <= MARQUEE_THRESHOLD_PX) return;
    drag.mode = 'marquee';
    updateToolbarStatus();
  }
  if (drag.mode === 'move') {
    cw.style.cursor = 'move';
    const e = drag.e;
    const dx = u.x - drag.grabU.x, dy = u.y - drag.grabU.y;
    e.x = round4(snapU(drag.ox + dx)); e.y = round4(snapU(drag.oy + dy));
    renderProps(); draw(); return;
  }
  if (drag.mode === 'resize') {
    cw.style.cursor = 'nwse-resize';
    const e = drag.e;
    const nx = snapU(u.x), ny = snapU(u.y);
    const x2 = (drag.handle === 1 || drag.handle === 3) ? nx : e.x + e.w;
    const y2 = (drag.handle === 2 || drag.handle === 3) ? ny : e.y + e.h;
    const x1 = (drag.handle === 0 || drag.handle === 2) ? nx : e.x;
    const y1 = (drag.handle === 0 || drag.handle === 1) ? ny : e.y;
    e.x = round4(Math.min(x1, x2)); e.y = round4(Math.min(y1, y2));
    e.w = round4(Math.max(S.snap || 0.1, Math.abs(x2 - x1)));
    e.h = round4(Math.max(S.snap || 0.1, Math.abs(y2 - y1)));
    renderProps(); draw(); return;
  }
  if (drag.mode === 'moveGroup') {
    cw.style.cursor = 'move';
    const dx = u.x - drag.grabU.x, dy = u.y - drag.grabU.y;
    for (const id of drag.ids) {
      const e = S.els.find(item => item.id === id);
      const start = drag.starts[id];
      if (!e || !start) continue;
      e.x = round4(snapU(start.x + dx)); e.y = round4(snapU(start.y + dy));
    }
    renderProps(); draw(); return;
  }
  if (drag.mode === 'marquee') {
    drag.end = u;
    selectIds(marqueeSelection(drag.start, drag.end));
    renderProps(); renderList(); updateStatus(); draw(); return;
  }
});

window.addEventListener('mouseup', () => {
  if (drag?.mode === 'pending') placeActiveType(drag.start);
  if (drag && (drag.mode === 'move' || drag.mode === 'moveGroup' || drag.mode === 'resize')) autosave();
  drag = null;
  cw.style.cursor = 'crosshair';
  updateToolbarStatus();
  draw();
});

// 縮放（以游標為中心）
cw.addEventListener('wheel', ev => {
  ev.preventDefault();
  const rect = cw.getBoundingClientRect();
  const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
  const before = toUnit(sx, sy);
  const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
  S.view.zoom = Math.min(8, Math.max(0.15, S.view.zoom * factor));
  const after = toUnit(sx, sy);
  S.view.x += (after.x - before.x) * scale();
  S.view.y += (after.y - before.y) * scale();
  $('#stZoom').textContent = Math.round(S.view.zoom * 100) + '%';
  setToolbarTransientStatus('zoom', 450);
  draw();
}, { passive: false });

// =====================================================================
//  鍵盤
// =====================================================================
let spaceDown = false;
window.addEventListener('keydown', ev => {
  if (ev.code === 'Space') { spaceDown = true; }
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (typing) return;

  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undo(); return; }
  if ((ev.ctrlKey || ev.metaKey) && (ev.key.toLowerCase() === 'y' || (ev.shiftKey && ev.key.toLowerCase() === 'z'))) { ev.preventDefault(); redo(); return; }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') { ev.preventDefault(); duplicateSel(); return; }

  const e = selected();
  if (!e) {
    // 工具快捷鍵
    if (ev.key === 'r') setTool('rect');
    if (ev.key === 'm') setTool('marker');
    return;
  }
  if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); deleteSel(); return; }
  const step = ev.shiftKey ? (S.snap || 1) * 5 : (S.snap || 1);
  if (ev.key === 'ArrowLeft')  { pushUndo(); e.x = round4(e.x - step); renderAll(); autosave(); ev.preventDefault(); }
  if (ev.key === 'ArrowRight') { pushUndo(); e.x = round4(e.x + step); renderAll(); autosave(); ev.preventDefault(); }
  if (ev.key === 'ArrowUp')    { pushUndo(); e.y = round4(e.y - step); renderAll(); autosave(); ev.preventDefault(); }
  if (ev.key === 'ArrowDown')  { pushUndo(); e.y = round4(e.y + step); renderAll(); autosave(); ev.preventDefault(); }
});
window.addEventListener('keyup', ev => { if (ev.code === 'Space') spaceDown = false; });

function deleteIds(ids) {
  const idSet = new Set(ids);
  if (!idSet.size) return;
  pushUndo();
  S.els = S.els.filter(x => !idSet.has(x.id));
  for (const x of S.els) if (x.links) x.links = x.links.filter(id => !idSet.has(id));
  clearSelection(); renderAll(); autosave();
}
function deleteSel() { deleteIds(selectionIds()); }

function showMultiDeleteDialog(ids) {
  pendingDeleteIds = [...ids];
  $('#multiDeleteMessage').textContent = `確定要刪除已選取的 ${pendingDeleteIds.length} 個元素嗎？`;
  multiDeleteDlg.showModal();
}

$('#multiDeleteConfirm').addEventListener('click', () => {
  const ids = pendingDeleteIds;
  pendingDeleteIds = [];
  multiDeleteDlg.close();
  deleteIds(ids);
});
$('#multiDeleteCancel').addEventListener('click', () => multiDeleteDlg.close());
multiDeleteDlg.addEventListener('close', () => { pendingDeleteIds = []; });
function duplicateSel() {
  const e = selected(); if (!e) return;
  if (isSingletonType(e.type)) { flashHint(singletonLockedMessage(e.type)); return; }
  pushUndo();
  const c = JSON.parse(JSON.stringify(e));
  c.id = newId(e.type);
  c.x = round4(e.x + (S.snap || 1)); c.y = round4(e.y + (S.snap || 1));
  c.links = [];
  S.els.push(c); selectIds([c.id]); renderAll(); autosave();
}

// =====================================================================
//  UI 渲染
// =====================================================================
function renderAll() { renderToolbar(); renderProps(); renderList(); updateStatus(); draw(); }

function typeCategory(t) {
  if (t.shape === 'rect') return 'rect';
  if (['switch', 'key', 'door'].includes(t.name)) return 'marker';
  return 'node';
}

const CATEGORY_TYPE_ORDER = {
  rect: ['ground', 'oneway', 'wall', 'spike', 'ladder'],
  marker: ['switch', 'key', 'door'],
  node: ['spawn', 'checkpoint', 'goal'],
};

function orderedTypesFor(category) {
  const names = CATEGORY_TYPE_ORDER[category];
  return S.types.filter(t => typeCategory(t) === category).sort((a, b) => {
    const ai = names.indexOf(a.name), bi = names.indexOf(b.name);
    return (ai < 0 ? names.length : ai) - (bi < 0 ? names.length : bi) || a.name.localeCompare(b.name);
  });
}

function renderToolbar() {
  for (const category of ['rect', 'marker', 'node']) {
    const menu = $(`#menu-${category}`);
    menu.innerHTML = '';
    const types = orderedTypesFor(category);
    for (const t of types) {
      const item = document.createElement('button');
      const isLocked = !canUseType(t.name);
      item.className = 'toolbar-item' + (t.name === S.activeType ? ' on' : '') + (isLocked ? ' locked' : '');
      item.disabled = isLocked;
      item.title = isLocked ? singletonLockedMessage(t.name) : `選擇 ${t.name}`;
      item.innerHTML = `<span class="sw" style="background:${t.color}"></span><span class="nm">${escapeHtml(t.name)}</span>${icon(t.shape === 'rect' ? 'rect' : 'point', 'toolbar-item-icon')}`;
      item.onclick = () => { S.activeType = t.name; setTool(t.shape === 'rect' ? 'rect' : 'marker'); closeToolbarMenus(); renderAll(); };
      menu.appendChild(item);
    }
  }
  document.querySelectorAll('[data-category]').forEach(button => {
    const category = button.dataset.category;
    button.classList.toggle('on', typeCategory(typeDef(S.activeType) || { shape: 'rect' }) === category);
  });
  updateToolbarStatus();
}

function renderProps() {
  const box = $('#props');
  const e = selected();
  if (!e) { box.innerHTML = '<div class="small">未選取任何元素。點畫布上的元素以編輯。</div>'; return; }
  const opts = S.types.filter(t => t.shape === e.kind || (e.kind === 'rect' ? t.shape === 'rect' : t.shape === 'point'))
    .map(t => `<option value="${escapeHtml(t.name)}" ${t.name === e.type ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
  let html = `
    <div class="row"><label>ID</label><input type="text" id="pId" value="${escapeHtml(e.id)}"></div>
    <div class="row"><label>類型</label><select id="pType">${opts}<option value="__free">（自訂…）</option></select></div>
    <div class="row" id="pFreeRow" style="display:none"><label>自訂型</label><input type="text" id="pFree" value="${escapeHtml(e.type)}"></div>
    <div class="row"><label>描述</label><textarea id="pDescription" class="description-input" placeholder="留空時沿用類型描述">${escapeHtml(e.description || '')}</textarea></div>
    <div class="grid2">
      <div class="row"><label>x</label><input type="number" id="pX" step="${S.snap || 0.1}" value="${e.x}"></div>
      <div class="row"><label>y</label><input type="number" id="pY" step="${S.snap || 0.1}" value="${e.y}"></div>
    </div>`;
  if (e.kind === 'rect') {
    html += `<div class="grid2">
      <div class="row"><label>w</label><input type="number" id="pW" step="${S.snap || 0.1}" value="${e.w}"></div>
      <div class="row"><label>h</label><input type="number" id="pH" step="${S.snap || 0.1}" value="${e.h}"></div>
    </div>`;
  }
  // 自訂屬性
  html += `<h3 style="margin:10px 0 6px;font-size:11px;color:var(--muted)">自訂屬性 props</h3><div class="props" id="pProps"></div>
    <button id="pAddProp" style="width:100%;margin-top:4px">新增屬性</button>`;
  // 連動
  const linkOpts = S.els.filter(x => x.id !== e.id).map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.id)} (${escapeHtml(x.type)})</option>`).join('');
  html += `<h3 style="margin:12px 0 6px;font-size:11px;color:var(--muted)">連動 links（targetId）</h3>
    <div id="pLinks"></div>
    <div class="row" style="margin-top:4px"><select id="pLinkSel" style="flex:1"><option value="">選目標…</option>${linkOpts}</select>
    <button id="pAddLink">連</button></div>`;
  html += `<div class="row" style="margin-top:10px"><button class="danger" id="pDel" style="flex:1">刪除元素</button>
    <button id="pDup" style="flex:1">複製</button></div>`;
  box.innerHTML = html;

  // props 列
  const pp = $('#pProps');
  for (const [k, v] of Object.entries(e.props || {})) {
    const row = document.createElement('div'); row.className = 'kv';
    row.innerHTML = `<input value="${escapeHtml(k)}" data-k><input value="${escapeHtml(String(v))}" data-v><button data-x title="刪除屬性" aria-label="刪除屬性">${icon('trash')}</button>`;
    row.querySelector('[data-k]').addEventListener('change', ev2 => { const nk = ev2.target.value; const val = e.props[k]; delete e.props[k]; e.props[nk] = val; autosave(); });
    row.querySelector('[data-v]').addEventListener('change', ev2 => { e.props[row.querySelector('[data-k]').value] = ev2.target.value; autosave(); });
    row.querySelector('[data-x]').addEventListener('click', () => { pushUndo(); delete e.props[k]; renderProps(); autosave(); });
    pp.appendChild(row);
  }
  $('#pAddProp').onclick = () => { pushUndo(); e.props = e.props || {}; let i = 1; while (e.props['key' + i] !== undefined) i++; e.props['key' + i] = ''; renderProps(); autosave(); };

  // links 列
  const pl = $('#pLinks');
  for (const tid of (e.links || [])) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<span style="flex:1" class="small">連至 ${escapeHtml(tid)}</span><button data-x class="danger" title="移除連動" aria-label="移除連動">${icon('trash')}</button>`;
    row.querySelector('[data-x]').onclick = () => { pushUndo(); e.links = e.links.filter(x => x !== tid); renderProps(); draw(); autosave(); };
    pl.appendChild(row);
  }
  $('#pAddLink').onclick = () => { const v = $('#pLinkSel').value; if (!v) return; pushUndo(); e.links = e.links || []; if (!e.links.includes(v)) e.links.push(v); renderProps(); draw(); autosave(); };

  // 綁定基本欄位
  $('#pId').onchange = ev2 => { const nv = ev2.target.value.trim(); if (!nv || S.els.some(x => x !== e && x.id === nv)) { flashHint('ID 空白或重複'); renderProps(); return; } pushUndo(); const old = e.id; for (const x of S.els) if (x.links) x.links = x.links.map(id => id === old ? nv : id); e.id = nv; renderAll(); autosave(); };
  const typeSel = $('#pType');
  typeSel.onchange = ev2 => {
    if (ev2.target.value === '__free') { $('#pFreeRow').style.display = ''; return; }
    if (!canUseType(ev2.target.value, e.id)) { flashHint(singletonLockedMessage(ev2.target.value)); renderProps(); return; }
    pushUndo(); e.type = ev2.target.value; renderAll(); autosave();
  };
  $('#pFree').onchange = ev2 => { const nv = ev2.target.value.trim(); if (nv) { if (!canUseType(nv, e.id)) { flashHint(singletonLockedMessage(nv)); renderProps(); return; } pushUndo(); e.type = nv; renderAll(); autosave(); } };
  $('#pDescription').onchange = ev2 => { pushUndo(); e.description = ev2.target.value.trim(); autosave(); };
  const bindNum = (id, key) => { const el = $(id); if (!el) return; el.onchange = ev2 => { pushUndo(); e[key] = round4(parseFloat(ev2.target.value) || 0); renderAll(); autosave(); }; };
  bindNum('#pX', 'x'); bindNum('#pY', 'y'); bindNum('#pW', 'w'); bindNum('#pH', 'h');
  $('#pDel').onclick = deleteSel; $('#pDup').onclick = duplicateSel;
  installNumberSteppers(box);
}

// =====================================================================
//  數值微調控制
// =====================================================================
function installNumberSteppers(root = document) {
  root.querySelectorAll('input[type="number"]').forEach(input => {
    if (input.closest('.num-control')) return;

    const control = document.createElement('span');
    control.className = 'num-control';
    input.parentNode.insertBefore(control, input);
    control.appendChild(input);

    const stepper = document.createElement('span');
    stepper.className = 'num-stepper';
    stepper.innerHTML = `<button type="button" aria-label="增加數值" title="增加">${icon('up')}</button><button type="button" aria-label="減少數值" title="減少">${icon('down')}</button>`;
    const changeValue = direction => {
      try {
        direction > 0 ? input.stepUp() : input.stepDown();
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {
        // 不可微調的數字欄位維持原本可直接輸入的行為。
      }
    };
    stepper.children[0].addEventListener('click', () => changeValue(1));
    stepper.children[1].addEventListener('click', () => changeValue(-1));
    control.appendChild(stepper);
  });
}

function renderList() {
  const el = $('#list'); el.innerHTML = '';
  $('#count').textContent = `(${S.els.length})`;
  for (const e of S.els) {
    const d = document.createElement('div');
    d.className = 'li' + (e.id === S.selId ? ' on' : '');
    d.innerHTML = `<span class="sw" style="background:${typeColor(e.type)}"></span>
      <span class="id">${escapeHtml(e.id)}</span><span class="ty">${icon(e.kind === 'rect' ? 'rect' : 'point', 'list-icon')} ${escapeHtml(e.type)}</span>`;
    d.onclick = () => { selectIds([e.id]); focusOn(e); renderAll(); };
    el.appendChild(d);
  }
}

function focusOn(e) {
  const c = centerOf(e);
  const r = cw.getBoundingClientRect();
  S.view.x = r.width / 2 - c.x * scale();
  S.view.y = r.height / 2 - c.y * scale();
}

function updateStatus() {
  const e = selected();
  $('#stSel').textContent = e ? `${e.id}` : '—';
  $('#stZoom').textContent = Math.round(S.view.zoom * 100) + '%';
}

function flashHint(msg) {
  const s = $('#stSel'); const old = s.textContent; s.textContent = msg; s.style.color = '#f6ad55';
  setTimeout(() => { s.style.color = ''; updateStatus(); }, 1600);
}

// =====================================================================
//  工具切換
// =====================================================================
function setTool(t) {
  S.tool = t;
  cw.style.cursor = 'crosshair';
  renderToolbar();
}

function closeToolbarMenus() {
  document.querySelectorAll('.toolbar-menu').forEach(menu => menu.classList.remove('open'));
}

document.querySelectorAll('[data-category]').forEach(button => {
  button.onclick = ev => {
    ev.stopPropagation();
    const menu = $(`#menu-${button.dataset.category}`);
    const wasOpen = menu.classList.contains('open');
    closeToolbarMenus();
    menu.classList.toggle('open', !wasOpen);
  };
});
document.addEventListener('mousedown', ev => { if (!ev.target.closest('.bottom-toolbar')) closeToolbarMenus(); });

// =====================================================================
//  類型對話框
// =====================================================================
let editingType = null;
function openTypeDlg(t) {
  editingType = t; // null = 新增
  $('#tdName').value = t ? t.name : '';
  $('#tdColor').value = t ? t.color : '#4fd1c5';
  $('#tdShape').value = t ? t.shape : 'rect';
  $('#tdDescription').value = t ? (t.description || '') : '';
  $('#tdDelete').style.display = t ? '' : 'none';
  $('#typeDlg').showModal();
}
$('#btnAddType').onclick = () => openTypeDlg(null);
$('#tdCancel').onclick = () => $('#typeDlg').close();
$('#tdDelete').onclick = () => {
  if (!editingType) return;
  if (S.els.some(e => e.type === editingType.name)) { if (!confirm('有元素仍在用此類型，刪除後它們會保留原 type 字串但失去顏色。確定？')) return; }
  pushUndo();
  S.types = S.types.filter(x => x !== editingType);
  $('#typeDlg').close(); renderAll(); autosave();
};
$('#tdSave').onclick = () => {
  const name = $('#tdName').value.trim();
  if (!name) { alert('名稱不可空白'); return; }
  const color = $('#tdColor').value, shape = $('#tdShape').value, description = $('#tdDescription').value.trim();
  pushUndo();
  if (editingType) {
    if (name !== editingType.name && S.types.some(t => t.name === name)) { alert('類型名稱重複'); return; }
    editingType.name = name; editingType.color = color; editingType.shape = shape; editingType.description = description;
  } else {
    if (S.types.some(t => t.name === name)) { alert('類型名稱重複'); return; }
    S.types.push({ name, color, shape, description });
    S.activeType = name;
  }
  $('#typeDlg').close(); renderAll(); autosave();
};

// =====================================================================
//  匯入 / 匯出
// =====================================================================
function serialize() {
  const spawn = singletonElement('spawn');
  return {
    format: FORMAT,
    name: S.name,
    world: { wUnit: S.world.w, hUnit: S.world.h },
    snap: S.snap,
    // 保留 v1 頂層欄位；未放出生點時以 null 表示，避免捏造不存在的座標。
    spawnUnit: spawn ? { x: spawn.x, y: spawn.y } : null,
    types: S.types.map(t => {
      const o = { name: t.name, color: t.color, shape: t.shape };
      if (t.description) o.description = t.description;
      return o;
    }),
    // spawn 由頂層 spawnUnit 表示，維持既有消費端的 elements 外觀。
    elements: S.els.filter(e => e.type !== 'spawn').map(e => {
      const o = { id: e.id, kind: e.kind, type: e.type, xUnit: e.x, yUnit: e.y };
      if (e.kind === 'rect') { o.wUnit = e.w; o.hUnit = e.h; }
      if (e.description) o.description = e.description;
      if (e.props && Object.keys(e.props).length) o.props = { ...e.props };
      if (e.links && e.links.length) o.links = [...e.links];
      return o;
    }),
  };
}

function deserialize(d) {
  if (!d || typeof d !== 'object') throw new Error('不是有效的 JSON 物件');
  S.name = d.name || 'level';
  S.world = { w: d.world?.wUnit ?? 80, h: d.world?.hUnit ?? 20 };
  S.snap = d.snap ?? 0.5;
  if (Array.isArray(d.types) && d.types.length) S.types = d.types.map(t => ({ name: t.name, color: t.color || '#888', shape: t.shape || 'rect', description: t.description || '' }));
  S.els = (d.elements || []).map(e => ({
    id: e.id, kind: e.kind || (e.wUnit != null ? 'rect' : 'point'), type: e.type || 'unknown',
    x: e.xUnit ?? 0, y: e.yUnit ?? 0,
    ...(e.wUnit != null ? { w: e.wUnit, h: e.hUnit ?? 1 } : {}),
    description: e.description || '', props: e.props || {}, links: e.links || [],
  }));
  normalizeSingletonNodes();
  // 舊存檔只有 spawnUnit；還原為可選取、拖曳、刪除的一般點元素。
  if (d.spawnUnit && !singletonElement('spawn')) {
    S.els.unshift({ id: newId('spawn'), kind: 'point', type: 'spawn', x: d.spawnUnit.x ?? 3, y: d.spawnUnit.y ?? 15, description: '', props: {}, links: [] });
  }
  clearSelection();
  // 重算 uid 避免撞號
  uid = 1;
  for (const e of S.els) { const m = /(\d+)$/.exec(e.id); if (m) uid = Math.max(uid, +m[1] + 1); }
}

$('#btnExport').onclick = () => {
  const json = JSON.stringify(serialize(), null, 2);
  openIO('匯出 JSON', json, false);
};
$('#btnImport').onclick = () => openIO('匯入 JSON（貼上後按載入）', '', true);

function openIO(title, text, isImport) {
  $('#ioTitle').textContent = title;
  $('#ioText').value = text;
  $('#ioText').readOnly = false;
  $('#ioLoad').style.display = isImport ? '' : 'none';
  $('#ioCopy').style.display = isImport ? 'none' : '';
  $('#ioDownload').style.display = isImport ? 'none' : '';
  $('#ioDlg').showModal();
}
$('#ioClose').onclick = () => $('#ioDlg').close();
$('#ioCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#ioText').value); flashHint('已複製'); } catch { $('#ioText').select(); document.execCommand('copy'); } };
$('#ioDownload').onclick = () => {
  const blob = new Blob([$('#ioText').value], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = (S.name || 'level') + '.json'; a.click(); URL.revokeObjectURL(a.href);
};
$('#ioLoad').onclick = () => {
  try {
    const d = JSON.parse($('#ioText').value);
    pushUndo(); deserialize(d); syncInputs(); renderAll(); autosave();
    $('#ioDlg').close();
  } catch (err) { alert('解析失敗：' + err.message); }
};

// =====================================================================
//  頂部/世界輸入
// =====================================================================
function syncInputs() {
  $('#lvName').value = S.name;
  $('#worldW').value = S.world.w; $('#worldH').value = S.world.h;
  $('#snap').value = S.snap; $('#ppu').value = S.ppu;
  $('#stZoom').textContent = Math.round(S.view.zoom * 100) + '%';
}
$('#lvName').onchange = e => { S.name = e.target.value.trim() || 'level'; autosave(); };
$('#worldW').onchange = e => { pushUndo(); S.world.w = Math.max(1, parseFloat(e.target.value) || 1); draw(); autosave(); };
$('#worldH').onchange = e => { pushUndo(); S.world.h = Math.max(1, parseFloat(e.target.value) || 1); draw(); autosave(); };
$('#snap').onchange = e => { S.snap = Math.max(0, parseFloat(e.target.value) || 0); autosave(); };
$('#ppu').onchange = e => { S.ppu = Math.max(1, parseFloat(e.target.value) || 20); draw(); };
installNumberSteppers();

$('#btnNew').onclick = () => {
  if (!confirm('清空目前關卡，開新的？（會存進復原）')) return;
  pushUndo();
  S.name = 'level-01'; S.world = { w: 80, h: 20 }; S.snap = 0.5;
  S.els = [{ id: 'spawn-0', kind: 'point', type: 'spawn', x: 3, y: 15, description: '', props: {}, links: [] }]; clearSelection(); uid = 1;
  syncInputs(); renderAll(); autosave();
};

// =====================================================================
//  自動存檔（localStorage）
// =====================================================================
let saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(serialize())); } catch {}
  }, 300);
}
function loadAutosave() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { deserialize(JSON.parse(raw)); return true; }
  } catch {}
  return false;
}

// =====================================================================
//  工具函式
// =====================================================================
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// =====================================================================
//  啟動
// =====================================================================
function boot() {
  loadAutosave();
  setTool(typeShape(S.activeType) === 'rect' ? 'rect' : 'marker');
  syncInputs();
  renderAll();
  // 置中世界
  const r = cw.getBoundingClientRect();
  S.view.x = (r.width - S.world.w * scale()) / 2;
  S.view.y = 30;
  resizeCanvas();
}
window.addEventListener('resize', resizeCanvas);
boot();
