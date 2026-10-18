#!/usr/bin/env node
/**
 * 匯入分類自檢 — 零依賴，`node check-import.cjs`。
 *
 * 守的是「選錯檔」這條路：抽取管線的中間檔與轉換後關卡同名、只差 celeste__ 前綴且住在相鄰
 * 資料夾，實戰已誤選過一次。這裡拿 src/format.js 裡真正出貨的 intermediateKind 去跑 examples/
 * 底下的真檔，確保中間檔一定被認出來指路、真關卡一定不被誤擋。
 *
 * data/ 已 gitignore，缺檔時該組自動 SKIP（仍會跑 fixtures/ 與 out/）。
 */

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// 直接 import 出貨中的格式與幾何模組（不碰 DOM），自檢不再複製或用 regex 抽函式。
const load = rel => import(pathToFileURL(path.join(__dirname, "src", rel)).href);

(async () => {
const { intermediateKind, normalizeGameCategory, normalizeElementRefs, absolutePathToOffsets, VERSION } = await load("format.js");
const { fitZoomFor, minZoomFor } = await load("geometry.js");
const BASE = path.join(__dirname, "examples", "celeste-import");

/** @type {Array<[string, (file: string, kind: string|null) => boolean, string]>} */
const CASES = [
  // 中間檔：_index.json 是房間清單，其餘是 room payload。
  ["data/intermediate", (f, k) => (f === "_index.json" ? k === "index" : k === "room"), "中間檔要被認出"],
  // 合成 intermediate（README：手製、用來驗管線）——同樣是中間檔。
  ["fixtures", (_f, k) => k === "room", "合成中間檔要被認出"],
  // 轉換後的真關卡：一律不得被誤判成中間檔，否則擋掉正常匯入。
  ["data/levelcraft", (_f, k) => k === null, "真關卡不得被誤擋"],
  ["out", (_f, k) => k === null, "轉換輸出不得被誤擋"],
];

let failed = 0;
let ran = 0;

for (const [dir, predicate, label] of CASES) {
  const full = path.join(BASE, dir);
  if (!fs.existsSync(full)) {
    console.log(`SKIP  ${dir.padEnd(18)} (不存在)`);
    continue;
  }
  const files = fs.readdirSync(full).filter(f => f.endsWith(".json"));
  const bad = [];
  for (const f of files) {
    const kind = intermediateKind(JSON.parse(fs.readFileSync(path.join(full, f), "utf8")));
    if (!predicate(f, kind)) bad.push(`${f} → ${kind}`);
  }
  ran += files.length;
  failed += bad.length;
  const status = bad.length ? "FAIL" : "PASS";
  console.log(`${status}  ${dir.padEnd(18)} ${String(files.length).padStart(2)} 檔  ${label}`);
  for (const b of bad) console.log(`        ✗ ${b}`);
}

// category 相容性：有值保留、缺欄／亂值 → object（對齊 deserialize 行為）
const catCases = [
  ["solid", "solid"],
  ["hazard", "hazard"],
  ["object", "object"],
  ["decor", "decor"],
  ["SOLID", "solid"],
  [undefined, "object"],
  ["", "object"],
  ["nope", "object"],
];
let catFail = 0;
for (const [input, expect] of catCases) {
  const got = normalizeGameCategory(input);
  if (got !== expect) {
    catFail++;
    console.log(`FAIL  category normalize  ${JSON.stringify(input)} → ${got}（預期 ${expect}）`);
  }
}
if (!catFail) console.log(`PASS  category normalize ${catCases.length} 案  有/無 category 皆可正規化`);
failed += catFail;

// 舊真關卡 types 可無 category；模擬匯入後每個 type 應為合法 enum（缺欄 → object）
const sampleLevel = path.join(BASE, "out", "celeste__0-Intro__start.json");
if (fs.existsSync(sampleLevel)) {
  const d = JSON.parse(fs.readFileSync(sampleLevel, "utf8"));
  const types = (d.types || []).map(t => ({
    name: t.name,
    raw: t.category,
    category: normalizeGameCategory(t.category),
  }));
  const ok = types.length > 0 && types.every(t =>
    ["solid", "hazard", "object", "decor"].includes(t.category)
  );
  // 此 fixture 目前無 category 欄 → 全部應預設 object
  const missingBecomeObject = types.every(t =>
    t.raw != null && t.raw !== "" ? true : t.category === "object"
  );
  if (ok && missingBecomeObject) {
    console.log(`PASS  category import-compat  ${types.length} types  舊檔無 category → object`);
  } else {
    failed++;
    console.log("FAIL  category import-compat");
  }
} else {
  console.log("SKIP  category import-compat (sample level 不存在)");
}

// id／links 正規化：缺 id、撞 id、懸空與自連都要收斂，否則選取與匯出 targetId 會錯。
{
  const els = normalizeElementRefs([
    { id: "a", type: "switch", links: ["b", "ghost", "a", "b"] },
    { id: "a", type: "door" },            // 撞號
    { type: "key" },                       // 缺 id
    { id: "  ", type: "key", links: ["a"] }, // 空白 id
    { id: "b", type: "door" },
  ]);
  const ids = els.map(e => e.id);
  const unique = new Set(ids).size === ids.length && ids.every(id => typeof id === "string" && id);
  const linksOk = JSON.stringify(els[0].links) === '["b"]' && JSON.stringify(els[3].links) === '["a"]';
  if (unique && linksOk && ids[0] === "a" && ids[4] === "b") console.log("PASS  element refs        缺/撞 id 補號、懸空/自連/重複 links 清除");
  else { failed++; console.log(`FAIL  element refs  ids=${JSON.stringify(ids)} links0=${JSON.stringify(els[0].links)}`); }
}

// 路徑舊檔相容：沒有 pathSpace 的 path 是元素中心要到的世界座標，匯入時換成相對中心的位移。
{
  const got = absolutePathToOffsets([{ x: 6, y: 4 }, { x: 8, y: 4 }, { x: 5.6, y: 4.7 }], { x: 5.5, y: 4.5 });
  const want = [{ x: 0.5, y: -0.5 }, { x: 2.5, y: -0.5 }, { x: 0.1, y: 0.2 }];
  if (JSON.stringify(got) === JSON.stringify(want)) console.log("PASS  path legacy        絕對座標 → 相對中心位移（含浮點捨入）");
  else { failed++; console.log(`FAIL  path legacy  得 ${JSON.stringify(got)}，預期 ${JSON.stringify(want)}`); }
}

// 縮放下限自適應：小世界維持 0.15；大世界的下限要低到「裝滿畫面」的 zoom 以下，否則 fitViewToWorld 被卡住、世界裝不進畫面。
{
  const view = [1000, 700, 40];
  const small = minZoomFor(80, 20, 20, ...view);
  const bigFit = fitZoomFor(2000, 600, 20, ...view), bigMin = minZoomFor(2000, 600, 20, ...view);
  const degenerate = minZoomFor(80, 20, 20, 0, 0, 40);
  const problems = [];
  if (small !== 0.15) problems.push(`80×20 下限應為 0.15，得 ${small}`);
  if (!(bigMin < 0.15 && bigMin > 0 && bigMin <= bigFit)) problems.push(`2000×600 下限 ${bigMin} 必須介於 0 與裝滿畫面的 ${bigFit} 之間`);
  if (degenerate !== 0.15) problems.push(`畫面尺寸 0 時應退回 0.15，得 ${degenerate}`);
  if (!problems.length) console.log(`PASS  zoom floor          80×20 → 0.15；2000×600 → ${bigMin.toFixed(4)}（裝滿 ${bigFit.toFixed(4)}）`);
  else { failed++; console.log(`FAIL  zoom floor  ${problems.join("；")}`); }
}

// 格式層不得碰 DOM：format.js 與它依賴的 state.js／geometry.js 要能在 Node 直接 import（上面能跑就證明了載入），
// 這裡再擋函式本體裡偷用瀏覽器 API（只在呼叫時才炸、載入時看不出來）。
{
  const browserApi = /\b(document|window|localStorage|navigator)\s*[.[]|\b(alert|confirm)\s*\(/;
  const hits = ["format.js", "state.js", "geometry.js"].flatMap(f => fs.readFileSync(path.join(__dirname, "src", f), "utf8")
    .split("\n").map((line, i) => [f, i + 1, line]).filter(([, , line]) => !/^\s*(\/\/|\*|\/\*)/.test(line) && browserApi.test(line)));
  if (!hits.length) console.log("PASS  format no-DOM       format.js／state.js／geometry.js 不引用瀏覽器 API");
  else { failed++; for (const [f, n, line] of hits) console.log(`FAIL  format no-DOM  ${f}:${n} ${line.trim()}`); }
}

// 版號顯示 SSOT：src/format.js 的 VERSION 必須等於 CHANGELOG 最新條目（v0.18.x 曾漂在 0.17.0 沒人發現）。
{
  const top = /^## \[(\d+\.\d+\.\d+[^\]]*)\]/m.exec(fs.readFileSync(path.join(__dirname, "CHANGELOG.md"), "utf8"))?.[1];
  if (VERSION && top && VERSION === top) console.log(`PASS  version sync        format.js = CHANGELOG = ${VERSION}`);
  else { failed++; console.log(`FAIL  version sync  format.js=${VERSION} CHANGELOG=${top}`); }
}

console.log(failed ? `\n${failed} 個錯誤（共 ${ran} 檔 + category 案）` : `\n全部通過（${ran} 檔 + category 案）`);
process.exit(failed ? 1 : 0);
})().catch(err => { console.error(`FAIL  執行錯誤：${err.stack || err}`); process.exit(1); });
