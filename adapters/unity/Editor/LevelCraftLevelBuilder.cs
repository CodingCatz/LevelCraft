using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Tilemaps;
using LevelCraft.Unity;

namespace LevelCraft.Unity.Editor
{
    /// <summary>
    /// Builds a Unity hierarchy (Grid + Tilemaps + element GOs) from a parsed document.
    /// Uses official <see cref="UnityEngine.Tilemaps"/> components only.
    /// </summary>
    public static class LevelCraftLevelBuilder
    {
        #region 公開 API

        /// <summary>
        /// Import options.
        /// </summary>
        public sealed class Options
        {
            /// <summary>Unity units per LevelCraft unit (Grid.cellSize).</summary>
            public float Scale = 1f;

            /// <summary>Parent transform; null = scene root.</summary>
            public Transform Parent;

            /// <summary>Optional folder under Assets to store generated Tile assets; null = in-memory only.</summary>
            public string TileAssetFolder;
        }

        /// <summary>
        /// Build hierarchy under a new root GameObject. Returns the root.
        /// </summary>
        public static GameObject Build(LevelCraftDocument doc, Options options = null)
        {
            options = options ?? new Options();
            var scale = options.Scale <= 0f ? 1f : options.Scale;
            var catMap = doc.BuildCategoryMap();

            var rootGo = new GameObject(string.IsNullOrEmpty(doc.Name) ? "LevelCraftLevel" : doc.Name);
            if (options.Parent != null)
                rootGo.transform.SetParent(options.Parent, false);

            var root = rootGo.AddComponent<LevelCraftLevelRoot>();
            root.LevelName = doc.Name;
            root.WorldWUnit = doc.WorldWUnit;
            root.WorldHUnit = doc.WorldHUnit;
            root.Scale = scale;

            // Official 2D Tilemap stack: Grid → child Tilemaps
            var gridGo = new GameObject("Grid");
            gridGo.transform.SetParent(rootGo.transform, false);
            var grid = gridGo.AddComponent<Grid>();
            grid.cellSize = new Vector3(scale, scale, 1f);

            var solidMap = CreateTilemap(gridGo.transform, "Solids", sortingOrder: 0);
            SetupCompositeCollider(solidMap, isTrigger: false);

            var hazardMap = CreateTilemap(gridGo.transform, "Hazards", sortingOrder: 1);
            SetupCompositeCollider(hazardMap, isTrigger: true);

            var decorMap = CreateTilemap(gridGo.transform, "Decor", sortingOrder: -1);
            // decor: no collider

            var objectsRoot = new GameObject("Objects");
            objectsRoot.transform.SetParent(rootGo.transform, false);

            var tileCache = new Dictionary<string, Tile>();
            var elementById = new Dictionary<string, LevelCraftElement>();

            foreach (var el in doc.Elements)
            {
                var category = doc.ResolveCategory(el.TypeName, catMap);
                var typeDef = doc.FindType(el.TypeName);
                var color = LevelCraftDocument.ParseColor(typeDef?.ColorHex, CategoryFallbackColor(category));
                var isRect = el.HasSize || el.Kind == "rect";

                if (category == "solid" && isRect)
                {
                    var tile = GetOrCreateTile(tileCache, el.TypeName, color, options.TileAssetFolder, "solid");
                    FillRectTiles(solidMap, el, doc.WorldHUnit, tile);
                    continue;
                }

                if (category == "hazard" && isRect)
                {
                    var tile = GetOrCreateTile(tileCache, el.TypeName, color, options.TileAssetFolder, "hazard");
                    FillRectTiles(hazardMap, el, doc.WorldHUnit, tile);
                    // Also spawn metadata GO at center for id/links if needed
                    CreateElementGo(objectsRoot.transform, el, category, doc, scale, color, elementById, withCollider: false);
                    continue;
                }

                if (category == "decor" && isRect)
                {
                    var tile = GetOrCreateTile(tileCache, el.TypeName, color, options.TileAssetFolder, "decor");
                    FillRectTiles(decorMap, el, doc.WorldHUnit, tile);
                    continue;
                }

                // object / point solids / point hazards / point decor → GameObject + LevelCraftElement
                var useTrigger = category == "hazard" || category == "object";
                var useSolidBox = category == "solid" && !isRect;
                CreateElementGo(
                    objectsRoot.transform, el, category, doc, scale, color, elementById,
                    withCollider: useTrigger || useSolidBox,
                    colliderIsTrigger: useTrigger);
            }

            // Spawn marker
            if (doc.SpawnUnit.HasValue)
            {
                var s = doc.SpawnUnit.Value;
                var spawnGo = new GameObject("Spawn");
                spawnGo.transform.SetParent(rootGo.transform, false);
                var pos = LevelCraftDocument.PointToUnity(s.x, s.y, doc.WorldHUnit, scale);
                spawnGo.transform.position = new Vector3(pos.x, pos.y, 0f);
                root.Spawn = spawnGo.transform;
            }

            // Resolve links → component references
            foreach (var kv in elementById)
            {
                var comp = kv.Value;
                if (comp.LinkIds == null || comp.LinkIds.Length == 0) continue;
                var list = new List<LevelCraftElement>();
                foreach (var id in comp.LinkIds)
                {
                    if (id != null && elementById.TryGetValue(id, out var target))
                        list.Add(target);
                }
                comp.LinkedElements = list.ToArray();
            }

            return rootGo;
        }

