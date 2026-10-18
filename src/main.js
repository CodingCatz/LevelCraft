/* 編輯器進入點：載入 autosave、初始畫面與視角、掛視窗縮放監聽，並提供 check-ui.cjs 用的測試掛鉤。 */

import { $, cw } from './dom.js';
import { S, scale, typeShape, pathTarget, RT } from './state.js';
import { VERSION } from './format.js';
import { resizeCanvas, scheduleCanvasResize, draw } from './view.js';
import { renderAll, setTool, syncInputs, loadAutosave } from './ui.js';
import * as geometry from './geometry.js';
import * as dom from './dom.js';
import * as state from './state.js';
import * as format from './format.js';
import * as view from './view.js';
import * as ui from './ui.js';
import * as interaction from './interaction.js';

function boot() {
  const verTag = $('#verTag');
  if (verTag) verTag.textContent = 'v' + VERSION;
  loadAutosave();
  setTool(typeShape(S.activeType) === 'rect' ? 'rect' : 'marker');
  syncInputs();
  renderAll();
  // 置中世界
  const r = cw.getBoundingClientRect();
  S.view.x = (r.width - S.world.w * scale()) / 2;
  S.view.y = 30;
  resizeCanvas();
  const animatePaths = time => { RT.pathDashOffset = time / 45; if (pathTarget()?.path?.length) draw(); requestAnimationFrame(animatePaths); };
  requestAnimationFrame(animatePaths);
}

window.addEventListener('resize', scheduleCanvasResize);

new ResizeObserver(scheduleCanvasResize).observe(cw);

// 測試掛鉤：模組的頂層宣告不在 window 上，check-ui.cjs 從這個物件取狀態與函式（不是公開 API）。
window.__levelcraft = { ...geometry, ...dom, ...state, ...format, ...view, ...ui, ...interaction };

boot();
