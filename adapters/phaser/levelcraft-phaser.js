/**
 * LevelCraft official Phaser 3 loader — zero-dependency single-file ES module.
 *
 * Converts levelcraft/v1 JSON into arcade StaticGroup / Zone groups.
 * Does NOT encode game rules (how hazards kill, how switches open doors, etc.).
 *
 * Usage:
 *   import { loadLevelCraft } from './levelcraft-phaser.js';
 *   const level = loadLevelCraft(scene, json, { unitPx: 32 });
 *   // level.solids: StaticGroup
 *   // level.hazards / level.objects: Group of Zones
 *   // level.spawn: { x, y } px (or null)
 *   // level.resolveLinks(el) → game objects / records
 */

/** @typedef {'solid'|'hazard'|'object'|'decor'} GameCategory */

const VALID_CATEGORIES = new Set(['solid', 'hazard', 'object', 'decor']);

/**
 * Normalize a raw category string; missing / unknown → `object`.
 * @param {unknown} cat
 * @returns {GameCategory}
 */
export function normalizeCategory(cat) {
  if (typeof cat !== 'string') return 'object';
  const c = cat.trim().toLowerCase();
  return VALID_CATEGORIES.has(c) ? /** @type {GameCategory} */ (c) : 'object';
}

/**
 * Build typeName → category map from types[].
 * @param {Array<{ name?: string, category?: string }>|undefined|null} types
 * @returns {Map<string, GameCategory>}
 */
export function buildCategoryMap(types) {
  const map = new Map();
  if (!Array.isArray(types)) return map;
  for (const t of types) {
    if (t && typeof t.name === 'string' && t.name) {
      map.set(t.name, normalizeCategory(t.category));
    }
  }
  return map;
}

/**
 * Resolve category for an element type. Missing map entry → `object` (old files).
 * @param {string} typeName
 * @param {Map<string, GameCategory>|undefined|null} categoryMap
 * @returns {GameCategory}
 */
export function resolveCategory(typeName, categoryMap) {
  if (categoryMap && categoryMap.has(typeName)) return categoryMap.get(typeName);
  return 'object';
}

/**
 * Unit → pixel scalar.
 * @param {number} unit
 * @param {number} unitPx
 */
export function toPx(unit, unitPx) {
  return Number(unit) * unitPx;
}

/**
 * Path points in export use unit `{ x, y }` (not xUnit/yUnit).
 * @param {Array<{ x?: number, y?: number, xUnit?: number, yUnit?: number }>|undefined|null} path
 * @param {number} unitPx
 * @returns {Array<{ x: number, y: number }>|undefined}
 */
export function pathToPx(path, unitPx) {
  if (!Array.isArray(path) || path.length === 0) return undefined;
  return path.map((p) => ({
    x: toPx(p.xUnit != null ? p.xUnit : p.x, unitPx),
    y: toPx(p.yUnit != null ? p.yUnit : p.y, unitPx),
  }));
}

/**
 * Pure data transform (no Phaser). Safe to run under Node for asserts.
 *
 * @param {object} json levelcraft/v1 document
 * @param {{ unitPx?: number, pointSizeUnit?: number }} [options]
 * @returns {import('./levelcraft-phaser.js').TransformedLevel}
 */