        #endregion 公開 API

        #region Tilemap 建置

        static Tilemap CreateTilemap(Transform parent, string name, int sortingOrder)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var tm = go.AddComponent<Tilemap>();
            var renderer = go.AddComponent<TilemapRenderer>();
            renderer.sortingOrder = sortingOrder;
            return tm;
        }

        static void SetupCompositeCollider(Tilemap tilemap, bool isTrigger)
        {
            var go = tilemap.gameObject;
            var rb = go.AddComponent<Rigidbody2D>();
            rb.bodyType = RigidbodyType2D.Static;

            var tcol = go.AddComponent<TilemapCollider2D>();
            tcol.usedByComposite = true;

            var composite = go.AddComponent<CompositeCollider2D>();
            composite.geometryType = CompositeCollider2D.GeometryType.Polygons;
            composite.isTrigger = isTrigger;
        }

        static void FillRectTiles(Tilemap map, LevelCraftDocument.Element el, float worldH, Tile tile)
        {
            LevelCraftDocument.RectToCellRange(
                el.XUnit, el.YUnit, el.WUnit, el.HUnit, worldH,
                out var xMin, out var yMin, out var xMax, out var yMax);

            for (int x = xMin; x <= xMax; x++)
            {
                for (int y = yMin; y <= yMax; y++)
                    map.SetTile(new Vector3Int(x, y, 0), tile);
            }
        }

        static Tile GetOrCreateTile(
            Dictionary<string, Tile> cache,
            string typeName,
            Color color,
            string assetFolder,
            string prefix)
        {
            var key = prefix + ":" + (typeName ?? "unknown");
            if (cache.TryGetValue(key, out var existing)) return existing;

            var tile = ScriptableObject.CreateInstance<Tile>();
            tile.name = "LC_" + prefix + "_" + (typeName ?? "unknown");
            tile.color = color;
            tile.sprite = WhiteSprite();

            if (!string.IsNullOrEmpty(assetFolder))
            {
                EnsureFolder(assetFolder);
                var path = Path.Combine(assetFolder, tile.name + ".asset").Replace('\\', '/');
                var existingAsset = AssetDatabase.LoadAssetAtPath<Tile>(path);
                if (existingAsset != null)
                {
                    existingAsset.color = color;
                    existingAsset.sprite = tile.sprite;
                    EditorUtility.SetDirty(existingAsset);
                    cache[key] = existingAsset;
                    return existingAsset;
                }
                AssetDatabase.CreateAsset(tile, path);
            }

            cache[key] = tile;
            return tile;
        }

        static Sprite _whiteSprite;

