#!/usr/bin/env node
/**
 * 匯入分類自檢 — 零依賴，`node check-import.cjs`。
 *
 * 守的是「選錯檔」這條路：抽取管線的中間檔與轉換後關卡同名、只差 celeste__ 前綴且住在相鄰
 * 資料夾，實戰已誤選過一次。這裡拿 editor.js 裡真正出貨的 intermediateKind 去跑 examples/
 * 底下的真檔，確保中間檔一定被認出來指路、真關卡一定不被誤擋。
 *
 * data/ 已 gitignore，缺檔時該組自動 SKIP（仍會跑 fixtures/ 與 out/）。
 */

const fs = require("node:fs");
const path = require("node:path");

// 直接從 editor.js 抽出出貨中的函式，避免自檢複製一份會漂移的副本。
function loadIntermediateKind() {
  const src = fs.readFileSync(path.join(__dirname, "editor.js"), "utf8");
  const m = src.match(/function intermediateKind\(d\) \{[\s\S]*?\n\}/);
  if (!m) throw new Error("editor.js 找不到 intermediateKind（改名了就同步這裡）");
  return new Function("return (" + m[0].replace("function intermediateKind", "function") + ")")();
}

const intermediateKind = loadIntermediateKind();

function loadNormalizeGameCategory() {
  const src = fs.readFileSync(path.join(__dirname, "editor.js"), "utf8");
  const m = src.match(/function normalizeGameCategory\(cat\) \{[\s\S]*?\n\}/);
  if (!m) throw new Error("editor.js 找不到 normalizeGameCategory（改名了就同步這裡）");
  return new Function("return (" + m[0].replace("function normalizeGameCategory", "function") + ")")();
}

const normalizeGameCategory = loadNormalizeGameCategory();
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

console.log(failed ? `\n${failed} 個錯誤（共 ${ran} 檔 + category 案）` : `\n全部通過（${ran} 檔 + category 案）`);
process.exit(failed ? 1 : 0);
