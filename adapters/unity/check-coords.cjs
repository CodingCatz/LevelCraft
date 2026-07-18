#!/usr/bin/env node
/**
 * Coordinate + parse self-check for the Unity adapter formulas.
 * Mirrors LevelCraftCoordTests / LevelCraftDocument math (no Unity required).
 *
 *   node adapters/unity/check-coords.cjs
 */

function pointToUnity(xUnit, yUnit, worldH, scale) {
  return { x: xUnit * scale, y: (worldH - yUnit) * scale };
}

function rectToUnity(xUnit, yUnit, wUnit, hUnit, worldH, scale) {
  return {
    bl: { x: xUnit * scale, y: (worldH - yUnit - hUnit) * scale },
    size: { x: wUnit * scale, y: hUnit * scale },
  };
}

function rectToCellRange(xUnit, yUnit, wUnit, hUnit, worldH) {
  let xMin = Math.floor(xUnit);
  let xMaxEx = Math.ceil(xUnit + wUnit);
  if (xMaxEx <= xMin) xMaxEx = xMin + 1;
  let yMin = Math.floor(worldH - yUnit - hUnit);
  let yMaxEx = Math.ceil(worldH - yUnit);
  if (yMaxEx <= yMin) yMaxEx = yMin + 1;
  return { xMin, yMin, xMax: xMaxEx - 1, yMax: yMaxEx - 1 };
}

function normalizeCategory(raw) {
  if (raw == null || String(raw).trim() === '') return 'object';
  const c = String(raw).trim().toLowerCase();
  return ['solid', 'hazard', 'object', 'decor'].includes(c) ? c : 'object';
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL ', msg);
  } else {
    console.log('PASS ', msg);
  }
}
function near(a, b, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

const WorldH = 16;

// Point
{
  const top = pointToUnity(3, 0, WorldH, 1);
  assert(near(top.x, 3) && near(top.y, 16), 'point y=0 → unityY=worldH');
  const p = pointToUnity(2, 12, WorldH, 1);
  assert(near(p.x, 2) && near(p.y, 4), 'point y=12 → unityY=4');
}

// Rect floor
{
  const { bl, size } = rectToUnity(0, 14, 30, 2, WorldH, 1);
  assert(near(bl.x, 0) && near(bl.y, 0) && near(size.x, 30) && near(size.y, 2), 'floor rect → bl(0,0) size(30,2)');
  const centerY = bl.y + size.y / 2;
  assert(near(centerY, 1), 'floor rect center Y=1');
}

// Cell range platform
{
  const c = rectToCellRange(6, 11, 5, 1, WorldH);
  assert(c.xMin === 6 && c.xMax === 10 && c.yMin === 4 && c.yMax === 4, 'platform cells x6-10 y4');
}

// Scale 32 — compare with Phaser (same X; Unity Y-flips, Phaser does not)
{
  const u = pointToUnity(2, 12, WorldH, 32);
  assert(near(u.x, 64) && near(u.y, 128), 'scale 32 point');
  // Phaser pure: y = 12*32 = 384 (Y-down). Unity y = (16-12)*32 = 128 (Y-up).
  // Same physical bottom-relative: worldH*32 - phaserY = 512 - 384 = 128 ✓
  const phaserY = 12 * 32;
  const unityFromPhaser = WorldH * 32 - phaserY;
  assert(near(u.y, unityFromPhaser), 'Unity Y == worldH*px - Phaser Y');
}

// Category
assert(normalizeCategory(undefined) === 'object', 'missing category → object');
assert(normalizeCategory('SOLID') === 'solid', 'category case');
assert(normalizeCategory('nope') === 'object', 'unknown category → object');

// Parse sample with node JSON (structural; C# MiniJson covered in Unity tests)
{
  const sample = {
    format: 'levelcraft/v1',
    name: 't',
    world: { wUnit: 20, hUnit: 10 },
    types: [{ name: 'ground', category: 'solid' }],
    elements: [
      {
        id: 'g',
        kind: 'rect',
        type: 'ground',
        xUnit: 0,
        yUnit: 8,
        wUnit: 10,
        hUnit: 2,
        path: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      },
    ],
  };
  const el = sample.elements[0];
  const cat = normalizeCategory(sample.types[0].category);
  assert(cat === 'solid', 'sample type solid');
  const { bl } = rectToUnity(el.xUnit, el.yUnit, el.wUnit, el.hUnit, sample.world.hUnit, 1);
  assert(near(bl.y, 0), 'sample ground sits on bottom (hUnit 10, y 8, h 2)');
  const p0 = pointToUnity(el.path[0].x, el.path[0].y, sample.world.hUnit, 1);
  assert(near(p0.y, 8), 'path point y-flip 10-2=8');
}

// Demo level from phaser example (shared fixture semantics)
{
  const fs = require('node:fs');
  const path = require('node:path');
  const demoPath = path.join(__dirname, '..', 'phaser', 'example', 'level-demo.json');
  if (fs.existsSync(demoPath)) {
    const demo = JSON.parse(fs.readFileSync(demoPath, 'utf8'));
    const worldH = demo.world.hUnit;
    const floor = demo.elements.find((e) => e.id === 'floor');
    const { bl, size } = rectToUnity(floor.xUnit, floor.yUnit, floor.wUnit, floor.hUnit, worldH, 1);
    assert(near(bl.y, 0) && near(size.y, 2), 'demo floor on Unity bottom');
    const spawn = pointToUnity(demo.spawnUnit.x, demo.spawnUnit.y, worldH, 1);
    assert(near(spawn.y, worldH - demo.spawnUnit.y), 'demo spawn Y-flip');
    const spikes = demo.elements.find((e) => e.id === 'spikes');
    const sc = rectToCellRange(spikes.xUnit, spikes.yUnit, spikes.wUnit, spikes.hUnit, worldH);
    // yUnit=13 h=1 worldH=16 → bottom=2 → cell y=2
    assert(sc.yMin === 2 && sc.yMax === 2 && sc.xMin === 11 && sc.xMax === 13, 'demo spikes cells');
  } else {
    console.log('SKIP  phaser demo fixture not found');
  }
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll Unity adapter coordinate checks passed.');
