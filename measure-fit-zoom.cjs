#!/usr/bin/env node
/**
 * fitViewToWorld 貼合縮放量測 — 零依賴，`node measure-fit-zoom.cjs --dir <關卡資料夾>`。
 *
 * 回答的是「有幾張關卡需要縮到比 zoom 下限更小才裝得進畫面」。
 * 縮放公式直接從 editor.js 抽出出貨中的 fitZoomRaw，避免量測拿一份會漂移的副本去算。
 *
 * 用法：
 *   node measure-fit-zoom.cjs --dir examples/celeste-import/data/levelcraft
 *   node measure-fit-zoom.cjs --dir <dir> --viewport 1366x768   # 可重複，預設三種
 *   node measure-fit-zoom.cjs --dir <dir> --json                # 機器可讀輸出
 *
 * 視窗→畫布：index.html 的 grid 是 `220px 1fr 280px` / `40px 1fr 24px`，
 * 所以畫布 = 視窗寬 - 500、視窗高 - 64。
 */

const fs = require("node:fs");
const path = require("node:path");

const CHROME_W = 220 + 280;
const CHROME_H = 40 + 24;
const DEFAULT_VIEWPORTS = ["2560x1440", "1920x1080", "1366x768"];

/** 從 editor.js 抽出出貨中的函式，避免量測複製一份會漂移的副本（同 check-import.cjs 的作法）。 */
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

const { ZOOM_FLOOR_BASE, fitZoomRaw, zoomFloor } =
  loadFromEditor(["ZOOM_FLOOR_BASE", "fitZoomRaw", "zoomFloor", "clampZoom"]);
const PPU = 20; // editor.js S.ppu 預設值；匯入不會改它

function parseArgs(argv) {
  const out = { dir: null, viewports: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") out.dir = argv[++i];
    else if (argv[i] === "--viewport") out.viewports.push(argv[++i]);
    else if (argv[i] === "--json") out.json = true;
  }
  if (!out.viewports.length) out.viewports = DEFAULT_VIEWPORTS.slice();
  return out;
}

function parseViewport(s) {
  const m = String(s).match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`--viewport 要寫成 WxH，收到：${s}`);
  return { label: s, w: Number(m[1]) - CHROME_W, h: Number(m[2]) - CHROME_H };
}

/** 讀關卡世界尺寸，對齊 editor.js 的 world 讀法（wUnit/w 別名 + 預設值）。 */
function worldOf(file) {
  const d = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  const w = Number(d.world?.wUnit ?? d.world?.w);
  const h = Number(d.world?.hUnit ?? d.world?.h);
  if (!(w > 0) || !(h > 0)) return null;
  return { w, h };
}

function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) {
    console.error("用法：node measure-fit-zoom.cjs --dir <關卡資料夾> [--viewport WxH]... [--json]");
    process.exit(2);
  }
  const dir = path.resolve(args.dir);
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && f !== "_index.json").sort();
  if (!files.length) {
    console.error(`${dir} 底下沒有 .json`);
    process.exit(2);
  }

  const worlds = [];
  const skipped = [];
  for (const f of files) {
    const w = worldOf(path.join(dir, f));
    if (w) worlds.push({ file: f, ...w });
    else skipped.push(f);
  }

  const report = { dir, total: files.length, measured: worlds.length, skipped: skipped.length, viewports: [] };

  for (const vpSpec of args.viewports) {
    const vp = parseViewport(vpSpec);
    const rows = worlds.map(w => {
      const raw = fitZoomRaw(vp.w, vp.h, w.w, w.h, PPU);
      return { file: w.file, w: w.w, h: w.h, raw, floor: zoomFloor(vp.w, vp.h, w.w, w.h, PPU) };
    });
    const under = rows.filter(r => r.raw < ZOOM_FLOOR_BASE).sort((a, b) => a.raw - b.raw);
    const sortedRaw = rows.map(r => r.raw).sort((a, b) => a - b);
    report.viewports.push({
      viewport: vp.label,
      canvas: `${vp.w}x${vp.h}`,
      underLimit: under.length,
      minRaw: sortedRaw[0],
      p1: percentile(sortedRaw, 1),
      p5: percentile(sortedRaw, 5),
      p50: percentile(sortedRaw, 50),
      worst: under.slice(0, 15).map(r => ({ file: r.file, world: `${r.w}x${r.h}`, raw: Number(r.raw.toFixed(5)) })),
      // 前後對照：舊行為＝固定下限 0.15，新行為＝下限讓到貼合值。
      // 「溢出」＝世界在畫面上的尺寸超過畫布扣掉 pad 之後的可用區。
      beforeAfter: [...under.slice(0, 5), ...rows.filter(r => r.raw >= ZOOM_FLOOR_BASE).slice(0, 3)]
        .map(r => {
          const mk = zoom => ({
            zoom: Number(zoom.toFixed(5)),
            px: `${Math.round(r.w * PPU * zoom)}x${Math.round(r.h * PPU * zoom)}`,
            overflow: r.w * PPU * zoom > vp.w - 80 + 1e-6 || r.h * PPU * zoom > vp.h - 80 + 1e-6,
          });
          return {
            file: r.file, world: `${r.w}x${r.h}`,
            before: mk(Math.min(8, Math.max(ZOOM_FLOOR_BASE, r.raw))),
            after: mk(Math.min(8, Math.max(r.floor, r.raw))),
          };
        }),
    });
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`資料源：${dir}`);
  console.log(`關卡數：${report.total}（可量測 ${report.measured}，跳過 ${report.skipped}）`);
  console.log(`ppu=${PPU}，pad=40，常態下限 ZOOM_FLOOR_BASE=${ZOOM_FLOOR_BASE}\n`);
  for (const v of report.viewports) {
    console.log(`── 視窗 ${v.viewport}（畫布 ${v.canvas}）`);
    console.log(`   需要 < ${ZOOM_FLOOR_BASE}：${v.underLimit} 張 / ${report.measured}（${(v.underLimit / report.measured * 100).toFixed(1)}%）`);
    console.log(`   最小需要縮放：${v.minRaw.toFixed(5)}`);
    console.log(`   分佈 p1=${v.p1.toFixed(4)} p5=${v.p5.toFixed(4)} p50=${v.p50.toFixed(4)}`);
    if (v.worst.length) {
      console.log(`   最吃緊的 ${v.worst.length} 張：`);
      for (const r of v.worst) console.log(`     ${r.raw.toFixed(5)}  ${r.world.padEnd(12)} ${r.file}`);
    }
    console.log(`   前後對照（可用區 ${v.canvas.split("x")[0] - 80}x${v.canvas.split("x")[1] - 80}）：`);
    console.log(`     ${"世界".padEnd(10)} ${"修前 zoom / 畫面px / 溢出".padEnd(34)} 修後 zoom / 畫面px / 溢出`);
    for (const r of v.beforeAfter) {
      const f = x => `${String(x.zoom).padEnd(8)} ${x.px.padEnd(12)} ${x.overflow ? "溢出" : "OK  "}`;
      console.log(`     ${r.world.padEnd(10)} ${f(r.before).padEnd(34)} ${f(r.after)}   ${r.file}`);
    }
    console.log("");
  }
}

main();
