/* 面板與對話框：工具列、屬性欄、元素清單、工具箱、類型／連動／匯入匯出對話框、世界設定與 autosave。 */

import { round4 } from './geometry.js';
import { $, cw, multiDeleteDlg } from './dom.js';
import { S, pushUndo, typeDef, typeColor, typeShape, canUseType, singletonLockedMessage, selected, selectionIds, selectIds, clearSelection, groupForElement, groupForSelection, RT } from './state.js';
import { normalizeGameCategory, serialize, validateLevel, deserialize } from './format.js';
import { draw, focusOn, fitViewToWorld } from './view.js';
import { deleteIds, deleteSel, duplicateSel, createGroup, ungroupSelection } from './interaction.js';

const LS_KEY = 'levelcraft:autosave';

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
    duplicate: '<rect x="8" y="8" width="11" height="11" rx="1"/><path d="M16 8V5H5v11h3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
    path: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18c6 0 3-12 10-12"/>',
    group: '<rect x="4" y="4" width="10" height="10" rx="1"/><rect x="10" y="10" width="10" height="10" rx="1"/>',
    ungroup: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/><path d="M11 7h2M7 11v2" stroke-dasharray="2 2"/>',
    up: '<path d="m7 14 5-5 5 5"/>',
    down: '<path d="m7 10 5 5 5-5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  };
  return `<svg class="ui-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.rect}</svg>`;
};

let toolbarTransientStatus = '';

let toolbarTransientTimer = null;

/** 讓底部工具列的狀態圖示暫時顯示某個狀態（如縮放中），duration 毫秒後自動恢復。 */
export function setToolbarTransientStatus(status, duration = 0) {
  toolbarTransientStatus = status;
  clearTimeout(toolbarTransientTimer);
  if (duration) toolbarTransientTimer = setTimeout(() => { toolbarTransientStatus = ''; updateToolbarStatus(); }, duration);
  updateToolbarStatus();
}

/** 依目前拖曳模式或暫時狀態，更新底部工具列的狀態圖示與提示。 */
export function updateToolbarStatus() {
  const indicator = $('#toolStatus');
  if (!indicator) return;
  const status = RT.drag?.mode === 'marquee' ? 'marquee' : RT.drag?.mode === 'pan' ? 'pan' : toolbarTransientStatus;
  if (status === 'marquee') { indicator.innerHTML = icon('marquee'); indicator.style.color = '#fff'; indicator.title = '框選中'; return; }
  if (status === 'pan') { indicator.innerHTML = icon('pan'); indicator.style.color = '#e7eaf3'; indicator.title = '平移中'; return; }
  if (status === 'zoom') { indicator.innerHTML = icon('zoom'); indicator.style.color = '#e7eaf3'; indicator.title = '縮放中'; return; }
  const type = typeDef(S.activeType) || { name: '未知類型', color: '#888', shape: 'rect' };
  indicator.innerHTML = icon(typeCategory(type));
  indicator.style.color = type.color;
  indicator.title = `目前放置：${type.name}`;
}

