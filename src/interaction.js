/* 滑鼠與鍵盤互動：放置、拖曳、縮放把手、框選、平移、路徑編輯、刪除／複製／群組與 undo／redo。 */

import { round4 } from './geometry.js';
import { $, cw } from './dom.js';
import { S, newId, undoStack, redoStack, snapshot, pushUndo, restore, scale, toUnit, snapU, typeShape, isSingletonType, canUseType, singletonLockedMessage, selected, selectionIds, selectIds, clearSelection, groupForElement, groupForSelection, expandGroupIds, normalizeGroups, newGroupId, marqueeSelection, hitTest, hitHandle, pathTarget, pathOffsetAt, hitPathNode, RT } from './state.js';
import { clampZoom, draw } from './view.js';
import { setToolbarTransientStatus, updateToolbarStatus, showMultiDeleteDialog, renderAll, renderToolbar, renderProps, renderList, updateStatus, flashHint, setTool, renderToolbox, syncInputs, autosave } from './ui.js';

function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); syncInputs(); renderAll(); }

function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); syncInputs(); renderAll(); }

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

cw.addEventListener('mousedown', ev => {
  if (ev.target.closest('.bottom-toolbar')) return;
  if (ev.button === 1 || (ev.button === 0 && RT.spaceDown)) { // 平移
    RT.drag = { mode: 'pan', sx: ev.clientX, sy: ev.clientY, vx: S.view.x, vy: S.view.y };
    updateToolbarStatus();
    return;
  }
  if (ev.button !== 0) return;
  const rect = cw.getBoundingClientRect();
  const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
  const u = toUnit(sx, sy);
  if (S.tool === 'path') {
    const target = pathTarget();
    if (!target) { S.tool = typeShape(S.activeType) === 'rect' ? 'rect' : 'marker'; RT.pathEditingId = null; renderAll(); return; }
    const index = hitPathNode(target, u.x, u.y);
    pushUndo();
    if (index >= 0) RT.drag = { mode: 'movePath', e: target, index };
    else { target.path = target.path || []; target.path.push(pathOffsetAt(target, u)); RT.drag = { mode: 'movePath', e: target, index: target.path.length - 1 }; }
    renderToolbox(); draw(); return;
  }
  const sel = selected();
  const h = hitHandle(sel, u.x, u.y);

  // 縮放把手永遠優先於目前工具，避免剛畫完矩形時誤建立另一個元素。
  if (h >= 0) {
    pushUndo();
    RT.drag = { mode: 'resize', e: sel, handle: h };
    return;
  }

  const hit = hitTest(u.x, u.y);
  if (hit) {
    const ids = selectionIds();
    pushUndo();
    const hitGroup = groupForElement(hit.id);
    const moveIds = hitGroup?.memberIds || ids;
    if (hitGroup) selectIds(moveIds);
    if (moveIds.length > 1 && moveIds.includes(hit.id)) {
      const starts = Object.fromEntries(moveIds.map(id => {
        const element = S.els.find(item => item.id === id);
        return [id, { x: element.x, y: element.y }];
      }));
      RT.drag = { mode: 'moveGroup', ids: moveIds, starts, grabU: u };
    } else {
      selectIds([hit.id]);
      RT.drag = { mode: 'move', e: hit, grabU: u, ox: hit.x, oy: hit.y };
    }
  } else {
    clearSelection();
    RT.drag = { mode: 'pending', start: u, end: u, sx: ev.clientX, sy: ev.clientY };
  }
  renderAll();
});

cw.addEventListener('contextmenu', ev => {
  if (ev.target.closest('.bottom-toolbar')) return;
  ev.preventDefault();
  const rect = cw.getBoundingClientRect();
  const u = toUnit(ev.clientX - rect.left, ev.clientY - rect.top);
  if (S.tool === 'path') { const target = pathTarget(); const index = hitPathNode(target, u.x, u.y); if (index >= 0) { pushUndo(); target.path.splice(index, 1); if (!target.path.length) delete target.path; autosave(); renderToolbox(); draw(); } return; }
  const hit = hitTest(u.x, u.y);
  if (!hit) return;
  const ids = expandGroupIds(selectionIds());
  const hitGroup = groupForElement(hit.id);
  if (hitGroup || (ids.length > 1 && ids.includes(hit.id))) {
    showMultiDeleteDialog(hitGroup?.memberIds || ids);
    return;
  }
  selectIds(groupForElement(hit.id)?.memberIds || [hit.id]);
  deleteSel();
});

