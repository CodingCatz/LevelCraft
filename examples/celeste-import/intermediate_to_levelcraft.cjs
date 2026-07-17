#!/usr/bin/env node
/**
 * intermediate room JSON → levelcraft/v1
 * Zero deps. See README.md for schema & compliance.
 *
 * Usage:
 *   node intermediate_to_levelcraft.mjs --in <dir|file> --out <dir>
 */

const fs = require("node:fs");
const path = require("node:path");

const TILE_PX = 8;

const DEFAULT_TYPES = [
  { name: "ground", color: "#5568d3", shape: "rect", description: "可行走／實心地形（from Celeste solids）" },
  { name: "wall", color: "#3d4a9e", shape: "rect", description: "實心牆" },
  { name: "spike", color: "#e53e3e", shape: "rect", description: "尖刺" },
  { name: "oneway", color: "#9f7aea", shape: "rect", description: "單向平台" },
  { name: "spawn", color: "#48bb78", shape: "point", description: "出生點" },
  { name: "checkpoint", color: "#38b2ac", shape: "point" },
  { name: "goal", color: "#4fd1c5", shape: "point" },
  { name: "switch", color: "#ed8936", shape: "point" },
  { name: "door", color: "#d69e2e", shape: "point" },
  { name: "key", color: "#ecc94b", shape: "point" },
  { name: "strawberry", color: "#fc8181", shape: "point", description: "草莓（實驗）" },
  { name: "spring", color: "#63b3ed", shape: "point", description: "彈簧" },
];

/** @param {string} name */
function mapEntityType(name) {
  const n = String(name || "").toLowerCase();
  if (n === "player" || n === "playerseating" || n === "spawningsplayer") return "spawn";
  if (n.includes("spike")) return "spike";
  if (n.includes("spring")) return "spring";
  if (n.includes("strawberry") || n === "flyingstrawberry") return "strawberry";
  if (n.includes("checkpoint") || n === "summitcheckpoint") return "checkpoint";
  if (n.includes("switch") || n.includes("touchswitch")) return "switch";
  if (n.includes("door") || n.includes("lockblock")) return "door";
  if (n.includes("key")) return "key";
  if (n.includes("jumpthru") || n.includes("oneway")) return "oneway";
  return null; // skip unknown by default (keep noise low)
}

/**
 * @param {string[]|number[][]} solids
 * @returns {number[][]} 0 empty, 1 solid
 */
function decodeSolids(solids) {
  if (!solids || !solids.length) return [];
  if (Array.isArray(solids[0])) {
    return solids.map((row) => row.map((c) => (c && c !== 0 && c !== "0" && c !== " " && c !== "." ? 1 : 0)));
  }
  return solids.map((row) => {
    const s = String(row);
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      out.push(ch === "0" || ch === " " || ch === "." || ch === "" ? 0 : 1);
    }
    return out;
  });
}

/**
 * Greedy row-run then vertical merge → axis-aligned rects in tile units.
 * @param {number[][]} grid
 * @returns {{x:number,y:number,w:number,h:number}[]}
 */
function greedyRects(grid) {
  const h = grid.length;
  if (!h) return [];
  const w = Math.max(...grid.map((r) => r.length));
  const used = Array.from({ length: h }, () => Array(w).fill(false));
  const rects = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!grid[y][x] || used[y][x]) continue;
      let maxW = 0;
      while (x + maxW < w && grid[y][x + maxW] && !used[y][x + maxW]) maxW++;
      let maxH = 1;
      outer: for (let yy = y + 1; yy < h; yy++) {
        for (let xx = 0; xx < maxW; xx++) {
          if (!grid[yy][x + xx] || used[yy][x + xx]) break outer;
        }
        maxH++;
      }
      for (let yy = y; yy < y + maxH; yy++) {
        for (let xx = x; xx < x + maxW; xx++) used[yy][xx] = true;
      }
      rects.push({ x, y, w: maxW, h: maxH });
    }
  }
  return rects;
}

function pxToUnit(v) {
  return Math.round((Number(v) || 0) / TILE_PX * 1000) / 1000;
}

/**
 * @param {object} room
 */