/** 刪除多個元素前跳出確認對話框。 */
export function showMultiDeleteDialog(ids) {
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

/** 重畫所有面板與畫布；任何會改變狀態的操作之後呼叫。 */
export function renderAll() { renderToolbar(); renderProps(); renderList(); renderToolbox(); updateStatus(); draw(); }

/** 工具列分組（rect/marker/node）— 編輯器 UI 用，不是遊戲語意 category */
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

/** 重建底部工具列的類型選單：每列是選用鈕＋編輯鈕，單例已在場上的類型選用鈕顯示為鎖定、編輯鈕照常可用。 */
export function renderToolbar() {
  for (const category of ['rect', 'marker', 'node']) {
    const menu = $(`#menu-${category}`);
    menu.innerHTML = '';
    const types = orderedTypesFor(category);
    for (const t of types) {
      const row = document.createElement('div'); row.className = 'toolbar-row';
      const item = document.createElement('button'); item.type = 'button';
      const isLocked = !canUseType(t.name);
      item.className = 'toolbar-item' + (t.name === S.activeType ? ' on' : '') + (isLocked ? ' locked' : '');
      item.disabled = isLocked;
      item.title = isLocked ? singletonLockedMessage(t.name) : `選擇 ${t.name}`;
      item.innerHTML = `<span class="sw" style="background:${t.color}"></span><span class="nm">${escapeHtml(t.name)}</span>${icon(t.shape === 'rect' ? 'rect' : 'point', 'toolbar-item-icon')}`;
      item.onclick = () => { S.activeType = t.name; setTool(t.shape === 'rect' ? 'rect' : 'marker'); closeToolbarMenus(); renderAll(); };
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'toolbar-item-edit';
      edit.dataset.editType = t.name; edit.title = `編輯類型 ${t.name}`; edit.setAttribute('aria-label', `編輯類型 ${t.name}`);
      edit.innerHTML = icon('edit');
      edit.onclick = () => { closeToolbarMenus(); openTypeDlg(t); };
      row.append(item, edit);
      menu.appendChild(row);
    }
  }
  document.querySelectorAll('[data-category]').forEach(button => {
    const category = button.dataset.category;
    button.classList.toggle('on', typeCategory(typeDef(S.activeType) || { shape: 'rect' }) === category);
  });
  updateToolbarStatus();
}

/** 重建右欄屬性面板（id、類型、描述、座標尺寸、自訂屬性），並綁定欄位修改。 */
export function renderProps() {
  const box = $('#props');
  const e = selected();
  if (!e) { box.innerHTML = '<div class="small">未選取任何元素。點畫布上的元素以編輯。</div>'; return; }
  const opts = S.types.filter(t => t.shape === e.kind)
    .map(t => `<option value="${escapeHtml(t.name)}" ${t.name === e.type ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
  let html = `
    <div class="row"><label>ID</label><input type="text" id="pId" value="${escapeHtml(e.id)}"></div>
    <div class="row"><label>類型</label><select id="pType">${opts}</select></div>
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
  html += `<h3 style="margin:12px 0 6px;font-size:11px;color:var(--muted)">群組（編輯器排版）</h3>
    <div class="small" style="margin-bottom:6px">群組會一起選取、搬移、複製與刪除；可從左側工具箱建立或解散，不匯出給遊戲端。</div>`;
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

  // 綁定基本欄位
  $('#pId').onchange = ev2 => { const nv = ev2.target.value.trim(); if (!nv || S.els.some(x => x !== e && x.id === nv)) { flashHint('ID 空白或重複'); renderProps(); return; } pushUndo(); const old = e.id; for (const x of S.els) if (x.links) x.links = x.links.map(id => id === old ? nv : id); e.id = nv; renderAll(); autosave(); };
  const typeSel = $('#pType');
  typeSel.onchange = ev2 => {
    if (!canUseType(ev2.target.value, e.id)) { flashHint(singletonLockedMessage(ev2.target.value)); renderProps(); return; }
    pushUndo(); e.type = ev2.target.value; renderAll(); autosave();
  };
  $('#pDescription').onchange = ev2 => { pushUndo(); e.description = ev2.target.value.trim(); autosave(); };
  const bindNum = (id, key) => { const el = $(id); if (!el) return; el.onchange = ev2 => { pushUndo(); e[key] = round4(parseFloat(ev2.target.value) || 0); renderAll(); autosave(); }; };
  bindNum('#pX', 'x'); bindNum('#pY', 'y'); bindNum('#pW', 'w'); bindNum('#pH', 'h');
  installNumberSteppers(box);
}

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

/** 重建右欄元素清單，點一下選取並聚焦該元素。 */
export function renderList() {
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

/** 更新狀態列的選取與縮放比例。 */
export function updateStatus() {
  const e = selected();
  $('#stSel').textContent = e ? `${e.id}` : '—';
  $('#stZoom').textContent = Math.round(S.view.zoom * 100) + '%';
}

/** 在狀態列短暫顯示一則提示（1.6 秒後恢復）。 */
export function flashHint(msg) {
  const s = $('#stSel'); const old = s.textContent; s.textContent = msg; s.style.color = '#f6ad55';
  setTimeout(() => { s.style.color = ''; updateStatus(); }, 1600);
}

/** 切換目前工具並重畫工具列。 */
export function setTool(t) {
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

let editingType = null;

const TYPE_SHAPE_OPTIONS = [
  { value: 'rect', label: '矩形 rect', iconName: 'rect' },
  { value: 'point', label: '點 point', iconName: 'point' },
];

function renderTypeShapePicker() {
  const current = TYPE_SHAPE_OPTIONS.find(option => option.value === $('#tdShape').value) || TYPE_SHAPE_OPTIONS[0];
  $('#tdShapeTrigger').innerHTML = `<span>${icon(current.iconName, 'toolbar-item-icon')} ${current.label}</span><span>⌄</span>`;
  $('#tdShapeMenu').innerHTML = TYPE_SHAPE_OPTIONS.map(option => `<button type="button" class="toolbar-item ${option.value === current.value ? 'on' : ''}" data-shape="${option.value}">${icon(option.iconName, 'toolbar-item-icon')}<span class="nm">${option.label}</span></button>`).join('');
  $('#tdShapeMenu').querySelectorAll('[data-shape]').forEach(button => {
    button.onclick = () => { $('#tdShape').value = button.dataset.shape; $('#tdShapeMenu').classList.remove('open'); renderTypeShapePicker(); };
  });
}

/** 開啟類型對話框：傳 null 為新增類型，傳類型定義為編輯該類型。 */
export function openTypeDlg(t) {
  editingType = t; // null = 新增
  $('#tdTitle').textContent = t ? `編輯類型：${t.name}` : '新增類型';
  $('#tdName').value = t ? t.name : '';
  $('#tdColor').value = t ? t.color : '#4fd1c5';
  $('#tdShape').value = t ? t.shape : 'rect';
  $('#tdCategory').value = t ? normalizeGameCategory(t.category) : 'object';
  $('#tdMovable').checked = Boolean(t?.movable);
  renderTypeShapePicker();
  $('#tdDescription').value = t ? (t.description || '') : '';
  // 使用中的類型不能刪（刪了元素會失去顏色與 category）：刪除鈕不渲染，改說明怎麼處理。
  const inUse = t ? typeUsageCount(t.name) : 0;
  $('#tdDelete').style.display = t && !inUse ? '' : 'none';
  $('#tdInUse').hidden = !inUse;
  $('#tdInUse').textContent = inUse ? typeInUseMessage(inUse) : '';
  $('#typeDlg').showModal();
}

function renderLinkDlg() {
  const e = selected();
  if (!e) { $('#linkDlg').close(); return; }
  $('#linkDlgTitle').textContent = `元素連動：${e.id}`;
  const links = $('#tbLinks');
  links.innerHTML = '';
  for (const targetId of (e.links || [])) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<span style="flex:1" class="small">連至 ${escapeHtml(targetId)}</span><button type="button" data-x class="danger" title="移除連動" aria-label="移除連動">${icon('trash')}</button>`;
    row.querySelector('[data-x]').onclick = () => { pushUndo(); e.links = e.links.filter(id => id !== targetId); renderLinkDlg(); draw(); autosave(); };
    links.appendChild(row);
  }
  const targetSelect = $('#tbLinkSel');
  // spawn 匯出時收進頂層 spawnUnit、不在 elements 裡，連過去會變成懸空參照。
  targetSelect.innerHTML = `<option value="">選目標…</option>${S.els.filter(item => item.id !== e.id && item.type !== 'spawn' && !(e.links || []).includes(item.id)).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} (${escapeHtml(item.type)})</option>`).join('')}`;
}

function openLinkDlg() {
  if (!selected()) return;
  renderLinkDlg();
  $('#linkDlg').showModal();
}

/** 依目前選取重建左欄工具箱，只渲染此刻能用的按鈕。 */
export function renderToolbox() {
  const e = selected();
  const canCreateGroup = selectionIds().length >= 2 && !selectionIds().some(id => groupForElement(id));
  const canEditPath = Boolean(e && typeDef(e.type)?.movable);
  const actions = $('#toolboxActions');
  actions.innerHTML = '';
  const addAction = (id, label, iconName, handler, className = '') => {
    const button = document.createElement('button'); button.type = 'button'; button.id = id; button.className = className;
    button.innerHTML = `${icon(iconName)}${label}`; button.onclick = handler; actions.appendChild(button);
  };
  if (canEditPath) addAction('tbEditPath', '編輯路徑', 'path', () => { RT.pathEditingId = e.id; S.tool = 'path'; flashHint('路徑模式：點擊新增、拖曳調整、右鍵刪除節點'); draw(); });
  if (canCreateGroup) addAction('tbGroup', '建立群組', 'group', createGroup);
  else if (groupForSelection()) addAction('tbUngroup', '解散群組', 'ungroup', ungroupSelection);
  if (e) {
    addAction('tbLinksAction', '連動', 'link', openLinkDlg);
    const pair = document.createElement('div'); pair.className = 'toolbox-pair';
    pair.innerHTML = `<button type="button" class="danger" id="tbDel">${icon('trash')}刪除</button><button type="button" id="tbDup">${icon('duplicate')}複製</button>`;
    pair.querySelector('#tbDel').onclick = deleteSel; pair.querySelector('#tbDup').onclick = duplicateSel; actions.appendChild(pair);
  }
  $('#tbPathInfo').textContent = !e ? '' : e.path?.length
    ? `有 ${e.path.length} 個節點。路徑模式：點擊新增、拖曳調整、右鍵刪除。`
    : '尚無路徑；按「編輯路徑」後點畫布新增節點。';
}

$('#tbAddType').onclick = () => openTypeDlg(null);

$('#tdShapeTrigger').onclick = () => $('#tdShapeMenu').classList.toggle('open');

$('#tdCancel').onclick = () => $('#typeDlg').close();

$('#tbLinkClose').onclick = () => $('#linkDlg').close();

$('#tbAddLink').onclick = () => {
  const e = selected(), targetId = $('#tbLinkSel').value;
  if (!e || !targetId) return;
  pushUndo(); e.links = e.links || [];
  if (!e.links.includes(targetId)) e.links.push(targetId);
  renderLinkDlg(); draw(); autosave();
};

function typeUsageCount(name) { return S.els.filter(e => e.type === name).length; }

function typeInUseMessage(count) {
  return `有 ${count} 個元素正在使用此類型，不能刪除。請先刪除這些元素，或在右欄把它們改成其他類型。`;
}

$('#tdDelete').onclick = () => {
  if (!editingType) return;
  // 守門在 pushUndo 之前：擋下的刪除不留空 undo。
  const inUse = typeUsageCount(editingType.name);
  if (inUse) { alert(typeInUseMessage(inUse)); return; }
  pushUndo();
  S.types = S.types.filter(x => x !== editingType);
  // 刪掉的若是目前放置類型，改選同形狀且還能放的類型（出生點／目的地已在場上就跳過），避免放出沒有定義的元素。
  if (S.activeType === editingType.name) {
    const next = S.types.find(t => t.shape === editingType.shape && canUseType(t.name)) || S.types.find(t => canUseType(t.name)) || S.types[0];
    S.activeType = next?.name || '';
  }
  $('#typeDlg').close(); renderAll(); autosave();
};

$('#tdSave').onclick = () => {
  const name = $('#tdName').value.trim();
  if (!name) { alert('名稱不可空白'); return; }
  const color = $('#tdColor').value;
  const shape = $('#tdShape').value;
  const category = normalizeGameCategory($('#tdCategory').value);
  const movable = $('#tdMovable').checked;
  const description = $('#tdDescription').value.trim();
  // 驗證全在 pushUndo 之前，失敗的儲存不留空 undo。
  if (S.types.some(t => t !== editingType && t.name === name)) { alert('類型名稱重複'); return; }
  const inUse = editingType ? S.els.filter(e => e.type === editingType.name) : [];
  if (editingType && shape !== editingType.shape && inUse.length) {
    alert(`有 ${inUse.length} 個元素正在使用此類型，不能改形狀（矩形與點的資料欄位不同）`); return;
  }
  pushUndo();
  if (editingType) {
    // 改名要連帶元素與目前選用類型，否則元素會變成找不到定義的孤兒（失去顏色與 category）。
    if (name !== editingType.name) {
      for (const e of inUse) e.type = name;
      if (S.activeType === editingType.name) S.activeType = name;
    }
    editingType.name = name;
    editingType.color = color;
    editingType.shape = shape;
    editingType.category = category;
    editingType.movable = movable;
    editingType.description = description;
  } else {
    S.types.push({ name, color, shape, category, movable, description });
    S.activeType = name;
  }
  $('#typeDlg').close(); renderAll(); autosave();
};

$('#btnExport').onclick = () => {
  const json = JSON.stringify(serialize(), null, 2);
  openIO('匯出 JSON', json, false);
};

$('#btnImport').onclick = () => openIO('匯入 JSON', '', true);

function openIO(title, text, isImport) {
  $('#ioTitle').textContent = title;
  $('#ioText').value = text;
  $('#ioText').readOnly = false;
  $('#ioFileRow').style.display = isImport ? '' : 'none';
  $('#ioFile').value = '';
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

// 選檔與貼上共用的唯一載入管線：解析 → 套用 → 框住關卡 → 明確回饋。
// 失敗一律 throw，由呼叫端顯示；不吞錯，避免「按了沒反應」。
function loadLevelFromText(text) {
  const raw = (text || '').trim();
  if (!raw) throw new Error('內容是空的');
  let d;
  try { d = JSON.parse(raw); } catch (err) { throw new Error('不是合法的 JSON（' + err.message + '）'); }
  validateLevel(d); // 先擋壞輸入，否則失敗的匯入會留下一筆還原不了東西的 undo。
  pushUndo();
  deserialize(d);
  fitViewToWorld();
  syncInputs(); renderAll(); autosave();
  flashHint(`已匯入 ${S.name}（${S.els.length} 個元素）`);
}

$('#ioLoad').onclick = () => {
  try { loadLevelFromText($('#ioText').value); $('#ioDlg').close(); }
  catch (err) { alert('匯入失敗：' + err.message); }
};

$('#ioFile').onchange = async ev => {
  const file = ev.target.files?.[0];
  if (!file) return;
  try { loadLevelFromText(await file.text()); $('#ioDlg').close(); }
  catch (err) { alert(`匯入失敗（${file.name}）：${err.message}`); }
  finally { ev.target.value = ''; } // 清掉才能重選同一個檔
};

/** 把狀態同步回頂部與世界設定的輸入框。 */
export function syncInputs() {
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
  S.els = [{ id: 'spawn-0', kind: 'point', type: 'spawn', x: 3, y: 15, description: '', props: {}, links: [] }]; clearSelection(); RT.uid = 1;
  S.groups = []; RT.pathEditingId = null; // 舊群組與路徑編輯目標都指向已清掉的元素
  if (S.tool === 'path') S.tool = typeShape(S.activeType) === 'rect' ? 'rect' : 'marker';
  fitViewToWorld();
  syncInputs(); renderAll(); autosave();
};

let saveTimer = null;

/** 延遲 300ms 把關卡（含群組）寫進 localStorage，連續變更只寫最後一次。 */
export function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(serialize(true))); } catch {}
  }, 300);
}

/** 從 localStorage 載入上次的關卡；沒有或壞掉時回 false。 */
export function loadAutosave() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { deserialize(JSON.parse(raw)); return true; }
  } catch {}
  return false;
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
