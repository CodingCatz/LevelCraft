/* 畫布繪製：網格、世界邊界、元素、連動、選取框、路徑與框選，以及縮放下限與視角置中。 */

import { ZOOM_MAX, FIT_PAD_PX, fitZoomFor, minZoomFor, centerOf, corners, hexA } from './geometry.js';
import { cv, ctx, cw } from './dom.js';
import { S, scale, toScreen, toUnit, typeColor, selected, selectionIds, isInHighlightedGroup, pathNodeWorld, RT } from './state.js';

// 滾輪與 fitViewToWorld 共用同一個下限；每次即時算，世界 W/H 或 px/單位改了自然跟著變。
function zoomFloor() {
  const r = cw.getBoundingClientRect();
  return minZoomFor(S.world.w, S.world.h, S.ppu, r.width, r.height, FIT_PAD_PX);
}

/** 把縮放限制在依世界大小計算的下限與上限 8 之間。 */
export function clampZoom(z) { return Math.min(ZOOM_MAX, Math.max(zoomFloor(), z)); }

let resizeFrame = 0;

/** 依容器尺寸與裝置像素比重設畫布解析度並重畫。 */
export function resizeCanvas() {
  const r = cw.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

/** 把畫布重設排到下一個動畫影格，同一影格內多次觸發只做一次。 */
export function scheduleCanvasResize() {
  if (resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    resizeCanvas();
  });
}

/** 重畫整張畫布：網格、世界邊界、路徑、元素、連動、選取與框選框。 */
export function draw() {
  const r = cw.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  drawGrid(r);
  drawWorldBounds();
  drawPaths();
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
  ctx.strokeStyle = isInHighlightedGroup(e.id) ? '#4fd1c5' : col; ctx.lineWidth = 1.5;
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
  ctx.strokeStyle = isInHighlightedGroup(e.id) ? '#4fd1c5' : '#0d0f14'; ctx.lineWidth = 1.5; ctx.stroke();
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

function drawPaths() {
  for (const e of S.els) {
    if (!e.path?.length) continue;
    const col = typeColor(e.type), points = [centerOf(e), ...e.path.map(p => pathNodeWorld(e, p))];
    ctx.save(); ctx.strokeStyle = hexA(col, e.id === S.selId ? 0.95 : 0.42); ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 5]); ctx.lineDashOffset = e.id === S.selId ? -pathDashOffset : 0;
    ctx.beginPath(); points.forEach((p, i) => { const s = toScreen(p.x, p.y); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }); ctx.stroke();
    for (const p of points.slice(1)) { const s = toScreen(p.x, p.y); ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fillStyle = hexA(col, .45); ctx.fill(); ctx.strokeStyle = col; ctx.setLineDash([]); ctx.stroke(); ctx.setLineDash([7, 5]); }
    ctx.restore();
  }
}

function drawMarquee() {
  if (!RT.drag || RT.drag.mode !== 'marquee') return;
  const a = toScreen(RT.drag.start.x, RT.drag.start.y), b = toScreen(RT.drag.end.x, RT.drag.end.y);
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.restore();
}

/** 把視角移到讓指定元素位於畫面中央。 */
export function focusOn(e) {
  const c = centerOf(e);
  const r = cw.getBoundingClientRect();
  S.view.x = r.width / 2 - c.x * scale();
  S.view.y = r.height / 2 - c.y * scale();
}

// 把整個世界框進畫面並置中。匯入時必呼叫：否則新關卡是套用在舊視角上，
// 只要使用者先平移／縮放過，關卡就落在畫面外，看起來像「按了沒反應」。
export function fitViewToWorld() {
  const r = cw.getBoundingClientRect();
  S.view.zoom = clampZoom(fitZoomFor(S.world.w, S.world.h, S.ppu, r.width, r.height, FIT_PAD_PX));
  const s = scale();
  S.view.x = (r.width - S.world.w * s) / 2;
  S.view.y = (r.height - S.world.h * s) / 2;
}