        static Sprite WhiteSprite()
        {
            if (_whiteSprite != null) return _whiteSprite;
            var tex = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            tex.SetPixel(0, 0, Color.white);
            tex.Apply();
            tex.name = "LevelCraftWhite";
            _whiteSprite = Sprite.Create(tex, new Rect(0, 0, 1, 1), new Vector2(0.5f, 0.5f), 1f);
            _whiteSprite.name = "LevelCraftWhiteSprite";
            return _whiteSprite;
        }

        static void EnsureFolder(string assetFolder)
        {
            assetFolder = assetFolder.Replace('\\', '/').TrimEnd('/');
            if (AssetDatabase.IsValidFolder(assetFolder)) return;
            var parts = assetFolder.Split('/');
            var cur = parts[0];
            for (int i = 1; i < parts.Length; i++)
            {
                var next = cur + "/" + parts[i];
                if (!AssetDatabase.IsValidFolder(next))
                    AssetDatabase.CreateFolder(cur, parts[i]);
                cur = next;
            }
        }

        static Color CategoryFallbackColor(string category)
        {
            switch (category)
            {
                case "solid": return new Color(0.33f, 0.41f, 0.83f);
                case "hazard": return new Color(0.99f, 0.51f, 0.51f);
                case "decor": return new Color(0.41f, 0.83f, 0.57f);
                default: return new Color(0.31f, 0.82f, 0.77f);
            }
        }

        #endregion Tilemap 建置

        #region 元素 GameObject

        static void CreateElementGo(
            Transform parent,
            LevelCraftDocument.Element el,
            string category,
            LevelCraftDocument doc,
            float scale,
            Color color,
            Dictionary<string, LevelCraftElement> elementById,
            bool withCollider,
            bool colliderIsTrigger = true)
        {
            var name = string.IsNullOrEmpty(el.Id)
                ? (el.TypeName ?? "element")
                : el.Id + " (" + el.TypeName + ")";
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);

            Vector2 pos;
            Vector2 size;
            if (el.HasSize || el.Kind == "rect")
            {
                pos = LevelCraftDocument.RectCenterUnity(
                    el.XUnit, el.YUnit, el.WUnit, el.HUnit, doc.WorldHUnit, scale);
                size = new Vector2(el.WUnit * scale, el.HUnit * scale);
            }
            else
            {
                pos = LevelCraftDocument.PointToUnity(el.XUnit, el.YUnit, doc.WorldHUnit, scale);
                size = new Vector2(scale, scale);
            }
            go.transform.position = new Vector3(pos.x, pos.y, 0f);

            // Visible gizmo-like sprite for edit-time clarity
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = WhiteSprite();
            sr.color = new Color(color.r, color.g, color.b, category == "decor" ? 0.5f : 0.85f);
            go.transform.localScale = new Vector3(Mathf.Max(0.05f, size.x), Mathf.Max(0.05f, size.y), 1f);

            if (withCollider)
            {
                var box = go.AddComponent<BoxCollider2D>();
                box.isTrigger = colliderIsTrigger;
                // scale already applied on transform; collider size 1×1 in local
                box.size = Vector2.one;
            }

            var comp = go.AddComponent<LevelCraftElement>();
            comp.Id = el.Id;
            comp.TypeName = el.TypeName;
            comp.Category = category;
            comp.Description = el.Description;

            if (el.Props.Count > 0)
            {
                var keys = new string[el.Props.Count];
                var vals = new string[el.Props.Count];
                int i = 0;
                foreach (var kv in el.Props)
                {
                    keys[i] = kv.Key;
                    vals[i] = kv.Value;
                    i++;
                }
                comp.PropKeys = keys;
                comp.PropValues = vals;
            }

            if (el.Links.Count > 0)
                comp.LinkIds = el.Links.ToArray();

            if (el.PathUnits.Count > 0)
            {
                var path = new Vector2[el.PathUnits.Count];
                for (int i = 0; i < el.PathUnits.Count; i++)
                    path[i] = LevelCraftDocument.PathPointToUnity(el.PathUnits[i], doc.WorldHUnit, scale);
                comp.Path = path;
            }

            if (!string.IsNullOrEmpty(el.Id))
                elementById[el.Id] = comp;
        }

        #endregion 元素 GameObject
    }
}
