#!/usr/bin/env node
/**
 * Phaser adapter pure-data self-check — zero Phaser dependency.
 *   node adapters/phaser/check.cjs
 *
 * Dynamically imports transform helpers from levelcraft-phaser.js and asserts
 * category routing, unit→px, links, path, and old-file fallback.
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
  const modUrl = pathToFileURL(path.join(__dirname, 'levelcraft-phaser.js')).href;
  const {
    normalizeCategory,
    buildCategoryMap,
    resolveCategory,
    toPx,
    pathToPx,
    transformLevelData,
  } = await import(modUrl);

  let failed = 0;
  function assert(cond, msg) {
    if (!cond) {
      failed += 1;
      console.error('FAIL ', msg);
    } else {
      console.log('PASS ', msg);
    }
  }

  // --- normalizeCategory ---
  assert(normalizeCategory('solid') === 'solid', 'normalize solid');
  assert(normalizeCategory('HAZARD') === 'hazard', 'normalize case-insensitive');
  assert(normalizeCategory(undefined) === 'object', 'normalize missing → object');
  assert(normalizeCategory('nope') === 'object', 'normalize unknown → object');

  // --- category map / resolve ---
  const map = buildCategoryMap([
    { name: 'ground', category: 'solid' },
    { name: 'spike', category: 'hazard' },
    { name: 'switch', category: 'object' },
    { name: 'bush', category: 'decor' },
    { name: 'legacy' }, // no category
  ]);
  assert(resolveCategory('ground', map) === 'solid', 'resolve ground solid');
  assert(resolveCategory('spike', map) === 'hazard', 'resolve spike hazard');
  assert(resolveCategory('bush', map) === 'decor', 'resolve decor');
  assert(resolveCategory('legacy', map) === 'object', 'type present but no category → object');
  assert(resolveCategory('unknownType', map) === 'object', 'unknown type → object (no throw)');
  assert(resolveCategory('ground', new Map()) === 'object', 'empty map → object fallback');

  // --- unit / path ---
  assert(toPx(3, 32) === 96, 'toPx 3*32=96');
  const pathPx = pathToPx(
    [
      { x: 1, y: 2 },
      { xUnit: 4, yUnit: 5 },
    ],
    10,
  );
  assert(
    pathPx && pathPx[0].x === 10 && pathPx[0].y === 20 && pathPx[1].x === 40 && pathPx[1].y === 50,
    'pathToPx supports {x,y} and {xUnit,yUnit}',
  );

  // --- full transform with categories ---
  const level = {
    format: 'levelcraft/v1',
    name: 'check-level',
    world: { wUnit: 20, hUnit: 10 },
    spawnUnit: { x: 2, y: 7 },
    types: [
      { name: 'ground', category: 'solid', shape: 'rect' },
      { name: 'spike', category: 'hazard', shape: 'rect' },
      { name: 'switch', category: 'object', shape: 'point' },
      { name: 'door', category: 'object', shape: 'point' },
      { name: 'bush', category: 'decor', shape: 'rect' },
    ],
    elements: [
      {
        id: 'g1',
        kind: 'rect',
        type: 'ground',
        xUnit: 0,
        yUnit: 8,
        wUnit: 10,
        hUnit: 2,
      },
      {
        id: 's1',
        kind: 'rect',
        type: 'spike',
        xUnit: 5,
        yUnit: 7,
        wUnit: 2,
        hUnit: 1,
      },
      {
        id: 'sw1',
        kind: 'point',
        type: 'switch',
        xUnit: 3,
        yUnit: 6,
        links: ['door1'],
        props: { once: 'true' },
      },
      {
        id: 'door1',
        kind: 'point',
        type: 'door',
        xUnit: 15,
        yUnit: 6,
      },
      {
        id: 'b1',
        kind: 'rect',
        type: 'bush',
        xUnit: 8,
        yUnit: 6,
        wUnit: 1,
        hUnit: 1,
      },
      {
        id: 'plat1',
        kind: 'rect',
        type: 'ground',
        xUnit: 4,
        yUnit: 4,
        wUnit: 3,
        hUnit: 1,
        path: [
          { x: 6, y: 4 },
          { x: 8, y: 4 },
        ],
      },
    ],
  };

  const t = transformLevelData(level, { unitPx: 32 });
  assert(t.solids.length === 2, `solids count (got ${t.solids.length})`);
  assert(t.hazards.length === 1, `hazards count (got ${t.hazards.length})`);
  assert(t.objects.length === 2, `objects count (got ${t.objects.length})`);
  assert(t.decor.length === 1, `decor count (got ${t.decor.length})`);
  assert(t.spawn && t.spawn.x === 64 && t.spawn.y === 224, 'spawn px 2*32,7*32');
  assert(t.world.w === 640 && t.world.h === 320, 'world px');

  const g1 = t.byId.get('g1');
  assert(g1 && g1.x === 0 && g1.y === 256 && g1.w === 320 && g1.h === 64, 'ground top-left + size px');
  assert(g1.cx === 160 && g1.cy === 288, 'ground center px');

  const links = t.resolveLinks(t.byId.get('sw1'));
  assert(links.length === 1 && links[0].id === 'door1', 'resolveLinks switch → door record');
  assert(t.resolveLinks('sw1')[0].id === 'door1', 'resolveLinks by id string');

  const plat = t.byId.get('plat1');
  assert(
    plat.path && plat.path[0].x === 192 && plat.path[0].y === 128 && plat.path[1].x === 256,
    'path converted to px',
  );
  assert(t.decor[0].id === 'b1' && t.decor[0].category === 'decor', 'decor is data-only bucket');

  // --- old file: no types[].category, no crash, everything → object ---
  const oldLevel = {
    format: 'levelcraft/v1',
    name: 'old',
    world: { wUnit: 10, hUnit: 10 },
    spawnUnit: { x: 1, y: 1 },
    types: [
      { name: 'ground', shape: 'rect' },
      { name: 'spike', shape: 'rect' },
    ],
    elements: [
      { id: 'a', kind: 'rect', type: 'ground', xUnit: 0, yUnit: 0, wUnit: 2, hUnit: 1 },
      { id: 'b', kind: 'rect', type: 'spike', xUnit: 2, yUnit: 0, wUnit: 1, hUnit: 1 },
    ],
  };
  const old = transformLevelData(oldLevel, { unitPx: 16 });
  assert(old.solids.length === 0, 'old file: no solid without category');
  assert(old.hazards.length === 0, 'old file: no hazard without category');
  assert(old.objects.length === 2, 'old file: all elements fallback object');
  assert(old.byId.get('a').category === 'object', 'old ground → object');

  // --- bad format throws ---
  let threw = false;
  try {
    transformLevelData({ format: 'other/v1', world: {}, elements: [] });
  } catch {
    threw = true;
  }
  assert(threw, 'unsupported format throws');

  if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll Phaser adapter pure-data checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
