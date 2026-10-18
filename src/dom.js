/* 畫布與常用 DOM 節點的查詢入口；不依賴任何模組，讓其他模組在載入當下就能安全取用。 */

/** 以 CSS 選擇器取單一 DOM 節點的簡寫。 */
export const $ = sel => document.querySelector(sel);

export const cv = $('#cv'), ctx = cv.getContext('2d'), cw = $('#cw');

export const multiDeleteDlg = $('#multiDeleteDlg');
