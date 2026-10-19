/* levelcraft/v1 格式層：版號、類型 category 正規化、匯入守門、序列化與反序列化；不碰 DOM，Node 可直接 import。 */

import { centerOf } from './geometry.js';
import { S, newId, singletonElement, normalizeSingletonNodes, clearSelection, normalizeGroups, RT } from './state.js';

// category（solid/hazard/object/decor）是遊戲語意，與 shape（rect/point）獨立，隨 JSON 匯出。
/** 舊檔／未知值 → object（向後相容，不讓匯入失敗）。合法集合內嵌，方便 check-import 抽出。 */
export function normalizeGameCategory(cat) {
  const v = String(cat || '').toLowerCase();
  return v === 'solid' || v === 'hazard' || v === 'object' || v === 'decor' ? v : 'object';
}

export const VERSION = '0.20.0';

const FORMAT = 'levelcraft/v1';

// 手寫或外部工具產的 JSON 常缺 id／撞 id／連到不存在的目標；id 是選取、群組、links 的唯一鍵，
// 壞掉會讓「點 A 選到 B」或匯出懸空 targetId。純函式（不碰 S），供 check-import.cjs 直接驗。
export function normalizeElementRefs(els) {
  const seen = new Set();
  let n = 1;
  for (const e of els) {
    let id = typeof e.id === 'string' && e.id.trim() ? e.id.trim() : '';
    if (!id || seen.has(id)) {
      const prefix = String(e.type || 'el');
      do { id = `${prefix}-${n++}`; } while (seen.has(id) || els.some(x => x !== e && x.id === id));
    }
    e.id = id; seen.add(id);
  }
  for (const e of els) {
    e.links = [...new Set((e.links || []).filter(id => id !== e.id && seen.has(id)))];
  }
  return els;
}

/** 舊格式的絕對路徑點（元素中心要到的位置）→ 相對中心的位移。純函式，check-import.cjs 直接抽出來驗。 */
export function absolutePathToOffsets(path, center) {
  return path.map(p => ({ x: Math.round((p.x - center.x) * 10000) / 10000, y: Math.round((p.y - center.y) * 10000) / 10000 }));
}

/** 把目前狀態輸出成 levelcraft/v1 物件；includeEditorState 為 true 時另帶群組（只給 autosave，不給遊戲端）。 */
export function serialize(includeEditorState = false) {
  const spawn = singletonElement('spawn');
  const exportedIds = new Set(S.els.filter(e => e.type !== 'spawn').map(e => e.id));
  const level = {
    format: FORMAT,
    name: S.name,
    world: { wUnit: S.world.w, hUnit: S.world.h },
    snap: S.snap,
    // 保留 v1 頂層欄位；未放出生點時以 null 表示，避免捏造不存在的座標。
    spawnUnit: spawn ? { x: spawn.x, y: spawn.y } : null,
    // path 是元素相對擺放位置的位移；沒有這個欄位的舊檔 path 是世界絕對座標。
    pathSpace: 'relative',
    types: S.types.map(t => {
      const o = {
        name: t.name,
        color: t.color,
        shape: t.shape,
        category: normalizeGameCategory(t.category),
      };
      if (t.movable) o.movable = true;
      if (t.description) o.description = t.description;
      return o;
    }),
    // spawn 由頂層 spawnUnit 表示，維持既有消費端的 elements 外觀。
    elements: S.els.filter(e => e.type !== 'spawn').map(e => {
      const o = { id: e.id, kind: e.kind, type: e.type, xUnit: e.x, yUnit: e.y };
      if (e.kind === 'rect') { o.wUnit = e.w; o.hUnit = e.h; }
      if (e.description) o.description = e.description;
      if (e.props && Object.keys(e.props).length) o.props = { ...e.props };
      const links = (e.links || []).filter(id => exportedIds.has(id));
      if (links.length) o.links = links;
      if (e.path?.length) o.path = e.path.map(p => ({ x: p.x, y: p.y }));
      return o;
    }),
  };
  if (includeEditorState && S.groups.length) level.editor = { groups: S.groups.map(group => ({ id: group.id, memberIds: [...group.memberIds] })) };
  return level;
}

