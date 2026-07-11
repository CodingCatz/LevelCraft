/**
 * 範例轉接器：把 unit-level/v1 轉成某個平台遊戲的關卡結構。
 *
 * 重點：編輯器輸出是「中性」的（只有 type 字串 + 單位座標）。
 * 「哪個 type 算實心地形、哪個致死、哪個是互動物件」是遊戲的決定，
 * 全集中在下面這張 CATEGORY 對照表。換一款遊戲，只改這張表。
 */

// ---- 編輯器輸出型別（unit-level/v1）----
interface UnitElement {
  id: string;
  kind: 'rect' | 'point';
  type: string;
  xUnit: number;
  yUnit: number;
  wUnit?: number;
  hUnit?: number;
  props?: Record<string, string>;
  links?: string[];
}
interface UnitLevel {
  format: string;
  name: string;
  world: { wUnit: number; hUnit: number };
  spawnUnit: { x: number; y: number };
  elements: UnitElement[];
}

// ---- 遊戲端要的結構（示意，對齊本專案 LevelTypes）----
interface SolidConfig { xUnit: number; yUnit: number; wUnit: number; hUnit: number; }
interface HazardConfig { type: string; xUnit: number; yUnit: number; wUnit: number; hUnit: number; }
interface ObjectConfig {
  id: string; type: string; xUnit: number; yUnit: number;
  wUnit?: number; hUnit?: number; targetId?: string; props?: Record<string, string>;
}
interface GameLevel {
  id: string; name: string;
  worldWidthUnit: number; worldHeightUnit: number;
  spawnUnit: { x: number; y: number };
  solids: SolidConfig[];
  hazards: HazardConfig[];
  objects: ObjectConfig[];
}

/** 語意對照表：把中性 type 分到遊戲的三大類。換遊戲只改這裡。 */
const CATEGORY: Record<string, 'solid' | 'hazard' | 'object'> = {
  ground: 'solid', oneway: 'solid', wall: 'solid', ladder: 'solid',
  spike: 'hazard', saw: 'hazard',
  goal: 'object', key: 'object', door: 'object', switch: 'object', checkpoint: 'object',
};

export function toGameLevel(lv: UnitLevel): GameLevel {
  const solids: SolidConfig[] = [];
  const hazards: HazardConfig[] = [];
  const objects: ObjectConfig[] = [];

  for (const e of lv.elements) {
    const cat = CATEGORY[e.type] ?? 'object';
    if (cat === 'solid' && e.kind === 'rect') {
      solids.push({ xUnit: e.xUnit, yUnit: e.yUnit, wUnit: e.wUnit!, hUnit: e.hUnit! });
    } else if (cat === 'hazard' && e.kind === 'rect') {
      hazards.push({ type: e.type, xUnit: e.xUnit, yUnit: e.yUnit, wUnit: e.wUnit!, hUnit: e.hUnit! });
    } else {
      objects.push({
        id: e.id, type: e.type, xUnit: e.xUnit, yUnit: e.yUnit,
        wUnit: e.wUnit, hUnit: e.hUnit,
        targetId: e.links?.[0],           // 開關→門：取第一個連動當 targetId
        props: e.props,
      });
    }
  }

  return {
    id: lv.name, name: lv.name,
    worldWidthUnit: lv.world.wUnit, worldHeightUnit: lv.world.hUnit,
    spawnUnit: lv.spawnUnit,
    solids, hazards, objects,
  };
}

// 遊戲載入時：把單位換算成像素只是 xUnit * UNIT_PX，UNIT_PX 由遊戲定義。
// 例：const px = cfg.xUnit * 108;
