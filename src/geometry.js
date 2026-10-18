/* 不碰狀態也不碰 DOM 的幾何與縮放計算（中心點、角點、顏色透明度、縮放下限），Node 自檢可直接 import。 */

export const ZOOM_MAX = 8, FIT_PAD_PX = 40;

/** 剛好把整個世界（四邊各留 pad px）裝進畫面的 zoom。純函式，check-import.cjs 直接抽出來驗。 */
export function fitZoomFor(worldW, worldH, ppu, viewW, viewH, pad) {
  return Math.min((viewW - pad * 2) / (worldW * ppu), (viewH - pad * 2) / (worldH * ppu));
}

/** 縮放下限：小世界維持 0.15；大世界放寬到裝滿畫面的 zoom × 0.9，讓整個世界看得到。純函式。 */
export function minZoomFor(worldW, worldH, ppu, viewW, viewH, pad) {
  const fit = fitZoomFor(worldW, worldH, ppu, viewW, viewH, pad);
  return Number.isFinite(fit) && fit > 0 ? Math.min(0.15, fit * 0.9) : 0.15;
}

/** 四捨五入到小數 4 位，避免浮點誤差累積進座標與匯出 JSON。 */
export function round4(v) { return Math.round(v * 10000) / 10000; }

/** 元素中心（單位）：矩形取中點、點取本身；連動線、路徑節點與聚焦都以它為基準。 */
export function centerOf(e) {
  return e.kind === 'rect' ? { x: e.x + e.w / 2, y: e.y + e.h / 2 } : { x: e.x, y: e.y };
}

/** 矩形四個角的單位座標，順序為左上、右上、左下、右下（縮放把手的索引依此）。 */
export function corners(e) { return [[e.x, e.y], [e.x + e.w, e.y], [e.x, e.y + e.h], [e.x + e.w, e.y + e.h]]; }

/** 把 #RGB／#RRGGBB 顏色加上透明度轉成 rgba() 字串，給畫布填色用。 */
export function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
