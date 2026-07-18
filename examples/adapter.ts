/**
 * 範例轉接器：把 levelcraft/v1 轉成某個平台遊戲的關卡結構。
 *
 * v0.15+：優先讀 types[].category（編輯器 SSOT）；缺省才 fallback 本表（舊檔相容）。
 * 換遊戲：仍可改 fallback 表，或完全信任 JSON 裡的 category。
 */

// ---- 編輯器輸出型別（levelcraft/v1）----
type GameCategory = 'solid' | 'hazard' | 'object' | 'decor';

interface UnitType {
  name: string;
  color?: string;
  shape?: 'rect' | 'point';
  /** 遊戲語意；舊檔可能缺，此時走 CATEGORY fallback */
  category?: GameCategory | string;
  movable?: boolean;
  description?: string;
}

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
  types?: UnitType[];
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

/** 舊檔 fallback：JSON 無 types[].category 時才用。新檔應以編輯器 category 為準。 */
const CATEGORY: Record<string, GameCategory> = {
  ground: 'solid', oneway: 'solid', wall: 'solid', ladder: 'solid',
  spike: 'hazard', saw: 'hazard',
  goal: 'object', key: 'object', door: 'object', switch: 'object', checkpoint: 'object',
};

function resolveCategory(typeName: string, types?: UnitType[]): GameCategory {
  const def = types?.find(t => t.name === typeName);
  const raw = def?.category;
  if (raw === 'solid' || raw === 'hazard' || raw === 'object' || raw === 'decor') return raw;
  return CATEGORY[typeName] ?? 'object';
}

export function toGameLevel(lv: UnitLevel): GameLevel {
  const solids: SolidConfig[] = [];
  const hazards: HazardConfig[] = [];
  const objects: ObjectConfig[] = [];

  for (const e of lv.elements) {
    const cat = resolveCategory(e.type, lv.types);
    if (cat === 'decor') continue; // 裝飾：無碰撞、不進 solids/hazards/objects
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
