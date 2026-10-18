/* 編輯器狀態 S、undo 堆疊、選取與群組、類型查詢與命中測試；不碰 DOM，格式模組與 Node 自檢都靠它。 */

import { round4, centerOf, corners } from './geometry.js';

/** 跨模組共用、會被重新指派的執行期狀態（ES 模組的 import 綁定不能被別的檔案改寫，所以收進同一個物件）。 */
export const RT = {
  uid: 1,
  drag: null,
  pathEditingId: null,
  spaceDown: false,
  pathDashOffset: 0,
};

const DEFAULT_TYPES = [
  { name: 'ground',  color: '#5568d3', shape: 'rect',  category: 'solid',  description: '' },
  { name: 'oneway',  color: '#7c8cff', shape: 'rect',  category: 'solid',  description: '' },
  { name: 'wall',    color: '#3f4a8a', shape: 'rect',  category: 'solid',  description: '' },
  { name: 'spike',   color: '#fc8181', shape: 'rect',  category: 'hazard', description: '' },
  { name: 'ladder',  color: '#68d391', shape: 'rect',  category: 'solid',  description: '' },
  { name: 'spawn',   color: '#f6e05e', shape: 'point', category: 'object', description: '' },
  { name: 'goal',    color: '#4fd1c5', shape: 'point', category: 'object', description: '' },
  { name: 'key',     color: '#f6ad55', shape: 'point', category: 'object', description: '' },
  { name: 'door',    color: '#b794f4', shape: 'point', category: 'object', description: '' },
  { name: 'switch',  color: '#f687b3', shape: 'point', category: 'object', description: '' },
  { name: 'checkpoint', color: '#63b3ed', shape: 'point', category: 'object', description: '' },
];

export const S = {
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
  groups: [], // 僅編輯器編排資料；不寫入遊戲端 levelcraft/v1 匯出。
  view: { x: -40, y: -40, zoom: 1 }, // zoom 疊加在 ppu 上；view.x/y 為畫布像素偏移
};

/** 以前綴產生目前關卡中不重複的元素 id。 */
export function newId(prefix) {
  let id;
  do { id = `${prefix}-${RT.uid++}`; } while (S.els.some(e => e.id === id));
  return id;
}

export const undoStack = [], redoStack = [];

/** 把會被 undo 還原的狀態序列化成字串。 */
export function snapshot() {
  return JSON.stringify({ name: S.name, world: S.world, snap: S.snap, els: S.els, types: S.types, groups: S.groups });
}

/** 在狀態變更前記一筆 undo（上限 100 筆），並清空 redo。 */
export function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }

/** 從 undo／redo 字串還原狀態並清掉選取。 */
export function restore(str) {
  const d = JSON.parse(str);
  S.name = d.name; S.world = d.world; S.snap = d.snap; S.els = d.els; S.types = d.types; S.groups = d.groups || [];
  normalizeGroups();
  clearSelection();
}

/** 目前每單位對應的螢幕像素（px/單位 × 縮放）。 */
export const scale = () => S.ppu * S.view.zoom;

/** 單位座標 → 畫布像素座標。 */
export function toScreen(ux, uy) { return { x: ux * scale() + S.view.x, y: uy * scale() + S.view.y }; }

/** 畫布像素座標 → 單位座標。 */
export function toUnit(sx, sy) { return { x: (sx - S.view.x) / scale(), y: (sy - S.view.y) / scale() }; }

/** 依目前格線吸附值把單位數值對齊到格線；吸附為 0 時原值返回。 */
export function snapU(v) { return S.snap > 0 ? Math.round(v / S.snap) * S.snap : v; }

/** 依名稱取類型定義，找不到回 undefined。 */
export function typeDef(name) { return S.types.find(t => t.name === name); }

/** 依類型名稱取顏色，找不到類型時用灰色。 */
export function typeColor(name) { const t = typeDef(name); return t ? t.color : '#888'; }

/** 依類型名稱取形狀（rect／point），找不到類型時當成 rect。 */
export function typeShape(name) { const t = typeDef(name); return t ? t.shape : 'rect'; }

/** 取場上第一個屬於該類型的元素（出生點／目的地這類單例用）。 */
export function singletonElement(type) { return S.els.find(e => e.type === type); }

/** 是否為全關卡只能有一個的類型（出生點、目的地）。 */
export function isSingletonType(type) { return type === 'spawn' || type === 'goal'; }

/** 這個類型現在能不能再放：單例類型已在場上（排除 exceptId 本身）時不行。 */
export function canUseType(type, exceptId = null) {
  return !isSingletonType(type) || !S.els.some(e => e.type === type && e.id !== exceptId);
}