export function transformLevelData(json, options = {}) {
  const unitPx = options.unitPx ?? 32;
  const pointSizeUnit = options.pointSizeUnit ?? 1;

  if (!json || typeof json !== 'object') {
    throw new Error('loadLevelCraft: expected a levelcraft/v1 JSON object');
  }
  if (json.format != null && json.format !== 'levelcraft/v1') {
    throw new Error(`loadLevelCraft: unsupported format "${json.format}" (need levelcraft/v1)`);
  }
  if (!json.world || !Array.isArray(json.elements)) {
    throw new Error('loadLevelCraft: missing world or elements');
  }

  const categoryMap = buildCategoryMap(json.types);
  /** @type {Map<string, object>} */
  const byId = new Map();
  /** @type {object[]} */
  const solids = [];
  /** @type {object[]} */
  const hazards = [];
  /** @type {object[]} */
  const objects = [];
  /** @type {object[]} */
  const decor = [];

  for (const el of json.elements) {
    if (!el || typeof el !== 'object') continue;
    const category = resolveCategory(el.type, categoryMap);
    const isRect =
      el.kind === 'rect' ||
      (el.wUnit != null && el.hUnit != null && Number(el.wUnit) > 0 && Number(el.hUnit) > 0);

    const x = toPx(el.xUnit ?? 0, unitPx);
    const y = toPx(el.yUnit ?? 0, unitPx);
    const w = isRect ? toPx(el.wUnit, unitPx) : toPx(pointSizeUnit, unitPx);
    const h = isRect ? toPx(el.hUnit, unitPx) : toPx(pointSizeUnit, unitPx);
    const path = pathToPx(el.path, unitPx);

    const record = {
      id: el.id,
      type: el.type,
      kind: el.kind || (isRect ? 'rect' : 'point'),
      category,
      /** top-left px */
      x,
      y,
      w,
      h,
      /** center px (Phaser body origin) */
      cx: x + w / 2,
      cy: y + h / 2,
      props: el.props && typeof el.props === 'object' ? { ...el.props } : undefined,
      links: Array.isArray(el.links) ? el.links.slice() : undefined,
      description: el.description,
      path,
      raw: el,
    };

    if (record.id != null) byId.set(String(record.id), record);

    if (category === 'decor') {
      decor.push(record);
    } else if (category === 'solid') {
      // solid rect → static body; solid point uses default pointSize hitbox
      solids.push(record);
    } else if (category === 'hazard') {
      hazards.push(record);
    } else {
      objects.push(record);
    }
  }

  const spawn =
    json.spawnUnit && typeof json.spawnUnit === 'object'
      ? {
          x: toPx(json.spawnUnit.x ?? 0, unitPx),
          y: toPx(json.spawnUnit.y ?? 0, unitPx),
        }
      : null;

  const world = {
    wUnit: json.world.wUnit,
    hUnit: json.world.hUnit,
    w: toPx(json.world.wUnit ?? 0, unitPx),
    h: toPx(json.world.hUnit ?? 0, unitPx),
  };

  /**
   * Resolve link target ids on a record / element to pure records.
   * @param {string|object} elOrId
   * @returns {object[]}
   */
  function resolveLinks(elOrId) {
    let links;
    if (typeof elOrId === 'string') {
      links = byId.get(elOrId)?.links;
    } else if (elOrId && typeof elOrId === 'object') {
      links =
        elOrId.links ||
        (elOrId.id != null ? byId.get(String(elOrId.id))?.links : undefined) ||
        elOrId.raw?.links;
    }
    if (!Array.isArray(links)) return [];
    return links.map((id) => byId.get(String(id))).filter(Boolean);
  }

  return {
    name: json.name,
    unitPx,
    world,
    spawn,
    solids,
    hazards,
    objects,
    decor,
    byId,
    resolveLinks,
    categoryMap,
    raw: json,
  };
}

/**
 * Attach LevelCraft metadata onto a Phaser GameObject.
 * @param {Phaser.GameObjects.GameObject} go
 * @param {object} rec
 */
function attachMeta(go, rec) {
  if (typeof go.setData === 'function') {
    go.setData('id', rec.id);
    go.setData('type', rec.type);
    go.setData('category', rec.category);
    go.setData('props', rec.props);
    go.setData('links', rec.links);
    go.setData('description', rec.description);
    go.setData('path', rec.path);
    go.setData('lc', rec);
  }
  go.lcId = rec.id;
  go.lcType = rec.type;
  go.lcCategory = rec.category;
  go.lcProps = rec.props;
  go.lcLinks = rec.links;
  go.lcPath = rec.path;
  if (rec.category === 'hazard') go.isHazard = true;
  return go;
}

