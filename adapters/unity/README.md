# LevelCraft · Unity adapter (2D Tilemap)

Official C# importer: `levelcraft/v1` JSON → Unity hierarchy using **only** built-in
`UnityEngine.Tilemaps` (`Grid` / `Tilemap` / `TilemapCollider2D` / `CompositeCollider2D`).
No third-party packages.

Copy this folder into your Unity project:

```
Assets/LevelCraft/          ← rename/move as you like
  Runtime/                  ← player builds (+ Runtime.asmdef)
  Editor/                   ← editor-only (+ Editor.asmdef → Runtime)
  Tests/Editor/             ← optional EditMode tests (+ Tests.asmdef → Editor)
```

**Important:** EditMode tests must stay under `Tests/Editor/` and reference the Editor
assembly. Putting them under bare `Tests/` compiles them as **runtime** code, which
cannot see `LevelCraft.Unity.Editor` (CS0234).

Requires **Unity 2021.3 LTS+** with **2D Tilemap** (`com.unity.2d.tilemap`, included in 2D template).

## Import workflow (recommended)

1. Open a scene.
2. **Assets → LevelCraft → Import Level JSON…** (or **GameObject → LevelCraft → Import Level JSON…**).
3. Pick a **levelcraft/v1** `.json` (editor Export, or `Fixtures/level-demo.json`).

### Which JSON file?

| File | Import? |
|------|---------|
| Editor **Export** / `data/levelcraft/celeste__*.json` / `Fixtures/level-demo.json` | ✅ `format: levelcraft/v1` + `world` + `elements` |
| `data/intermediate/*.json` room payload (`solids` / `entities`) | ❌ pipeline mid-file — convert first |
| `data/intermediate/_index.json` | ❌ room list, not a level |

Mis-picking intermediate used to surface only as **Parse failed: Missing world**. From 0.17.2 the dialog names the intermediate kind and points at the converted path.

Why menu instead of forcing a custom extension?

- The editor exports plain `.json`; renaming every file is friction.
- Double extensions (`.levelcraft.json`) are awkward for ScriptedImporter across Unity versions.

**Optional:** rename a file to `*.levelcraft` to use the ScriptedImporter (Inspector scale field).

**Selected asset:** right-click a project `.json` → **LevelCraft → Import Selected JSON as Level**
(also writes coloured tile assets under `Assets/LevelCraftTiles/`).

## What you get

```
{LevelName}                         LevelCraftLevelRoot
├── Grid                            Grid (cellSize = scale)
│   ├── Solids                      Tilemap + TilemapCollider2D + CompositeCollider2D
│   ├── Hazards                     Tilemap + trigger CompositeCollider2D
│   └── Decor                       Tilemap (no collider)
├── Objects/
│   └── {id} (type)                 SpriteRenderer + LevelCraftElement [+ BoxCollider2D]
└── Spawn                           empty marker Transform
```

| `types[].category` | Result |
|--------------------|--------|
| `solid` rect | Filled cells on **Solids** Tilemap (composite solid collider) |
| `hazard` rect | Cells on **Hazards** Tilemap (trigger) + metadata GO |
| `object` / points | Individual GO + `LevelCraftElement` |
| `decor` rect | Cells on **Decor** Tilemap (visual only) |
| missing category | **`object`** (old files never throw) |

After import you can keep editing solids/hazards/decor with Unity’s **Tile Palette** / Tilemap tools — that is the official 2D map toolchain hookup.

### `LevelCraftElement`

- `Id`, `TypeName`, `Category`, `Description`
- `PropKeys` / `PropValues` (dictionary-safe serialization)
- `LinkIds` + resolved `LinkedElements[]`
- `Path` as `Vector2[]` in **Unity world space** (Y-up)

## Coordinate conversion

LevelCraft: **Y-down**, rect origin = **top-left**.  
Unity / Tilemap: **Y-up**, cells grow up from bottom-left of the world.

```
// point
unityX = xUnit * scale
unityY = (worldHUnit - yUnit) * scale

// rect (bottom-left + size)
unityX = xUnit * scale
unityY = (worldHUnit - yUnit - hUnit) * scale
unityW = wUnit * scale
unityH = hUnit * scale
```

`scale` defaults to **1** (1 LevelCraft unit = 1 Unity unit = 1 tile cell).
Formulas are documented in `Editor/LevelCraftDocument.cs` and covered by:

```bash
# from LevelCraft repo root (no Unity needed)
node adapters/unity/check-coords.cjs
```

Unity EditMode tests: `Tests/Editor/LevelCraftCoordTests.cs` (needs **Test Framework** package;
assembly only builds when `UNITY_INCLUDE_TESTS` is defined).

## JSON parsing

Hand-rolled minimal parser in `LevelCraftDocument` / `MiniJson` — **not** `JsonUtility`
(cannot represent `props` string dictionaries). Zero third-party MiniJSON package.

## Not in scope

- No gameplay (damage, win, keys) — only structure + metadata
- No automatic scene lighting / Cinemachine
- Not a replacement for authoring levels inside Unity; it **bootstraps** a Tilemap you can continue editing

## Verify

| Check | How |
|-------|-----|
| Coordinates / category fallback | `node adapters/unity/check-coords.cjs` |
| Parse links/path / reject intermediate / demo structure | Unity Test Runner → EditMode → `LevelCraftCoordTests` |
| Headless import smoke | `Unity -batchmode -projectPath <proj> -executeMethod LevelCraft.Unity.Editor.LevelCraftMenu.BatchImportSmoke` (needs `Fixtures/level-demo.json` under Assets copy) |
| Tilemap import | Menu import in a 2D project; open Tile Palette on Solids |

## Phaser parity note

Phaser keeps Y-down (`px = unit * unitPx`). Unity flips Y as above.
Horizontal axis and unit sizes match; vertical: `unityY = worldH*scale - phaserY` for points.