function convertRoom(room) {
  const grid = decodeSolids(room.solids || []);
  const heightTiles =
    room.heightTiles ||
    (grid.length ? grid.length : 23);
  const widthTiles =
    room.widthTiles ||
    (grid.length ? Math.max(...grid.map((r) => r.length), 1) : 40);

  /** @type {any[]} */
  const elements = [];
  let idSeq = 0;
  const nid = (prefix) => `${prefix}-${++idSeq}`;

  for (const r of greedyRects(grid)) {
    // Heuristic: thin tall → wall, else ground
    const type = r.h >= 3 && r.w <= 2 ? "wall" : "ground";
    elements.push({
      id: nid(type),
      kind: "rect",
      type,
      xUnit: r.x,
      yUnit: r.y,
      wUnit: r.w,
      hUnit: r.h,
      props: { source: "solids" },
    });
  }

  let spawnUnit = null;
  for (const e of room.entities || []) {
    const type = mapEntityType(e.name || e.type);
    if (!type) continue;
    const xUnit = e.xUnit != null ? Number(e.xUnit) : pxToUnit(e.x);
    const yUnit = e.yUnit != null ? Number(e.yUnit) : pxToUnit(e.y);
    const wUnit =
      e.wUnit != null
        ? Number(e.wUnit)
        : e.width != null
          ? Math.max(pxToUnit(e.width), 0.5)
          : undefined;
    const hUnit =
      e.hUnit != null
        ? Number(e.hUnit)
        : e.height != null
          ? Math.max(pxToUnit(e.height), 0.5)
          : undefined;

    if (type === "spawn") {
      spawnUnit = { x: xUnit, y: yUnit };
      continue;
    }

    if (type === "spike" || type === "oneway") {
      elements.push({
        id: nid(type),
        kind: "rect",
        type,
        xUnit,
        yUnit,
        wUnit: wUnit ?? 1,
        hUnit: hUnit ?? 1,
        props: {
          celesteEntityName: String(e.name || e.type || ""),
          ...(e.props || {}),
        },
      });
    } else {
      elements.push({
        id: nid(type),
        kind: "point",
        type,
        xUnit,
        yUnit,
        props: {
          celesteEntityName: String(e.name || e.type || ""),
          ...(e.props || {}),
        },
      });
    }
  }

  const mapId = room.sourceMap || room.map || "unknown-map";
  const roomId = room.sourceRoom || room.room || room.name || "room";
  const name = `celeste/${mapId}/${roomId}`;

  return {
    format: "levelcraft/v1",
    name,
    world: { wUnit: widthTiles, hUnit: heightTiles },
    snap: 1,
    spawnUnit,
    types: DEFAULT_TYPES,
    elements,
    description: [
      room.side ? `side=${room.side}` : null,
      "converted from Celeste-like intermediate; not an official redistribution",
    ]
      .filter(Boolean)
      .join("; "),
  };
}

function parseArgs(argv) {
  const out = { in: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--in") out.in = argv[++i];
    else if (argv[i] === "--out") out.out = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") out.help = true;
  }
  return out;
}

function collectInputs(inPath) {
  const st = fs.statSync(inPath);
  if (st.isFile()) return [inPath];
  return fs
    .readdirSync(inPath)
    .filter((f) => f.endsWith(".json"))
    // skip batch index / non-room sidecars (they have rooms[] metadata without solids)
    .filter((f) => !f.startsWith("_"))
    .map((f) => path.join(inPath, f))
    .sort();
}

/** @param {any} room */
function isRoomPayload(room) {
  if (!room || typeof room !== "object") return false;
  if (Array.isArray(room.solids)) return true;
  if (Array.isArray(room.entities) && (room.sourceMap || room.sourceRoom)) return true;
  return false;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.in || !args.out) {
    console.log(
      "Usage: node intermediate_to_levelcraft.mjs --in <dir|file> --out <dir>"
    );
    process.exit(args.help ? 0 : 1);
  }

  const absIn = path.resolve(args.in);
  const absOut = path.resolve(args.out);
  fs.mkdirSync(absOut, { recursive: true });

  const files = collectInputs(absIn);
  if (!files.length) {
    console.error("No .json inputs under", absIn);
    process.exit(1);
  }

  let n = 0;
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    let rooms;
    if (Array.isArray(raw)) rooms = raw;
    else if (Array.isArray(raw.rooms) && raw.rooms.some(isRoomPayload)) rooms = raw.rooms;
    else rooms = [raw];
    for (const room of rooms) {
      if (!isRoomPayload(room)) {
        console.warn("skip non-room payload in", path.basename(file));
        continue;
      }
      const lv = convertRoom(room);
      const safe = lv.name.replace(/[^\w./-]+/g, "_").replace(/\//g, "__");
      const outFile = path.join(absOut, `${safe}.json`);
      fs.writeFileSync(outFile, JSON.stringify(lv, null, 2) + "\n", "utf8");
      console.log("wrote", outFile, `(elements=${lv.elements.length})`);
      n++;
    }
  }
  console.log(`done: ${n} level(s) → ${absOut}`);
}

main();