/** 單例類型已在場上時給使用者的提示文字。 */
export function singletonLockedMessage(type) {
  return `畫面上已有${type === 'spawn' ? '出生點' : '目的地'}，請先刪除現有的才能新增`;
}

/** 出生點與目的地各只保留第一個，匯入的檔案若有重複就丟掉多的。 */
export function normalizeSingletonNodes() {
  for (const type of ['spawn', 'goal']) {
    let found = false;
    S.els = S.els.filter(e => e.type !== type || !found && (found = true));
  }
}

/** 目前主要選取的元素，沒有時回 null。 */
export function selected() { return S.els.find(e => e.id === S.selId) || null; }

/** 目前選取的所有元素 id（多選時為整組，否則只有主要選取）。 */
export function selectionIds() {
  return S.multiSelIds.includes(S.selId) ? S.multiSelIds : (S.selId ? [S.selId] : []);
}

/** 設定選取集合，第一個當主要選取。 */
export function selectIds(ids) {
  S.multiSelIds = ids;
  S.selId = ids[0] || null;
}

/** 清空選取。 */
export function clearSelection() { selectIds([]); }

/** 元素所屬的群組，沒有時回 null。 */
export function groupForElement(id) { return S.groups.find(group => group.memberIds.includes(id)) || null; }

/** 選取集合剛好等於某個完整群組時回該群組，否則 null（用來判斷能不能解散）。 */
export function groupForSelection(ids = selectionIds()) {
  const group = ids.length ? groupForElement(ids[0]) : null;
  return group && ids.length === group.memberIds.length && ids.every(id => group.memberIds.includes(id)) ? group : null;
}

/** 元素是否屬於目前選取所在的群組（畫面上用青色邊框高亮）。 */
export function isInHighlightedGroup(id) {
  return selectionIds().some(selectedId => groupForElement(selectedId)?.memberIds.includes(id));
}

/** 把 id 清單擴充成包含各自群組的全部成員。 */
export function expandGroupIds(ids) {
  const expanded = new Set(ids);
  for (const id of ids) for (const memberId of groupForElement(id)?.memberIds || []) expanded.add(memberId);
  return [...expanded];
}

/** 清掉群組裡已不存在或重複分組的成員，成員少於 2 的群組直接移除。 */
export function normalizeGroups() {
  const existingIds = new Set(S.els.map(e => e.id));
  const assigned = new Set();
  S.groups = (S.groups || []).map(group => ({ id: group.id, memberIds: (group.memberIds || []).filter(id => existingIds.has(id) && !assigned.has(id)) }))
    .filter(group => group.id && group.memberIds.length >= 2 && (group.memberIds.forEach(id => assigned.add(id)), true));
}

/** 產生目前不重複的群組 id。 */
export function newGroupId() {
  let index = 1, id;
  do { id = `group-${index++}`; } while (S.groups.some(group => group.id === id));
  return id;
}

/** 框選範圍內「完整落在框內」的元素 id。 */
export function marqueeSelection(a, b) {
  const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
  return S.els.filter(e => {
    if (e.kind === 'point') return e.x >= left && e.x <= right && e.y >= top && e.y <= bottom;
    return e.x >= left && e.x + e.w <= right && e.y >= top && e.y + e.h <= bottom;
  }).map(e => e.id);
}

/** 游標下最上層的元素：點優先於矩形、後放的優先，沒有時回 null。 */
export function hitTest(ux, uy) {
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

/** 游標是否落在矩形的縮放把手上，回角點索引，沒有時回 -1。 */
export function hitHandle(e, ux, uy) {
  if (!e || e.kind !== 'rect') return -1;
  const tol = 11 / scale();
  const cs = corners(e);
  for (let i = 0; i < cs.length; i++) if (Math.hypot(ux - cs[i][0], uy - cs[i][1]) <= tol) return i;
  return -1;
}

/** 目前正在編輯路徑的元素。 */
export function pathTarget() { return S.els.find(e => e.id === RT.pathEditingId); }

// path[i] 是元素相對擺放位置的位移（單位）；畫面上的節點＝元素中心＋位移，所以元素移動、複製時路徑跟著走。
export function pathNodeWorld(e, p) { const c = centerOf(e); return { x: c.x + p.x, y: c.y + p.y }; }

/** 把游標位置（吸附後）換成相對元素中心的路徑位移。 */
export function pathOffsetAt(e, u) { const c = centerOf(e); return { x: round4(snapU(u.x) - c.x), y: round4(snapU(u.y) - c.y) }; }

/** 游標是否落在元素的某個路徑節點上，回節點索引，沒有時回 -1。 */
export function hitPathNode(e, ux, uy) { if (!e?.path) return -1; const tol = 10 / scale(); return e.path.findIndex(p => { const w = pathNodeWorld(e, p); return Math.hypot(w.x - ux, w.y - uy) <= tol; }); }
