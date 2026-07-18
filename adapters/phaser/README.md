# LevelCraft · Phaser 3 adapter

Official zero-dependency ES module that loads `levelcraft/v1` JSON into a Phaser 3 Arcade scene.

```js
import { loadLevelCraft } from './levelcraft-phaser.js';

const level = loadLevelCraft(scene, json, { unitPx: 32 });
// level.solids   — StaticGroup (solid category)
// level.hazards  — Group of Zones (isHazard = true)
// level.objects  — Group of Zones + full metadata
// level.decor    — pure data records (no body)
// level.spawn    — { x, y } px or null
// level.byId     — Map<id, GameObject|record>
// level.resolveLinks(el) — follow links[] to entities
```

Requires Arcade Physics on the scene:

```js
physics: { default: 'arcade', arcade: { gravity: { y: 980 } } }
```

## API

### `loadLevelCraft(scene, json, options?)`

| option | default | meaning |
|--------|---------|---------|
| `unitPx` | `32` | pixels per LevelCraft unit |
| `pointSizeUnit` | `1` | default hitbox size (units) for point elements |
| `debug` | `false` | draw translucent rects for zones |
| `fillAlpha` | `0` / `0.4` if debug | alpha for solid rectangles |
| `solidColor` / `hazardColor` / `objectColor` | palette defaults | debug / fill colors |

Returns `{ solids, hazards, objects, decor, spawn, world, unitPx, name, byId, resolveLinks, data }`.

### Pure helpers (Node-testable, no Phaser)

Exported from the same file:

- `normalizeCategory(cat)`
- `buildCategoryMap(types)`
- `resolveCategory(typeName, map)`
- `toPx(unit, unitPx)` / `pathToPx(path, unitPx)`
- `transformLevelData(json, options)` — full pure split into solids/hazards/objects/decor

Self-check:

```bash
node adapters/phaser/check.cjs
```

## Coordinates

Editor and Phaser both use **Y-down, top-left origin for elements**. Conversion is only:

```
px = unit * unitPx
```

Bodies are placed at the **center** (`cx = x + w/2`) because Phaser Arcade GameObjects default to origin 0.5.

## Category routing

Reads `types[].category` (SSOT from the editor since v0.15). Element looks up its `type` name:

| category | Phaser result |
|----------|----------------|
| `solid` | static physics body (rectangle) |
| `hazard` | static Zone + `isHazard = true` |
| `object` | static Zone + metadata (`id` / `type` / `props` / `links` / `description` / `path`) |
| `decor` | data only — no body |

Missing or unknown category → **`object`** (old files do not throw). Name-based guessing is intentionally **not** done here; put categories in the JSON.

Metadata is on the GameObject via `setData(...)` and convenience fields: `lcId`, `lcType`, `lcCategory`, `lcProps`, `lcLinks`, `lcPath`.

## Links & path

```js
const door = level.resolveLinks(switchGo); // → [doorGo, ...]
```

`path` on an element becomes an array of `{ x, y }` in **pixels** (export path points are unit `{ x, y }`). Tweens / moving platforms are the game’s job.

## Example demo

```bash
# from repo root
python -m http.server 8080
# open http://localhost:8080/adapters/phaser/example/
```

`example/` uses Phaser from CDN; the adapter file itself has **no** dependency on Phaser at import time for the pure helpers.

## What this adapter does *not* do

- No damage / win / key logic
- No automatic colliders beyond creating groups (you wire `collider` / `overlap`)
- No tilemap conversion (see the Unity adapter for Tilemap-oriented import)
- No npm package — copy `levelcraft-phaser.js` into your game