window.addEventListener('mousemove', ev => {
  const rect = cw.getBoundingClientRect();
  const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
  const u = toUnit(sx, sy);
  $('#stCur').textContent = `${round4(snapU(u.x))}, ${round4(snapU(u.y))}`;

  if (!RT.drag) {
    const sel = selected();
    const overHandle = hitHandle(sel, u.x, u.y) >= 0;
    const overElement = hitTest(u.x, u.y) !== null;
    cw.style.cursor = overHandle ? 'nwse-resize' : (overElement ? 'move' : 'crosshair');
  }

  if (!RT.drag) return;
  if (RT.drag.mode === 'pan') {
    cw.style.cursor = 'grabbing';
    S.view.x = RT.drag.vx + (ev.clientX - RT.drag.sx);
    S.view.y = RT.drag.vy + (ev.clientY - RT.drag.sy);
    draw(); return;
  }
  if (RT.drag.mode === 'pending') {
    if (Math.hypot(ev.clientX - RT.drag.sx, ev.clientY - RT.drag.sy) <= MARQUEE_THRESHOLD_PX) return;
    RT.drag.mode = 'marquee';
    updateToolbarStatus();
  }
  if (RT.drag.mode === 'move') {
    cw.style.cursor = 'move';
    const e = RT.drag.e;
    const dx = u.x - RT.drag.grabU.x, dy = u.y - RT.drag.grabU.y;
    e.x = round4(snapU(RT.drag.ox + dx)); e.y = round4(snapU(RT.drag.oy + dy));
    renderProps(); draw(); return;
  }
  if (RT.drag.mode === 'resize') {
    cw.style.cursor = 'nwse-resize';
    const e = RT.drag.e;
    const nx = snapU(u.x), ny = snapU(u.y);
    const x2 = (RT.drag.handle === 1 || RT.drag.handle === 3) ? nx : e.x + e.w;
    const y2 = (RT.drag.handle === 2 || RT.drag.handle === 3) ? ny : e.y + e.h;
    const x1 = (RT.drag.handle === 0 || RT.drag.handle === 2) ? nx : e.x;
    const y1 = (RT.drag.handle === 0 || RT.drag.handle === 1) ? ny : e.y;
    e.x = round4(Math.min(x1, x2)); e.y = round4(Math.min(y1, y2));
    e.w = round4(Math.max(S.snap || 0.1, Math.abs(x2 - x1)));
    e.h = round4(Math.max(S.snap || 0.1, Math.abs(y2 - y1)));
    renderProps(); draw(); return;
  }
  if (RT.drag.mode === 'movePath') { RT.drag.e.path[RT.drag.index] = pathOffsetAt(RT.drag.e, u); draw(); return; }
  if (RT.drag.mode === 'moveGroup') {
    cw.style.cursor = 'move';
    const dx = u.x - RT.drag.grabU.x, dy = u.y - RT.drag.grabU.y;
    for (const id of RT.drag.ids) {
      const e = S.els.find(item => item.id === id);
      const start = RT.drag.starts[id];
      if (!e || !start) continue;
      e.x = round4(snapU(start.x + dx)); e.y = round4(snapU(start.y + dy));
    }
    renderProps(); draw(); return;
  }
  if (RT.drag.mode === 'marquee') {
    RT.drag.end = u;
    selectIds(marqueeSelection(RT.drag.start, RT.drag.end));
    renderProps(); renderList(); renderToolbox(); updateStatus(); draw(); return;
  }
});

window.addEventListener('mouseup', () => {
  if (RT.drag?.mode === 'pending') placeActiveType(RT.drag.start);
  if (RT.drag && (RT.drag.mode === 'move' || RT.drag.mode === 'moveGroup' || RT.drag.mode === 'resize' || RT.drag.mode === 'movePath')) autosave();
  RT.drag = null;
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
  S.view.zoom = clampZoom(S.view.zoom * factor);
  const after = toUnit(sx, sy);
  S.view.x += (after.x - before.x) * scale();
  S.view.y += (after.y - before.y) * scale();
  $('#stZoom').textContent = Math.round(S.view.zoom * 100) + '%';
  setToolbarTransientStatus('zoom', 450);
  draw();
}, { passive: false });

window.addEventListener('keydown', ev => {
  if (ev.code === 'Space') { RT.spaceDown = true; }
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
  const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
  if (delta) {
    // 與拖曳一致：多選與群組成員整組微調，不只動主選取。
    const ids = new Set(expandGroupIds(selectionIds()));
    pushUndo();
    for (const x of S.els) if (ids.has(x.id)) { x.x = round4(x.x + delta[0]); x.y = round4(x.y + delta[1]); }
    renderAll(); autosave(); ev.preventDefault();
  }
});

window.addEventListener('keyup', ev => { if (ev.code === 'Space') RT.spaceDown = false; });

/** 刪除指定元素（群組成員一併刪）並清掉指向它們的 links，留一筆 undo。 */
export function deleteIds(ids) {
  const idSet = new Set(expandGroupIds(ids));
  if (!idSet.size) return;
  pushUndo();
  S.els = S.els.filter(x => !idSet.has(x.id));
  for (const x of S.els) if (x.links) x.links = x.links.filter(id => !idSet.has(id));
  normalizeGroups();
  clearSelection(); renderAll(); autosave();
}

/** 刪除目前選取的元素（含所在群組）。 */
export function deleteSel() { deleteIds(selectionIds()); }

/** 複製目前選取的元素（含群組），偏移一格；整組被選時複製品另成新群組。出生點與目的地不可複製。 */
export function duplicateSel() {
  const ids = expandGroupIds(selectionIds());
  const originals = ids.map(id => S.els.find(e => e.id === id)).filter(Boolean); if (!originals.length) return;
  if (originals.some(e => isSingletonType(e.type))) { flashHint('出生點與目的地不可複製'); return; }
  pushUndo();
  const copiedIds = originals.map(e => {
    const c = JSON.parse(JSON.stringify(e));
    c.id = newId(e.type); c.x = round4(e.x + (S.snap || 1)); c.y = round4(e.y + (S.snap || 1)); c.links = [];
    S.els.push(c); return c.id;
  });
  if (groupForSelection(ids)) S.groups.push({ id: newGroupId(), memberIds: copiedIds });
  selectIds(copiedIds); renderAll(); autosave();
}

/** 把目前選取的兩個以上、尚未分組的元素建成新群組。 */
export function createGroup() {
  const ids = selectionIds();
  if (ids.length < 2) return;
  if (ids.some(id => groupForElement(id))) { flashHint('群組不能重疊，請先解散既有群組'); return; }
  pushUndo(); S.groups.push({ id: newGroupId(), memberIds: [...ids] }); renderAll(); autosave();
}

/** 解散目前選取的整個群組，元素位置與屬性不動。 */
export function ungroupSelection() {
  const group = groupForSelection(); if (!group) return;
  pushUndo(); S.groups = S.groups.filter(item => item.id !== group.id); renderAll(); autosave();
}