// 中間檔與轉換後關卡同名、只差 celeste__ 前綴且相鄰兩層資料夾，選錯檔是常態而非意外。
// room 判準對齊 intermediate_to_levelcraft.cjs 的 isRoomPayload（該處為權威定義；瀏覽器端無法
// require node 腳本故重述）。只用於指路，判錯的代價是錯誤訊息較籠統，不影響載入正確性。
// 回傳中間檔型態，非中間檔回 null。
export function intermediateKind(d) {
  if (Array.isArray(d.solids)) return 'room';
  if (Array.isArray(d.entities) && (d.sourceMap || d.sourceRoom)) return 'room';
  // _index.json 清單檔：排序在資料夾第一個，最容易被誤選。
  if (Array.isArray(d.rooms) && d.rooms.length && d.rooms.every(r => r?.file)) return 'index';
  return null;
}

// 守門檢查全在任何狀態變更之前跑完，呼叫端才能在 pushUndo 之前先擋掉壞輸入。
export function validateLevel(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('不是有效的 JSON 物件');
  if (d.format && d.format !== FORMAT) throw new Error(`不支援的格式 ${d.format}（預期 ${FORMAT}）`);
  const kind = intermediateKind(d);
  if (kind) {
    const room = [d.sourceMap, d.sourceRoom].filter(Boolean).join('/');
    const what = kind === 'index' ? '房間清單檔（_index.json）' : `中間檔${room ? `（${room}）` : ''}`;
    throw new Error(
      `這是抽取管線的${what}，不是 ${FORMAT} 關卡。\n` +
      `請改開 examples/celeste-import/data/levelcraft/ 底下轉換後的 celeste__*.json，\n` +
      `或先轉檔：node examples/celeste-import/intermediate_to_levelcraft.cjs --in <檔> --out <目錄>`
    );
  }
  if (!d.world && !Array.isArray(d.elements)) throw new Error(`不像 ${FORMAT} 關卡：缺少 world 與 elements`);
}

/** 把 levelcraft/v1 物件載入成目前狀態：正規化 id／links／群組／單例節點，舊檔路徑換成相對位移。 */
export function deserialize(d) {
  validateLevel(d);
  S.name = d.name || 'level';
  // 世界尺寸一律收斂成正有限數；壞值會讓縮放算出 NaN 而畫面全白。
  const posNum = (v, fallback) => (Number.isFinite(+v) && +v > 0 ? +v : fallback);
  S.world = { w: posNum(d.world?.wUnit, 80), h: posNum(d.world?.hUnit, 20) };
  S.snap = Number.isFinite(+d.snap) && +d.snap >= 0 ? +d.snap : 0.5;
  if (Array.isArray(d.types) && d.types.length) {
    S.types = d.types.map(t => ({
      name: t.name,
      color: t.color || '#888',
      shape: t.shape || 'rect',
      // 舊檔無 category → object（向後相容）；不依 type 名猜，避免靜默改語意
      category: normalizeGameCategory(t.category),
      movable: Boolean(t.movable),
      description: t.description || '',
    }));
  }
  S.els = (d.elements || []).map(e => ({
    id: e.id, kind: e.kind || (e.wUnit != null ? 'rect' : 'point'), type: e.type || 'unknown',
    x: e.xUnit ?? 0, y: e.yUnit ?? 0,
    ...(e.wUnit != null ? { w: e.wUnit, h: e.hUnit ?? 1 } : {}),
    description: e.description || '', props: e.props || {}, links: e.links || [], path: Array.isArray(e.path) ? e.path.map(p => ({ x: p.x ?? 0, y: p.y ?? 0 })) : [],
  }));
  // 舊檔（含舊 autosave）的 path 是元素中心要到的世界座標，換成相對位移，畫面位置不變。
  if (d.pathSpace !== 'relative') for (const e of S.els) if (e.path.length) e.path = absolutePathToOffsets(e.path, centerOf(e));
  normalizeElementRefs(S.els);
  S.groups = d.editor?.groups || [];
  normalizeGroups();
  normalizeSingletonNodes();
  // 舊存檔只有 spawnUnit；還原為可選取、拖曳、刪除的一般點元素。
  if (d.spawnUnit && !singletonElement('spawn')) {
    S.els.unshift({ id: newId('spawn'), kind: 'point', type: 'spawn', x: d.spawnUnit.x ?? 3, y: d.spawnUnit.y ?? 15, description: '', props: {}, links: [] });
  }
  clearSelection();
  // 重算 RT.uid 避免撞號
  RT.uid = 1;
  for (const e of S.els) { const m = /(\d+)$/.exec(e.id); if (m) RT.uid = Math.max(RT.uid, +m[1] + 1); }
}