/**
 * Load levelcraft/v1 into a Phaser 3 scene (Arcade Physics required).
 *
 * @param {Phaser.Scene} scene
 * @param {object} json
 * @param {{
 *   unitPx?: number,
 *   pointSizeUnit?: number,
 *   debug?: boolean,
 *   solidColor?: number,
 *   hazardColor?: number,
 *   objectColor?: number,
 *   fillAlpha?: number,
 * }} [options]
 */
export function loadLevelCraft(scene, json, options = {}) {
  const data = transformLevelData(json, options);
  const debug = options.debug === true;
  const fillAlpha = options.fillAlpha != null ? options.fillAlpha : debug ? 0.4 : 0;
  const solidColor = options.solidColor ?? 0x5568d3;
  const hazardColor = options.hazardColor ?? 0xfc8181;
  const objectColor = options.objectColor ?? 0x4fd1c5;

  if (!scene || !scene.physics || typeof scene.physics.add !== 'object') {
    throw new Error(
      'loadLevelCraft requires a Phaser scene with Arcade Physics (config.physics.default = "arcade")',
    );
  }

  const solids = scene.physics.add.staticGroup();
  const hazards = scene.add.group();
  const objects = scene.add.group();
  /** @type {Map<string, object>} id → GameObject or pure record (decor) */
  const byId = new Map();

  for (const rec of data.solids) {
    const body = scene.add.rectangle(rec.cx, rec.cy, rec.w, rec.h, solidColor, fillAlpha);
    scene.physics.add.existing(body, true);
    solids.add(body);
    attachMeta(body, rec);
    rec.gameObject = body;
    if (rec.id != null) byId.set(String(rec.id), body);
  }

  for (const rec of data.hazards) {
    const zone = scene.add.zone(rec.cx, rec.cy, rec.w, rec.h);
    scene.physics.add.existing(zone, true);
    zone.isHazard = true;
    hazards.add(zone);
    attachMeta(zone, rec);
    if (debug) {
      const gfx = scene.add.rectangle(rec.cx, rec.cy, rec.w, rec.h, hazardColor, 0.35);
      zone.setData('debugGfx', gfx);
    }
    rec.gameObject = zone;
    if (rec.id != null) byId.set(String(rec.id), zone);
  }

  for (const rec of data.objects) {
    const zone = scene.add.zone(rec.cx, rec.cy, rec.w, rec.h);
    scene.physics.add.existing(zone, true);
    objects.add(zone);
    attachMeta(zone, rec);
    if (debug) {
      const gfx = scene.add.rectangle(rec.cx, rec.cy, rec.w, rec.h, objectColor, 0.35);
      zone.setData('debugGfx', gfx);
    }
    rec.gameObject = zone;
    if (rec.id != null) byId.set(String(rec.id), zone);
  }

  for (const rec of data.decor) {
    // decor: data only — no body
    if (rec.id != null) byId.set(String(rec.id), rec);
  }

  /**
   * Resolve links to Phaser entities (or decor records).
   * Accepts a game object, pure record, or id string.
   * @param {string|object} el
   * @returns {object[]}
   */
  function resolveLinks(el) {
    let links;
    if (typeof el === 'string') {
      const hit = byId.get(el);
      links =
        hit?.lcLinks ||
        (typeof hit?.getData === 'function' ? hit.getData('links') : undefined) ||
        hit?.links ||
        data.byId.get(el)?.links;
    } else if (el && typeof el === 'object') {
      links =
        el.lcLinks ||
        (typeof el.getData === 'function' ? el.getData('links') : undefined) ||
        el.links ||
        (el.lcId != null ? data.byId.get(String(el.lcId))?.links : undefined) ||
        (el.id != null ? data.byId.get(String(el.id))?.links : undefined);
    }
    if (!Array.isArray(links)) return [];
    return links.map((id) => byId.get(String(id))).filter(Boolean);
  }

  return {
    solids,
    hazards,
    objects,
    decor: data.decor,
    spawn: data.spawn,
    world: data.world,
    unitPx: data.unitPx,
    name: data.name,
    byId,
    resolveLinks,
    /** pure transform (records without requiring Phaser) */
    data,
  };
}

export default loadLevelCraft;
