#!/usr/bin/env node
/**
 * 縮放下限自檢 — 零依賴，`node check-fit-zoom.cjs`。
 *
 * 守的是 fitViewToWorld 的存在理由：「匯入後整張關卡要在畫面裡」。
 * 0.15 的固定下限曾把夠大的世界夾住，讓貼合縮放算完又被推回去 → 世界溢出視窗，
 * 正好做出這個函式本來要避免的「按了沒反應」。
 *
 * 這裡直接跑 editor.js 出貨中的 fitZoomRaw / zoomFloor / clampZoom（regex 抽出，
 * 同 check-import.cjs 的作法），所以改回固定下限的話這支一定 FAIL。
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * 把 editor.js 裡指名的常數／函式整組搬到同一個 scope 再取出來。
 * 必須同 scope：zoomFloor 會呼叫 fitZoomRaw、clampZoom 預設值吃 ZOOM_FLOOR_BASE。
 */
function loadFromEditor(names) {
  const src = fs.readFileSync(path.join(__dirname, "editor.js"), "utf8");
  const parts = names.map(name => {
    const m = src.match(new RegExp(`^const ${name} = [^\\n]*`, "m"))          // 常數
      || src.match(new RegExp(`^function ${name}\\(.*\\}[ \\t]*$`, "m"))      // 單行函式
      || src.match(new RegExp(`^function ${name}\\([\\s\\S]*?\\n\\}`, "m"));  // 多行函式
    if (!m) throw new Error(`editor.js 找不到 ${name}（改名了就同步這裡）`);
    return m[0];
  });
  return new Function(`${parts.join("\n")}\nreturn { ${names.join(", ")} };`)();
}

const { fitZoomRaw, zoomFloor, clampZoom } =
  loadFromEditor(["ZOOM_FLOOR_BASE", "fitZoomRaw", "zoomFloor", "clampZoom"]);

const PPU = 20;
const PAD = 40;
let fail = 0;
function ok(cond, label, extra) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? `  ${extra}` : ""}`);
  if (!cond) fail++;
}

/** 重現 fitViewToWorld：回傳套用下限後的縮放。 */
function fitZoom(rectW, rectH, worldW, worldH) {
  return clampZoom(
    fitZoomRaw(rectW, rectH, worldW, worldH, PPU),
    zoomFloor(rectW, rectH, worldW, worldH, PPU),
  );
}

/** 世界在這個縮放下佔的畫面像素，扣掉 pad 後還裝得下嗎（容一點浮點誤差）。 */
function fitsOnScreen(rectW, rectH, worldW, worldH, zoom) {
  const s = PPU * zoom;
  return worldW * s <= rectW - PAD * 2 + 1e-6 && worldH * s <= rectH - PAD * 2 + 1e-6;
}

// 1920×1080 視窗 → index.html 的 grid（220+280 / 40+24）扣掉後的畫布
const CANVAS = { w: 1420, h: 1016 };
// 1366×768
const SMALL = { w: 866, h: 704 };

console.log("── 中招關卡：貼合後必須整張進畫面（量測自 Celeste 824 rooms 的最吃緊幾張）");
// world 尺寸取自 measure-fit-zoom.cjs 在 1920×1080 列出的 9 張中最極端者
for (const [w, h, label] of [
  [40, 578, "LostLevels j-19（最小需要 0.081）"],
  [768, 340, "LostLevels j-16"],
  [659, 23, "9X-Core 02（極扁）"],
  [320, 407, "7-Summit g-01"],
  [40, 395, "6-Reflection start"],
]) {
  const z = fitZoom(CANVAS.w, CANVAS.h, w, h);
  ok(z < 0.15, `${label} 的貼合縮放低於 0.15`, `zoom=${z.toFixed(5)}`);
  ok(fitsOnScreen(CANVAS.w, CANVAS.h, w, h, z), `${label} 整張進畫面`, `${w}x${h}`);
  // fitViewToWorld 的置中：view.x/y = (畫布 - 世界像素) / 2。裝得下時兩側留白必須非負且相等。
  const vx = (CANVAS.w - w * PPU * z) / 2;
  const vy = (CANVAS.h - h * PPU * z) / 2;
  ok(vx >= -1e-6 && vy >= -1e-6, `${label} 置中且四邊留白非負`,
    `左右=${vx.toFixed(1)} 上下=${vy.toFixed(1)}`);
}

console.log("\n── 回歸：本來就裝得下的世界，行為必須完全不變");
for (const [w, h, label] of [
  [80, 20, "預設新關卡 80x20"],
  [40, 23, "Celeste 典型 room 40x23"],
  [320, 180, "中型世界 320x180"],
  [200, 100, "剛好在下限之上"],
]) {
  const raw = fitZoomRaw(CANVAS.w, CANVAS.h, w, h, PPU);
  const z = fitZoom(CANVAS.w, CANVAS.h, w, h);
  ok(raw >= 0.15, `${label} 的原始貼合值本來就 >= 0.15`, `raw=${raw.toFixed(4)}`);
  ok(z === Math.min(8, raw), `${label} 貼合縮放與舊行為一致`, `zoom=${z.toFixed(4)}`);
  ok(zoomFloor(CANVAS.w, CANVAS.h, w, h, PPU) === 0.15, `${label} 的縮放下限維持 0.15`);
}

console.log("\n── 手動縮放：下限與 fit 共用一條，不會互相打架");
{
  const big = [40, 578];
  const floor = zoomFloor(CANVAS.w, CANVAS.h, big[0], big[1], PPU);
  const fit = fitZoom(CANVAS.w, CANVAS.h, big[0], big[1]);
  ok(floor === fit, "大世界：fit 落點就是手動縮放下限（滾一格不會被彈回 0.15）",
    `floor=${floor.toFixed(5)} fit=${fit.toFixed(5)}`);
  ok(clampZoom(fit / 1.1, floor) === floor, "大世界：再往外滾停在下限，不會無限縮小");
  const small = [80, 20];
  const smallFloor = zoomFloor(CANVAS.w, CANVAS.h, small[0], small[1], PPU);
  ok(smallFloor === 0.15, "小世界：手動縮放下限仍是 0.15（代價沒有外溢到一般關卡）");
  ok(clampZoom(0.01, smallFloor) === 0.15, "小世界：手動縮到 0.01 仍被夾回 0.15");
}

console.log("\n── 上限與退化情形");
ok(clampZoom(999, 0.15) === 8, "上限仍是 8");
ok(zoomFloor(50, 50, 80, 20, PPU) === 0.15, "畫布比 pad 還小時退回 0.15，不會算出 0 或負數");
ok(zoomFloor(CANVAS.w, CANVAS.h, 0, 0, PPU) === 0.15, "世界尺寸為 0 時退回 0.15");

console.log("\n── 小視窗（1366×768）：中招張數更多，同樣要裝得下");
for (const [w, h] of [[768, 340], [362, 158], [321, 23]]) {
  const z = fitZoom(SMALL.w, SMALL.h, w, h);
  ok(fitsOnScreen(SMALL.w, SMALL.h, w, h, z), `${w}x${h} 在 1366x768 整張進畫面`, `zoom=${z.toFixed(5)}`);
}

console.log(`\n${fail ? `${fail} 項失敗` : "全部通過"}`);
process.exit(fail ? 1 : 0);
